import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { AlertTriangle } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { compressImageFile } from '@/lib/compressImage';
import ImageViewerModal from '@/components/ImageViewerModal';
import DayInfoBanner from '@/components/DayInfoBanner';
import { useTransactionForm } from '@/hooks/useTransactionForm';
import { useTransactionRefs } from '@/hooks/useTransactionRefs';
import { useTransactionDraft } from '@/hooks/useTransactionDraft';
import { useTransactionImages } from '@/hooks/useTransactionImages';
import { submitTransaction } from '@/lib/transactionApi';
import { FormTransaksiBasicFields } from './FormTransaksiBasicFields';
import { FormTransaksiPayment } from './FormTransaksiPayment';
import { FormTransaksiMarketing } from './FormTransaksiMarketing';
import { FormTransaksiFiles } from './FormTransaksiFiles';
import { FormTransaksiConfirm } from './FormTransaksiConfirm';
import { FormTransaksiActions } from './FormTransaksiActions';

/**
 * FormTransaksiPage — Main form orchestrator for single transaction input.
 *
 * Props:
 *  onDataUpdate      – Called after successful submit (legacy)
 *  onSuccess         – Called after successful submit (all modes)
 *  roleMode          – 'karyawan' | 'admin' | 'super_admin' (default: from userRole)
 *  requireMarketing  – Force marketing field required (default: false)
 *  allowReferenceManagement – Allow create/delete references (default: isAdmin || isSuperAdmin)
 *  defaultInputBy    – Default value for input_by field
 *  embedded          – If true, no page wrapper (inline usage)
 */
