import React, { useEffect, useMemo, useRef, useState } from 'react';
import Select from 'react-select';
import CreatableSelect from 'react-select/creatable';
import { AlertTriangle, Building2, Clock3, DoorOpen, Eye, Landmark, MapPin, Save, Upload, UserCircle2, UserSquare2, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase, supabaseProjectRef } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { uploadToVercelBlob } from '@/lib/vercelBlobUpload';
import { compressImageFile } from '@/lib/compressImage';
import ImageViewerModal from '@/components/ImageViewerModal';
import { calcEndAt, getActiveTransaction, getRentalConfig, capitalizeWords } from '@/lib/roomUtils';
import DayInfoBanner from '@/components/DayInfoBanner';

const RENTAL_TYPE_OPTIONS = [
  { value: 'TRANSIT', label: 'Transit' },
  { value: 'PER_MALAM', label: 'Per malam' },
];
const TRANSIT_DURATION_OPTIONS = ['3 JAM', '6 JAM', '9 JAM', '12 JAM', '24 JAM', 'Custom'];
const OVERNIGHT_DURATION_OPTIONS = ['Promo Malam', 'Fullday', 'Custom'];
const SHIFT_OPTIONS = ['Pagi', 'Malam', 'Long Shift'];
const TRANSFER_TARGET_OPTIONS = ['Kakarama', 'Marketing'];
const DRAFT_STORAGE_KEY = 'kr:form-transaksi-modern:draft:v1';

const SectionCard = ({ icon: Icon, title, subtitle, children, className = '' }) => (
  <section className={`rounded-2xl border border-blue-100 bg-white/90 p-5 shadow-sm backdrop-blur ${className}`}>
    <div className="mb-4 flex items-start gap-3">
      <div className="rounded-xl bg-blue-100 p-2 text-blue-700"><Icon className="h-5 w-5" /></div>
      <div>
        <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
        {subtitle && <p className="text-xs text-slate-500">{subtitle}</p>}
      </div>
    </div>
    {children}
  </section>
);

const selectStyles = {
  control: (base, state) => ({
    ...base,
    minHeight: 46,
    borderRadius: 16,
    borderColor: state.isFocused ? '#0f172a' : '#cbd5e1',
    boxShadow: 'none',
    ':hover': { borderColor: '#334155' },
  }),
  valueContainer: (base) => ({ ...base, paddingLeft: 12, paddingRight: 12 }),
  menu: (base) => ({ ...base, borderRadius: 12, overflow: 'hidden' }),
  menuPortal: (base) => ({ ...base, zIndex: 9999 }),
};

export const formatCurrency = (value) => {
  const numeric = String(value || '').replace(/\D/g, '');
  if (!numeric) return '';
  return new Intl.NumberFormat('id-ID').format(Number(numeric));
};

export const parseCurrency = (value) => Number(String(value || '').replace(/\D/g, '')) || 0;

const toDateTimeLocalValue = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
};

const parseCheckInDate = (value) => {
  const parsed = value ? new Date(value) : new Date();
  if (Number.isNaN(parsed.getTime())) return new Date();
  return parsed;
};

/**
 * FormTransaksiModern – form transaksi tunggal yang dapat dikonfigurasi per role.
 *
 * Props:
 *  onDataUpdate            – dipanggil setelah submit berhasil (alias lama)
 *  onSuccess               – dipanggil setelah submit berhasil (semua mode)
 *  roleMode                – 'karyawan' | 'admin' | 'super_admin' (default: dari userRole)
 *  requireMarketing        – paksa marketing harus diisi (default: false)
 *  allowReferenceManagement – izinkan create/delete lokasi, kamar, marketing (default: isAdmin||isSuperAdmin)
 *  defaultInputBy          – nilai awal field input_by
 *  embedded                – jika true, tidak menampilkan wrapper halaman
 */
const FormTransaksiModern = ({
  onDataUpdate,
  onSuccess,
  roleMode,
  requireMarketing = false,
  allowReferenceManagement = true,
  defaultInputBy = '',
  embedded = false,
}) => {
  const { user, userRole, isAdmin, isSuperAdmin } = useAuth();

  const effectiveRole = roleMode || userRole;
  const canManageReferences =
    allowReferenceManagement !== undefined
      ? allowReferenceManagement
      : isAdmin || isSuperAdmin;

  const SelectComponent = Select;
  const CreatableSelectComponent = CreatableSelect;
  const ktpInputRef = useRef(null);
  const transferInputRef = useRef(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [refsLoading, setRefsLoading] = useState(true);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerItems, setViewerItems] = useState([]);
  const [refs, setRefs] = useState({ lokasi: [], kamar: [], marketing: [], karyawan: [] });
  const [occupiedMap, setOccupiedMap] = useState({});
  const [ktpFile, setKtpFile] = useState(null);
  const [buktiTransferFile, setBuktiTransferFile] = useState(null);
  const draftKey = `${DRAFT_STORAGE_KEY}:${user?.id || 'guest'}`;
  const [formData, setFormData] = useState({
    namaCustomer: '',
    lokasiApartemen: '',
    nomorKamar: '',
    namaMarketing: '',
    jenisSewa: '',
    lamaSewa: '',
    customSewaJam: '1',
    shift: '',
    tunai: '',
    transfer: '',
    transferKe: '',
    feeMarketing: '',
    checkinAt: toDateTimeLocalValue(new Date()),
    depositCash: '',
    depositTransfer: '',
    input_by: '',
  });
  const selectPortalTarget = typeof document !== 'undefined' ? document.body : null;

  useEffect(() => {
    const inputBy = defaultInputBy || user?.user_metadata?.full_name || user?.email || '';
    setFormData((prev) => ({ ...prev, input_by: inputBy }));
  }, [user, defaultInputBy]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(draftKey);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return;
      // Cek apakah ada field yang terisi (selain input_by dan checkinAt)
      const hasData = ['namaCustomer', 'lokasiApartemen', 'nomorKamar', 'namaMarketing', 'jenisSewa', 'lamaSewa', 'tunai', 'transfer'].some(
        (k) => parsed[k] && String(parsed[k]).trim() !== ''
      );
      if (!hasData) return;
      setFormData((prev) => ({
        ...prev,
        ...parsed,
        // Pastikan input_by tetap konsisten dengan user/default terbaru.
        input_by: parsed.input_by || defaultInputBy || user?.user_metadata?.full_name || user?.email || prev.input_by,
        // checkinAt tidak dipulihkan dari draft, tetap mengikuti waktu terkini
        checkinAt: toDateTimeLocalValue(new Date()),
      }));
      // Tampilkan toast hanya sekali per session per draftKey
      const toastShownKey = `${draftKey}:toast_shown`;
      if (!sessionStorage.getItem(toastShownKey)) {
        toast({ title: 'Draft dipulihkan', description: 'Input terakhir Anda berhasil dimuat ulang.' });
        sessionStorage.setItem(toastShownKey, '1');
      }
    } catch (_error) {
      // Ignore draft parse error silently.
    }
  }, [draftKey, defaultInputBy, user]);

  useEffect(() => {
    const payload = {
      ...formData,
      // File upload tidak bisa dipulihkan dari localStorage.
      ktpFile: null,
      buktiTransferFile: null,
    };
    localStorage.setItem(draftKey, JSON.stringify(payload));
  }, [draftKey, formData]);

  useEffect(() => {
    const fetchRefs = async () => {
      setRefsLoading(true);
      try {
        const [{ data: lokasi }, { data: kamar }, { data: marketing }, { data: karyawan }, { data: roomTransactions }, { data: assignments }] = await Promise.all([
          supabase.from('lokasi_apartemen').select('name').order('name'),
          supabase.from('nomor_kamar').select('name, lokasi').order('name'),
          supabase.from('marketing_list').select('name').order('name'),
          supabase.from('karyawan_list').select('name').order('name'),
          supabase.from('transactions').select('apartment_location, room_number, created_at, checkin_at, rental_duration, checkout_at').order('created_at', { ascending: false }),
          supabase.from('user_location_assignments').select('location_name').eq('user_id', user?.id)
        ]);

        let filteredLokasi = lokasi || [];
        let filteredKamar = kamar || [];

        if (effectiveRole === 'karyawan') {
          if (assignments && assignments.length > 0) {
            const assignedNames = assignments.map(a => a.location_name);
            filteredLokasi = filteredLokasi.filter(l => assignedNames.includes(l.name));
            filteredKamar = filteredKamar.filter(k => assignedNames.includes(k.lokasi));
          } else {
            // Jika karyawan belum diassign kemanapun, kosongkan data (akan memicu blocking UI)
            filteredLokasi = [];
            filteredKamar = [];
          }
        }
        // Untuk admin/super_admin, biarkan filteredLokasi dan filteredKamar berisi semua data.

        setRefs({
          lokasi: filteredLokasi,
          kamar: filteredKamar,
          marketing: marketing || [],
          karyawan: karyawan || [],
        });
        const activeMap = {};
        const txList = roomTransactions || [];
        const now = new Date();

        // Ambil daftar kamar unik dari refs.kamar (atau fetch terbaru)
        const allKamar = kamar || [];
        allKamar.forEach(room => {
          const key = `${room.lokasi}__${room.name}`;
          const activeTx = getActiveTransaction(room.lokasi, room.name, txList, now);
          if (activeTx) {
            activeMap[key] = true;
          }
        });
        setOccupiedMap(activeMap);
      } catch (error) {
        toast({ title: 'Gagal memuat data referensi', description: error.message, variant: 'destructive' });
      } finally {
        setRefsLoading(false);
      }
    };
    fetchRefs();
  }, [effectiveRole, user?.id]);

  const lokasiOptions = useMemo(
    () =>
      refs.lokasi.map((x) => {
        const roomsInLocation = refs.kamar.filter((room) => room.lokasi === x.name);
        const availableCount = roomsInLocation.filter((room) => !occupiedMap[`${room.lokasi}__${room.name}`]).length;
        const soldOut = roomsInLocation.length > 0 && availableCount === 0;
        return {
          value: x.name,
          label: soldOut ? `${x.name} (Habis)` : x.name,
          isDisabled: soldOut,
        };
      }),
    [refs.lokasi, refs.kamar, occupiedMap]
  );
  const kamarOptions = useMemo(
    () =>
      refs.kamar
        .filter((x) => x.lokasi === formData.lokasiApartemen)
        .map((x) => {
          const key = `${x.lokasi}__${x.name}`;
          const occupied = Boolean(occupiedMap[key]);
          return { value: x.name, label: occupied ? `${x.name} (Terisi)` : x.name, isDisabled: occupied };
        }),
    [refs.kamar, formData.lokasiApartemen, occupiedMap]
  );
  const marketingOptions = useMemo(() => refs.marketing.map((x) => ({ value: x.name, label: x.name })), [refs.marketing]);
  const karyawanOptions = useMemo(() => refs.karyawan.map((x) => ({ value: x.name, label: x.name })), [refs.karyawan]);

  const handleChange = (field, value) => setFormData((prev) => ({ ...prev, [field]: value }));

  const handleCreateReference = async (field, value) => {
    const trimmed = String(value || '').trim();
    if (!trimmed) return;
    try {
      if (field === 'namaMarketing') {
        const exists = refs.marketing.some((item) => item.name.toLowerCase() === trimmed.toLowerCase());
        if (!exists) {
          const { error } = await supabase.from('marketing_list').insert({ name: trimmed });
          if (error) throw error;
          setRefs((prev) => ({ ...prev, marketing: [...prev.marketing, { name: trimmed }] }));
          toast({ title: 'Marketing baru ditambahkan', description: trimmed });
        }
        setFormData((prev) => ({ ...prev, namaMarketing: trimmed }));
        return;
      }
    } catch (error) {
      toast({ title: 'Gagal menambahkan data', description: error.message, variant: 'destructive' });
    }
  };

  const handleCreateMarketingKaryawan = async (value) => {
    const trimmed = String(value || '').trim();
    if (!trimmed) return;
    const exists = refs.marketing.some((item) => item.name.toLowerCase() === trimmed.toLowerCase());
    if (exists) {
      handleChange('namaMarketing', trimmed);
      return;
    }
    const { error } = await supabase.from('marketing_list').insert({ name: trimmed });
    if (error) {
      toast({ title: 'Gagal menambah marketing', description: error.message, variant: 'destructive' });
      return;
    }
    setRefs((prev) => ({ ...prev, marketing: [...prev.marketing, { name: trimmed }] }));
    handleChange('namaMarketing', trimmed);
    toast({ title: 'Marketing baru ditambahkan', description: trimmed });
  };

  const [ktpPreviewUrl, setKtpPreviewUrl] = useState(null);
  const [buktiPreviewUrl, setBuktiPreviewUrl] = useState(null);

  useEffect(() => {
    if (!ktpFile) { setKtpPreviewUrl(null); return; }
    const url = URL.createObjectURL(ktpFile);
    setKtpPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [ktpFile]);

  useEffect(() => {
    if (!buktiTransferFile) { setBuktiPreviewUrl(null); return; }
    const url = URL.createObjectURL(buktiTransferFile);
    setBuktiPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [buktiTransferFile]);

  const handleImagePick = async (field, file) => {
    if (!file) {
      if (field === 'ktpFile') setKtpFile(null);
      if (field === 'buktiTransferFile') setBuktiTransferFile(null);
      return;
    }
    try {
      const compressed = await compressImageFile(file);
      if (field === 'ktpFile') setKtpFile(compressed);
      if (field === 'buktiTransferFile') setBuktiTransferFile(compressed);
    } catch (err) {
      toast({ title: 'Gagal memproses gambar', description: err?.message || 'Coba gambar lain.', variant: 'destructive' });
      if (field === 'ktpFile') setKtpFile(null);
      if (field === 'buktiTransferFile') setBuktiTransferFile(null);
    }
  };

  const uploadFile = async (file, bucket) => {
    if (!file) return null;
    const folder = bucket === 'ktp_images' ? 'ktp-images' : bucket === 'transfer_proofs' ? 'transfer-proofs' : 'uploads';
    return uploadToVercelBlob(file, folder);
  };

  const validateAndOpenConfirm = () => {
    if (!user?.id) {
      toast({ title: 'Sesi tidak valid', description: 'Silakan login ulang lalu coba lagi.', variant: 'destructive' });
      return;
    }
    const cashAmount = parseCurrency(formData.tunai);
    const transferAmount = parseCurrency(formData.transfer);

    if (!formData.namaCustomer || !formData.lokasiApartemen || !formData.nomorKamar || !formData.checkinAt || !formData.jenisSewa || !formData.lamaSewa) {
      toast({ title: 'Data wajib belum lengkap', description: 'Isi customer, lokasi, kamar, dan durasi sewa.', variant: 'destructive' });
      return;
    }
    if (requireMarketing && !formData.namaMarketing) {
      toast({ title: 'Marketing wajib diisi', description: 'Pilih atau tambahkan nama marketing terlebih dahulu.', variant: 'destructive' });
      return;
    }
    if (formData.lamaSewa === 'Custom' && !formData.customSewaJam) {
      toast({ title: 'Durasi custom belum diisi', variant: 'destructive' });
      return;
    }
    if (cashAmount <= 0 && transferAmount <= 0) {
      toast({ title: 'Pembayaran kosong', description: 'Isi minimal salah satu nilai tunai atau transfer.', variant: 'destructive' });
      return;
    }
    if (transferAmount > 0 && !formData.transferKe) {
      toast({ title: 'Tujuan transfer belum dipilih', variant: 'destructive' });
      return;
    }
    setShowConfirmModal(true);
  };

  const resetForm = () => {
    setFormData((prev) => ({
      ...prev,
      namaCustomer: '',
      lokasiApartemen: '',
      nomorKamar: '',
      namaMarketing: '',
      jenisSewa: '',
      lamaSewa: '',
      customSewaJam: '1',
      shift: '',
      tunai: '',
      transfer: '',
      transferKe: '',
      feeMarketing: '',
      checkinAt: toDateTimeLocalValue(new Date()),
      depositCash: '',
      depositTransfer: '',
      ktpFile: null,
      buktiTransferFile: null,
    }));
    if (ktpInputRef.current) ktpInputRef.current.value = '';
    if (transferInputRef.current) transferInputRef.current.value = '';
    setKtpFile(null);
    setBuktiTransferFile(null);
    localStorage.removeItem(draftKey);
    sessionStorage.removeItem(`${draftKey}:toast_shown`);
  };

  const performSubmit = async () => {
    // 1. Double-submit protection
    if (isSubmitting) return;

    // 2. Real-time session validation
    const { data: { session: currentSession } } = await supabase.auth.getSession();
    if (!currentSession?.user?.id) {
      toast({
        title: 'Sesi berakhir',
        description: 'Silakan login kembali untuk menyimpan transaksi.',
        variant: 'destructive'
      });
      setIsSubmitting(false);
      return;
    }

    setIsSubmitting(true);
    const cashAmount = parseCurrency(formData.tunai);
    const transferAmount = parseCurrency(formData.transfer);
    const feeAmount = parseCurrency(formData.feeMarketing);
    const checkInDate = parseCheckInDate(formData.checkinAt);
    const rentalConfig = getRentalConfig(formData.jenisSewa, formData.lamaSewa, formData.customSewaJam, checkInDate);

    try {
      const [ktpUrl, transferProofUrl] = await Promise.all([
        uploadFile(ktpFile, 'ktp_images'),
        uploadFile(buktiTransferFile, 'transfer_proofs'),
      ]);
      const payload = {
        user_id: user.id,
        customer_name: capitalizeWords(formData.namaCustomer),
        marketing_name: formData.namaMarketing || formData.input_by || user?.email || 'sistem',
        rental_duration: rentalConfig.rentalHours,
        checkin_at: checkInDate.toISOString(),
        checkout_at: rentalConfig.checkoutDate.toISOString(),
        shift: formData.shift || null,
        input_by: formData.input_by || user?.email || 'sistem',
        apartment_location: formData.lokasiApartemen,
        room_number: formData.nomorKamar,
        cash_amount: cashAmount,
        transfer_amount: transferAmount,
        transfer_to: formData.transferKe || null,
        marketing_fee: feeAmount,
        deposit_cash: parseCurrency(formData.depositCash),
        deposit_transfer: parseCurrency(formData.depositTransfer),
        ktp_image_url: ktpUrl,
        transfer_proof_url: transferProofUrl,
      };
      const { data: insertedTx, error: insertError } = await supabase
        .from('transactions')
        .insert(payload)
        .select('id, created_at')
        .single();
      if (insertError) throw insertError;

      const { data: verifiedTx, error: verifyError } = await supabase
        .from('transactions')
        .select('id')
        .eq('id', insertedTx.id)
        .maybeSingle();
      if (verifyError) {
        console.warn('[Transaksi] verifikasi insert gagal:', verifyError);
      }

      // Log activity
      const { error: logError } = await supabase.rpc('log_activity', {
        p_action: 'Input Transaksi',
        p_details: `Customer: ${payload.customer_name}, Lokasi: ${payload.apartment_location} - ${payload.room_number}`,
        p_metadata: { transaction_id: insertedTx?.id ?? null }
      });
      if (logError) {
        toast({
          title: 'Transaksi tersimpan, log aktivitas gagal',
          description: logError.message,
          variant: 'destructive',
        });
      }

      setShowConfirmModal(false);
      toast({
        title: verifiedTx?.id ? 'Transaksi berhasil disimpan' : 'Transaksi tersimpan, verifikasi ulang dibutuhkan',
        description: insertedTx?.id
          ? `ID: ${insertedTx.id} • Project: ${supabaseProjectRef}`
          : `Project: ${supabaseProjectRef}`,
      });
      resetForm();
      onDataUpdate?.();
      onSuccess?.();
    } catch (error) {
      const rlsError = error?.message?.toLowerCase().includes('row-level security');
      toast({
        title: 'Gagal menyimpan transaksi',
        description: rlsError ? 'Akses ditolak oleh aturan keamanan data. Pastikan akun Anda memiliki role yang benar.' : error.message,
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderMarketingSelector = () => {
    const label = requireMarketing ? 'Nama Marketing *' : 'Nama Marketing';
    const isKaryawanMode = effectiveRole === 'karyawan';
    const onCreateOption = isKaryawanMode ? handleCreateMarketingKaryawan : (value) => handleCreateReference('namaMarketing', value);

    return (
      <div>
        <label className="mb-2 block text-sm font-medium text-slate-700">{label}</label>
        <CreatableSelectComponent
          styles={selectStyles}
          menuPortalTarget={selectPortalTarget}
          options={marketingOptions}
          placeholder="Pilih marketing atau tambah baru..."
          value={marketingOptions.find((x) => x.value === formData.namaMarketing) || null}
          onChange={(opt) => handleChange('namaMarketing', opt?.value || '')}
          onCreateOption={onCreateOption}
          isClearable
          formatCreateLabel={(inputValue) => `Tambah marketing: ${inputValue}`}
        />
        {canManageReferences && formData.namaMarketing && (
          <div className="mt-2 flex gap-3">
            <button type="button" className="text-sm text-slate-600 hover:text-slate-900" onClick={() => handleChange('namaMarketing', '')}>Kosongkan pilihan</button>
            <button type="button" className="text-sm text-red-600 hover:text-red-800" onClick={async () => {
              if (!window.confirm(`Hapus nama marketing ${formData.namaMarketing}?`)) return;
              const { error } = await supabase.from('marketing_list').delete().eq('name', formData.namaMarketing);
              if (error) {
                toast({ title: 'Gagal menghapus marketing', description: error.message, variant: 'destructive' });
                return;
              }
              setRefs((prev) => ({ ...prev, marketing: prev.marketing.filter((item) => item.name !== formData.namaMarketing) }));
              handleChange('namaMarketing', '');
              toast({ title: 'Nama marketing dihapus' });
            }}>Hapus dari daftar</button>
          </div>
        )}
      </div>
    );
  };

  const selectedDurationOptions = formData.jenisSewa === 'PER_MALAM' ? OVERNIGHT_DURATION_OPTIONS : TRANSIT_DURATION_OPTIONS;
  const previewCheckInDate = parseCheckInDate(formData.checkinAt);
  const previewRentalConfig = formData.jenisSewa && formData.lamaSewa
    ? getRentalConfig(formData.jenisSewa, formData.lamaSewa, formData.customSewaJam, previewCheckInDate)
    : null;

  // Blocking UI for employees with no assignments
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
            <br /><br />
            Silakan hubungi <span className="font-bold text-blue-600">Admin KR</span> untuk mengatur penempatan kerja akun Anda agar bisa melakukan input transaksi.
          </p>
        </div>
      </div>
    );
  }

  const content = (
    <div className={`mx-auto max-w-2xl space-y-5 ${embedded ? 'w-full' : ''}`}>
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
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <SectionCard icon={UserCircle2} title="Data Penyewa" subtitle="Identitas customer dan unit apartemen">
            <div className="space-y-4">
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">Nama Customer *</label>
                <input value={formData.namaCustomer} onChange={(e) => handleChange('namaCustomer', e.target.value)} className="h-11 w-full rounded-2xl border border-slate-300 px-4 text-sm outline-none focus:border-slate-700" placeholder="Masukkan nama customer" required />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">Lokasi Apartemen *</label>
                <SelectComponent
                  styles={selectStyles}
                  menuPortalTarget={selectPortalTarget}
                  options={lokasiOptions}
                  placeholder="Pilih lokasi..."
                  value={lokasiOptions.find((x) => x.value === formData.lokasiApartemen) || null}
                  onChange={(opt) => {
                    handleChange('lokasiApartemen', opt?.value || '');
                    handleChange('nomorKamar', '');
                  }}
                  isClearable
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">Nomor Kamar *</label>
                <SelectComponent
                  styles={selectStyles}
                  menuPortalTarget={selectPortalTarget}
                  options={kamarOptions}
                  placeholder={formData.lokasiApartemen ? 'Pilih nomor kamar...' : 'Pilih lokasi terlebih dahulu'}
                  value={kamarOptions.find((x) => x.value === formData.nomorKamar) || null}
                  onChange={(opt) => handleChange('nomorKamar', opt?.value || '')}
                  isDisabled={!formData.lokasiApartemen}
                  isClearable
                />
              </div>
            </div>
          </SectionCard>

          <SectionCard icon={Clock3} title="Sewa & Marketing" subtitle="Durasi sewa, shift, dan marketing">
            <div className="space-y-4">
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">Waktu Check-in *</label>
                <input
                  type="datetime-local"
                  value={formData.checkinAt}
                  onChange={(e) => handleChange('checkinAt', e.target.value)}
                  className="h-11 w-full rounded-2xl border border-slate-300 px-4 text-sm outline-none focus:border-slate-700"
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">Durasi Sewa *</label>
                <div className="mb-3 grid grid-cols-2 gap-2">
                  {RENTAL_TYPE_OPTIONS.map((item) => (
                    <button
                      key={item.value}
                      type="button"
                      onClick={() => setFormData((prev) => ({ ...prev, jenisSewa: item.value, lamaSewa: '', customSewaJam: '1' }))}
                      className={`rounded-xl px-3 py-2 text-sm font-semibold transition ${formData.jenisSewa === item.value ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                        }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
                {!formData.jenisSewa && <p className="mb-2 text-xs text-slate-500">Pilih jenis sewa terlebih dahulu.</p>}
                {formData.jenisSewa && (
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {selectedDurationOptions.map((item) => (
                      <button key={item} type="button" onClick={() => handleChange('lamaSewa', item)} className={`rounded-xl px-3 py-2 text-xs font-semibold transition ${formData.lamaSewa === item ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}>{item}</button>
                    ))}
                  </div>
                )}
                {formData.jenisSewa === 'TRANSIT' && formData.lamaSewa === 'Custom' && <input type="number" min={1} max={168} value={formData.customSewaJam} onChange={(e) => handleChange('customSewaJam', e.target.value)} className="mt-3 h-11 w-full rounded-2xl border border-slate-300 px-4 text-sm outline-none focus:border-slate-700" placeholder="Jumlah jam custom" />}
                {formData.jenisSewa === 'PER_MALAM' && formData.lamaSewa === 'Custom' && <input type="number" min={1} max={30} value={formData.customSewaJam} onChange={(e) => handleChange('customSewaJam', e.target.value)} className="mt-3 h-11 w-full rounded-2xl border border-slate-300 px-4 text-sm outline-none focus:border-slate-700" placeholder="Jumlah malam custom" />}
                {formData.jenisSewa === 'PER_MALAM' && formData.lamaSewa && (
                  <p className="mt-2 text-xs text-slate-600">Checkout maksimal pukul 12:00 WIB sesuai jumlah malam.</p>
                )}
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">Shift</label>
                <div className="grid grid-cols-3 gap-2">
                  {SHIFT_OPTIONS.map((item) => (
                    <button key={item} type="button" onClick={() => handleChange('shift', item)} className={`rounded-xl px-3 py-2 text-sm font-semibold transition ${formData.shift === item ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}>{item}</button>
                  ))}
                </div>
              </div>
              {renderMarketingSelector()}
              {(effectiveRole === 'admin' || effectiveRole === 'super_admin') && (
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">Input Oleh</label>
                  <Select
                    styles={selectStyles}
                    menuPortalTarget={selectPortalTarget}
                    options={karyawanOptions}
                    placeholder="Pilih karyawan atau ketik nama..."
                    value={karyawanOptions.find((x) => x.value === formData.input_by) || null}
                    onChange={(opt) => handleChange('input_by', opt?.value || '')}
                    isClearable
                  />
                  {formData.input_by && (
                    <div className="mt-2 flex gap-3">
                      <button type="button" className="text-sm text-slate-600 hover:text-slate-900" onClick={() => handleChange('input_by', '')}>
                        Kosongkan pilihan input oleh
                      </button>
                      <button type="button" className="text-sm text-red-600 hover:text-red-800" onClick={async () => {
                        if (!window.confirm(`Hapus nama input oleh ${formData.input_by}?`)) return;
                        const { error } = await supabase.from('karyawan_list').delete().eq('name', formData.input_by);
                        if (error) {
                          toast({ title: 'Gagal menghapus input oleh', description: error.message, variant: 'destructive' });
                          return;
                        }
                        setRefs((prev) => ({ ...prev, karyawan: prev.karyawan.filter((item) => item.name !== formData.input_by) }));
                        handleChange('input_by', '');
                        toast({ title: 'Input oleh dihapus dari daftar' });
                      }}>
                        Hapus dari daftar
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </SectionCard>
        </div>

        <SectionCard icon={Wallet} title="Detail Pembayaran" subtitle="Tunai, transfer, bank tujuan, dan fee marketing">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">Tunai (Rp)</label>
              <input
                inputMode="numeric"
                value={formData.tunai}
                onChange={(e) => {
                  const val = formatCurrency(e.target.value);
                  handleChange('tunai', val);
                  if (parseCurrency(val) > 0 && parseCurrency(formData.transfer) > 0) {
                    handleChange('transfer', '');
                    handleChange('transferKe', '');
                  }
                }}
                className="h-11 w-full rounded-2xl border border-slate-300 px-4 text-sm outline-none focus:border-slate-700 disabled:cursor-not-allowed disabled:bg-slate-100"
                placeholder="0"
                disabled={parseCurrency(formData.transfer) > 0}
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">Transfer (Rp)</label>
              <input
                inputMode="numeric"
                value={formData.transfer}
                onChange={(e) => {
                  const val = formatCurrency(e.target.value);
                  handleChange('transfer', val);
                  if (parseCurrency(val) > 0 && parseCurrency(formData.tunai) > 0) {
                    handleChange('tunai', '');
                  }
                }}
                className="h-11 w-full rounded-2xl border border-slate-300 px-4 text-sm outline-none focus:border-slate-700 disabled:cursor-not-allowed disabled:bg-slate-100"
                placeholder="0"
                disabled={parseCurrency(formData.tunai) > 0}
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">Bank Tujuan</label>
              <div className="grid grid-cols-2 gap-2">
                {TRANSFER_TARGET_OPTIONS.map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => handleChange('transferKe', item)}
                    disabled={parseCurrency(formData.tunai) > 0}
                    className={`h-11 rounded-2xl border text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50 ${formData.transferKe === item
                      ? 'border-slate-900 bg-slate-900 text-white'
                      : parseCurrency(formData.tunai) > 0
                        ? 'border-slate-200 bg-slate-100 text-slate-400'
                        : 'border-slate-300 bg-white text-slate-700'
                      }`}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>
            <div><label className="mb-2 block text-sm font-medium text-slate-700">Fee Marketing (Rp)</label><input inputMode="numeric" value={formData.feeMarketing} onChange={(e) => handleChange('feeMarketing', formatCurrency(e.target.value))} className="h-11 w-full rounded-2xl border border-slate-300 px-4 text-sm outline-none focus:border-slate-700" placeholder="0" /></div>
          </div>
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3">
            <p className="mb-2 text-xs font-semibold text-amber-700">Deposit Tamu</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-amber-700">Tunai (Rp)</label>
                <input
                  inputMode="numeric"
                  value={formData.depositCash}
                  onChange={(e) => {
                    const val = formatCurrency(e.target.value);
                    handleChange('depositCash', val);
                    if (parseCurrency(val) > 0 && parseCurrency(formData.depositTransfer) > 0) {
                      handleChange('depositTransfer', '');
                    }
                  }}
                  className="h-10 w-full rounded-xl border border-amber-300 bg-white px-3 text-sm outline-none focus:border-amber-500 disabled:cursor-not-allowed disabled:bg-amber-100 disabled:opacity-60"
                  placeholder="0"
                  disabled={parseCurrency(formData.depositTransfer) > 0}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-amber-700">Transfer (Rp)</label>
                <input
                  inputMode="numeric"
                  value={formData.depositTransfer}
                  onChange={(e) => {
                    const val = formatCurrency(e.target.value);
                    handleChange('depositTransfer', val);
                    if (parseCurrency(val) > 0 && parseCurrency(formData.depositCash) > 0) {
                      handleChange('depositCash', '');
                    }
                  }}
                  className="h-10 w-full rounded-xl border border-amber-300 bg-white px-3 text-sm outline-none focus:border-amber-500 disabled:cursor-not-allowed disabled:bg-amber-100 disabled:opacity-60"
                  placeholder="0"
                  disabled={parseCurrency(formData.depositCash) > 0}
                />
              </div>
            </div>
          </div>
        </SectionCard>

        <SectionCard icon={Upload} title="Unggah Berkas" subtitle="KTP dan bukti transfer (gambar dikompres otomatis)">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-4 text-center">
                <Upload className="mb-1 h-5 w-5 text-slate-500" />
                <span className="text-sm font-medium text-slate-700">Upload KTP</span>
                <span className="text-xs text-slate-500">{ktpFile?.name || 'Pilih file gambar'}</span>
                <input ref={ktpInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => handleImagePick('ktpFile', e.target.files?.[0] || null)} />
              </label>
              {ktpPreviewUrl && (
                <Button type="button" variant="outline" size="sm" className="w-full" onClick={() => { setViewerItems([{ src: ktpPreviewUrl, title: 'KTP', downloadName: ktpFile?.name || 'ktp.jpg' }]); setViewerOpen(true); }}>
                  <Eye className="mr-2 h-4 w-4" />Pratinjau KTP
                </Button>
              )}
            </div>
            <div className="space-y-2">
              <label className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-4 text-center">
                <Landmark className="mb-1 h-5 w-5 text-slate-500" />
                <span className="text-sm font-medium text-slate-700">Upload Bukti Transfer</span>
                <span className="text-xs text-slate-500">{buktiTransferFile?.name || 'Pilih file gambar'}</span>
                <input ref={transferInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => handleImagePick('buktiTransferFile', e.target.files?.[0] || null)} />
              </label>
              {buktiPreviewUrl && (
                <Button type="button" variant="outline" size="sm" className="w-full" onClick={() => { setViewerItems([{ src: buktiPreviewUrl, title: 'Bukti transfer', downloadName: buktiTransferFile?.name || 'bukti.jpg' }]); setViewerOpen(true); }}>
                  <Eye className="mr-2 h-4 w-4" />Pratinjau bukti
                </Button>
              )}
            </div>
          </div>
        </SectionCard>

        <div className="grid grid-cols-1 gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-2">
          <div className="flex items-center gap-2 text-sm text-slate-600"><MapPin className="h-4 w-4" /><span>Lokasi: {formData.lokasiApartemen || '-'}</span></div>
          <div className="flex items-center gap-2 text-sm text-slate-600"><DoorOpen className="h-4 w-4" /><span>Kamar: {formData.nomorKamar || '-'}</span></div>
          <div className="flex items-center gap-2 text-sm text-slate-600"><Building2 className="h-4 w-4" /><span>Marketing: {formData.namaMarketing || '-'}</span></div>
          <div className="flex items-center gap-2 text-sm text-slate-600"><UserSquare2 className="h-4 w-4" /><span>Input oleh: {formData.input_by || user?.email}</span></div>
        </div>

        <Button type="submit" disabled={isSubmitting} className="h-14 w-full rounded-2xl bg-emerald-600 text-base font-semibold text-white shadow-lg shadow-emerald-200 hover:bg-emerald-700">
          <Save className="mr-2 h-5 w-5" />
          {isSubmitting ? 'Menyimpan Transaksi...' : 'Simpan Transaksi'}
        </Button>
      </form>

      <Dialog open={showConfirmModal} onOpenChange={setShowConfirmModal}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Konfirmasi data transaksi</DialogTitle>
            <DialogDescription>Periksa ringkasan berikut sebelum mengirim.</DialogDescription>
          </DialogHeader>
          <ul className="space-y-1.5 text-sm text-slate-700">
            <li><span className="font-medium text-slate-900">Customer:</span> {formData.namaCustomer || '-'}</li>
            <li><span className="font-medium text-slate-900">Lokasi / Kamar:</span> {formData.lokasiApartemen || '-'} — {formData.nomorKamar || '-'}</li>
            <li><span className="font-medium text-slate-900">Marketing:</span> {formData.namaMarketing || '-'}</li>
            <li>
              <span className="font-medium text-slate-900">Durasi / Shift:</span> {formData.lamaSewa || '-'}
              {formData.jenisSewa === 'TRANSIT' && formData.lamaSewa === 'Custom' && ` (${formData.customSewaJam} jam)`} / {formData.shift || '-'}
            </li>
            <li><span className="font-medium text-slate-900">Jenis sewa:</span> {formData.jenisSewa === 'PER_MALAM' ? 'Per malam' : formData.jenisSewa === 'TRANSIT' ? 'Transit' : '-'}</li>
            <li><span className="font-medium text-slate-900">Check-in:</span> {previewCheckInDate.toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</li>
            <li><span className="font-medium text-slate-900">Estimasi checkout:</span> {previewRentalConfig ? previewRentalConfig.checkoutDate.toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-'}</li>
            <li><span className="font-medium text-slate-900">Tunai:</span>{' '}{new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(parseCurrency(formData.tunai))}</li>
            <li><span className="font-medium text-slate-900">Transfer:</span>{' '}{new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(parseCurrency(formData.transfer))}{' '}{formData.transferKe ? `(ke ${formData.transferKe})` : ''}</li>
            <li><span className="font-medium text-slate-900">Fee marketing:</span>{' '}{new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(parseCurrency(formData.feeMarketing))}</li>
            <li><span className="font-medium text-slate-900">Input oleh:</span> {formData.input_by || user?.email || '-'}</li>
            {(parseCurrency(formData.depositCash) > 0 || parseCurrency(formData.depositTransfer) > 0) && (
              <li className="rounded-lg bg-amber-50 p-2 text-amber-800">
                <span className="font-medium">💰 Deposit:</span>{' '}
                {parseCurrency(formData.depositCash) > 0 && `Tunai ${new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(parseCurrency(formData.depositCash))} `}
                {parseCurrency(formData.depositTransfer) > 0 && `Transfer ${new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(parseCurrency(formData.depositTransfer))}`}
                {' '}(tidak masuk omset)
              </li>
            )}
            <li><span className="font-medium text-slate-900">Berkas:</span> KTP {ktpFile ? `(${ktpFile.name})` : '(tidak ada)'} — Bukti{' '}{buktiTransferFile ? `(${buktiTransferFile.name})` : '(tidak ada)'}</li>
          </ul>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setShowConfirmModal(false)} disabled={isSubmitting}>Batal</Button>
            <Button type="button" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => performSubmit()} disabled={isSubmitting}>{isSubmitting ? 'Mengirim...' : 'Kirim'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
};

export default FormTransaksiModern;