export function FormTransaksiPage({
  onDataUpdate,
  onSuccess,
  roleMode,
  requireMarketing = false,
  allowReferenceManagement,
  defaultInputBy = '',
  embedded = false,
}) {
  const { user, userRole, isAdmin, isSuperAdmin } = useAuth();
  const effectiveRole = roleMode || userRole;
  const canManageReferences =
    allowReferenceManagement !== undefined ? allowReferenceManagement : isAdmin || isSuperAdmin;

  // ─── Hooks ────────────────────────────────────────────────
  const { formData, errors, setField, setMultipleFields, validate, getPayload } = useTransactionForm();
  const { refs, filteredKamar, occupiedRoomKeys, isLoading: refsLoading } = useTransactionRefs(formData.apartment_location);
  const { clearDraft } = useTransactionDraft(formData, setField);
  const { uploading, uploadError, handleImagePick: handleImageUpload, clearImages } = useTransactionImages();

  // ─── Local State ──────────────────────────────────────────
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerItems, setViewerItems] = useState([]);
  const [ktpFile, setKtpFile] = useState(null);
  const [buktiTransferFile, setBuktiTransferFile] = useState(null);
  const [ktpPreviewUrl, setKtpPreviewUrl] = useState(null);
  const [buktiPreviewUrl, setBuktiPreviewUrl] = useState(null);
  const [hasDraft, setHasDraft] = useState(false);

  // ═══ Derived Select Options ═══════════════════════════════

  const lokasiOptions = useMemo(
    () =>
      refs.lokasi.map((x) => {
        const roomsInLocation = filteredKamar.filter((k) => k.apartment_location === x.name);
        const availableCount = roomsInLocation.filter(
          (k) => !occupiedRoomKeys.has(`${k.apartment_location}::${k.room_number}`)
        ).length;
        const soldOut = roomsInLocation.length > 0 && availableCount === 0;
        return {
          value: x.name,
          label: soldOut ? `${x.name} (Habis)` : x.name,
          isDisabled: soldOut,
        };
      }),
    [refs.lokasi, filteredKamar, occupiedRoomKeys]
  );

  const kamarOptions = useMemo(
    () =>
      filteredKamar.map((k) => {
        const key = `${k.apartment_location}::${k.room_number}`;
        const occupied = occupiedRoomKeys.has(key);
        return {
          value: k.room_number,
          label: occupied ? `${k.room_number} (Terisi)` : k.room_number,
          isDisabled: occupied,
        };
      }),
    [filteredKamar, occupiedRoomKeys]
  );

  const marketingOptions = useMemo(
    () => refs.marketing.map((x) => ({ value: x.name, label: x.name })),
    [refs.marketing]
  );

  // ═══ Image Preview ════════════════════════════════════════

  useEffect(() => {
    if (!ktpFile) {
      setKtpPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(ktpFile);
    setKtpPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [ktpFile]);

  useEffect(() => {
    if (!buktiTransferFile) {
      setBuktiPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(buktiTransferFile);
    setBuktiPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [buktiTransferFile]);

  // ═══ Image Pick Handler ══════════════════════════════════

  const onImagePick = useCallback(
    async (field, file) => {
      if (!file) {
        setField(field, null);
        if (field === 'ktp_image') setKtpFile(null);
        if (field === 'transfer_proof') setBuktiTransferFile(null);
        return;
      }

      try {
        const compressed = await compressImageFile(file, { maxWidth: 1920, quality: 0.82 });
        setField(field, compressed);
        if (field === 'ktp_image') setKtpFile(compressed);
        if (field === 'transfer_proof') setBuktiTransferFile(compressed);
      } catch (err) {
        toast({
          title: 'Gagal memproses gambar',
          description: err?.message || 'Coba gambar lain.',
          variant: 'destructive',
        });
        if (field === 'ktp_image') {
          setKtpFile(null);
          setField('ktp_image', null);
        }
        if (field === 'transfer_proof') {
          setBuktiTransferFile(null);
          setField('transfer_proof', null);
        }
      }
    },
    [setField]
  );

  // ═══ View Image Handler ══════════════════════════════════

  const onViewPreview = useCallback(({ src, title, downloadName }) => {
    setViewerItems([{ src, title, downloadName }]);
    setViewerOpen(true);
  }, []);

  // ═══ Marketing Create / Delete ═══════════════════════════

  const onCreateMarketing = useCallback(
    async (name) => {
      const trimmed = String(name || '').trim();
      if (!trimmed) return;

      const exists = refs.marketing.some(
        (item) => item.name.toLowerCase() === trimmed.toLowerCase()
      );
      if (exists) {
        setField('marketing_name', trimmed);
        return;
      }

      try {
        const { error } = await supabase.from('marketing').insert({ name: trimmed });
        if (error) throw error;
        toast({ title: 'Marketing baru ditambahkan', description: trimmed });
        setField('marketing_name', trimmed);
        // Refetch refs to update list
        // refetchRefs?.();
      } catch (error) {
        toast({
          title: 'Gagal menambah marketing',
          description: error.message,
          variant: 'destructive',
        });
      }
    },
    [refs.marketing, setField]
  );

  const onDeleteMarketing = useCallback(
    async (name) => {
      if (!name) return;
      try {
        const { error } = await supabase.from('marketing').delete().eq('name', name);
        if (error) throw error;
        setField('marketing_name', '');
        toast({ title: 'Nama marketing dihapus' });
      } catch (error) {
        toast({
          title: 'Gagal menghapus marketing',
          description: error.message,
          variant: 'destructive',
        });
      }
    },
    [setField]
  );

  // ═══ Validation & Confirm ════════════════════════════════

  const validateAndOpenConfirm = useCallback(() => {
    if (!user?.id) {
      toast({
        title: 'Sesi tidak valid',
        description: 'Silakan login ulang lalu coba lagi.',
        variant: 'destructive',
      });
      return;
    }

    if (!validate()) {
      toast({
        title: 'Data wajib belum lengkap',
        description: 'Periksa kembali field yang ditandai merah.',
        variant: 'destructive',
      });
      return;
    }

    if (requireMarketing && !formData.marketing_name?.trim()) {
      toast({
        title: 'Marketing wajib diisi',
        description: 'Pilih atau tambahkan nama marketing terlebih dahulu.',
        variant: 'destructive',
      });
      return;
    }

    if (formData.rental_duration === 'Custom' && !formData.custom_hours) {
      toast({ title: 'Durasi custom belum diisi', variant: 'destructive' });
      return;
    }

    if (Number(formData.cash_amount) <= 0 && Number(formData.transfer_amount) <= 0) {
      toast({
        title: 'Pembayaran kosong',
        description: 'Isi minimal salah satu nilai tunai atau transfer.',
        variant: 'destructive',
      });
      return;
    }

    if (Number(formData.transfer_amount) > 0 && !formData.transfer_to) {
      toast({ title: 'Tujuan transfer belum dipilih', variant: 'destructive' });
      return;
    }

    setShowConfirmModal(true);
  }, [user, validate, formData, requireMarketing]);

  // ═══ Submit ═══════════════════════════════════════════════

  const performSubmit = useCallback(async () => {
    if (isSubmitting) return;

    const {
      data: { session: currentSession },
    } = await supabase.auth.getSession();
    if (!currentSession?.user?.id) {
      toast({
        title: 'Sesi berakhir',
        description: 'Silakan login kembali untuk menyimpan transaksi.',
        variant: 'destructive',
      });
      return;
    }

    setIsSubmitting(true);

    try {
      const payload = getPayload();

      // Add user metadata not included in getPayload
      payload.created_by = user.id;
      payload.input_by = user?.user_metadata?.full_name || user?.email || 'sistem';

      const result = await submitTransaction(payload, currentSession);

      setShowConfirmModal(false);
      clearDraft();

      toast({
        title: 'Transaksi berhasil disimpan',
        description: result?.id ? `ID: ${result.id}` : undefined,
      });

      // Reset local file state
      setKtpFile(null);
      setBuktiTransferFile(null);
      setHasDraft(false);

      // Reset form
      setMultipleFields({
        guest_name: '',
        phone: '',
        apartment_location: '',
        room_number: '',
        rental_type: 'TRANSIT',
        rental_duration: '',
        custom_hours: '',
        checkin_at: new Date().toISOString().slice(0, 16),
        shift: '',
        tarif: 0,
        cash_amount: 0,
        transfer_amount: 0,
        transfer_to: '',
        marketing_name: '',
        deposit_amount: 0,
        ktp_image: null,
        transfer_proof: null,
      });

      onDataUpdate?.();
      onSuccess?.();
    } catch (error) {
      const rlsError = error?.message?.toLowerCase().includes('row-level security');
      toast({
        title: 'Gagal menyimpan transaksi',
        description: rlsError
          ? 'Akses ditolak oleh aturan keamanan data. Pastikan akun Anda memiliki role yang benar.'
          : error.message,
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  }, [isSubmitting, user, getPayload, clearDraft, setMultipleFields, onDataUpdate, onSuccess]);

  // ═══ Reset Handler ═══════════════════════════════════════

  const resetForm = useCallback(() => {
    setMultipleFields({
      guest_name: '',
      phone: '',
      apartment_location: '',
      room_number: '',
      rental_type: 'TRANSIT',
      rental_duration: '',
      custom_hours: '',
      checkin_at: new Date().toISOString().slice(0, 16),
      shift: '',
      tarif: 0,
      cash_amount: 0,
      transfer_amount: 0,
      transfer_to: '',
      marketing_name: '',
      deposit_amount: 0,
      ktp_image: null,
      transfer_proof: null,
    });
    setKtpFile(null);
    setBuktiTransferFile(null);
    setHasDraft(false);
  }, [setMultipleFields]);

  // ═══ Blocking UI (unassigned employee) ═══════════════════

  if (effectiveRole === 'karyawan' && !refsLoading && refs.lokasi.length === 0) {
    return (
      <div className="bg-white rounded-[2rem] p-10 border-2 border-orange-100 shadow-xl text-center space-y-6">
        <div className="h-24 w-24 bg-orange-50 text-orange-500 rounded-full flex items-center justify-center mx-auto mb-2 animate-pulse">
          <AlertTriangle className="h-12 w-12" />
        </div>
        <div>
          <h2 className="text-2xl font-black text-slate-900">Penempatan Belum Diatur</h2>
          <p className="text-slate-600 mt-3 leading-relaxed">
            Akun Anda belum ditempatkan di lokasi apartemen manapun.
            <br />
            <br />
            Silakan hubungi <span className="font-bold text-blue-600">Admin KR</span> untuk mengatur
            penempatan kerja akun Anda agar bisa melakukan input transaksi.
          </p>
        </div>
      </div>
    );
  }

  // ═══ Main Render ═════════════════════════════════════════

  const content = (
    <div className={`mx-auto max-w-2xl space-y-5 ${embedded ? 'w-full' : ''}`}>
      {/* Header */}
      {!embedded && (
        <header className="rounded-2xl border border-blue-200 bg-gradient-to-r from-blue-600 to-cyan-500 p-5 text-white shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-white">Form Input Transaksi</h1>
            </div>
          </div>
        </header>
      )}

      <DayInfoBanner />

      <form
        onSubmit={(e) => {
          e.preventDefault();
          validateAndOpenConfirm();
        }}
        className="space-y-5"
      >
        {/* Basic Fields */}
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <FormTransaksiBasicFields
            formData={formData}
            setField={setField}
            errors={errors}
            lokasiOptions={lokasiOptions}
            kamarOptions={kamarOptions}
          />

          <FormTransaksiMarketing
            formData={formData}
            setField={setField}
            marketingOptions={marketingOptions}
            requireMarketing={requireMarketing}
            onCreateMarketing={onCreateMarketing}
            onDeleteMarketing={canManageReferences ? onDeleteMarketing : undefined}
            canManageReferences={canManageReferences}
          />
        </div>

        {/* Payment */}
        <FormTransaksiPayment formData={formData} setField={setField} errors={errors} />

        {/* Files */}
        <FormTransaksiFiles
          ktpFile={ktpFile}
          transferProofFile={buktiTransferFile}
          ktpPreviewUrl={ktpPreviewUrl}
          transferPreviewUrl={buktiPreviewUrl}
          onImagePick={onImagePick}
          onViewPreview={onViewPreview}
        />

        {/* Actions */}
        <FormTransaksiActions
          isSubmitting={isSubmitting}
          hasDraft={hasDraft}
          onReset={resetForm}
          formData={formData}
          user={user}
        />
      </form>

      {/* Confirmation Dialog */}
      <FormTransaksiConfirm
        open={showConfirmModal}
        onOpenChange={setShowConfirmModal}
        formData={formData}
        user={user}
        isSubmitting={isSubmitting}
        ktpFile={ktpFile}
        transferProofFile={buktiTransferFile}
        onConfirm={performSubmit}
      />

      {/* Image Viewer */}
      <ImageViewerModal open={viewerOpen} onOpenChange={setViewerOpen} items={viewerItems} />
    </div>
  );

  if (embedded) {
    return content;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-cyan-50 to-indigo-100 px-3 py-4 pb-28 sm:px-6">
      {content}
    </div>
  );
}
