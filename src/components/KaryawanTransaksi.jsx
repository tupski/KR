import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, Image as ImageIcon, MessageCircle, X, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { resolveStorageUrl } from '@/lib/storageUrl';
import { formatPaymentLines, formatRupiahNumber } from '@/lib/formatPaymentText';
import ImageViewerModal from '@/components/ImageViewerModal';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { FormTransaksiPage } from '@/components/transaksi/FormTransaksiPage';
import DayInfoBanner from '@/components/DayInfoBanner';
import PaginationControls from '@/components/PaginationControls';

// ─── Label mapping untuk form laporan ────────────────────────────────────────
const FIELD_LABELS = {
  customer_name: 'Nama Customer',
  apartment_location: 'Lokasi Apartemen',
  room_number: 'Nomor Kamar',
  marketing_name: 'Nama Marketing',
  rental_duration: 'Durasi Sewa',
  shift: 'Shift',
  cash_amount: 'Tunai (Rp)',
  transfer_amount: 'Transfer (Rp)',
  transfer_to: 'Transfer Ke',
  marketing_fee: 'Fee Marketing (Rp)',
  deposit_cash: 'Deposit Tunai (Rp)',
  deposit_transfer: 'Deposit Transfer (Rp)',
  input_by: 'Diinput Oleh',
};

const REPORT_FIELDS = Object.keys(FIELD_LABELS);

const KaryawanTransaksi = ({ onRequestNavigate }) => {
  const { user } = useAuth();
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [previewTransaksi, setPreviewTransaksi] = useState(null);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [reportTransaksi, setReportTransaksi] = useState(null);
  const [confirmResendTransaksi, setConfirmResendTransaksi] = useState(null);
  // reportDraft: { ...fields, alasan, _original: {...fields} }
  const [reportDraft, setReportDraft] = useState(null);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // ─── Utilitas laporan WhatsApp ──────────────────────────────────────────────
  const getSentMap = () => {
    try { return JSON.parse(localStorage.getItem('kr_report_sent_map') || '{}'); }
    catch (_e) { return {}; }
  };
  const markSent = (id) => {
    const map = getSentMap();
    map[id] = new Date().toISOString();
    localStorage.setItem('kr_report_sent_map', JSON.stringify(map));
  };

  const formatReportDateTime = (iso) => {
    const parts = new Intl.DateTimeFormat('id-ID', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: false,
    }).formatToParts(new Date(iso));
    const getPart = (type) => parts.find((p) => p.type === type)?.value || '';
    return `${getPart('day')} ${getPart('month')} ${getPart('year')}, ${getPart('hour')}:${getPart('minute')} WIB`;
  };

  const inferCheckoutTime = (t) => {
    if (t.checkout_at) return t.checkout_at;
    const ci = new Date(t.checkin_at || t.created_at);
    return new Date(ci.getTime() + (Number(t.rental_duration) || 1) * 3600000).toISOString();
  };

  const formatRentalDuration = (hours) => {
    if (!hours) return '1 JAM';
    return { 3: '3 JAM', 6: '6 JAM', 9: '9 JAM', 12: '12 JAM', 24: '24 JAM' }[hours] || `${hours} JAM`;
  };

  const buildForwardMessage = (t) => {
    const { total, lines } = formatPaymentLines({
      cashAmount: t.cash_amount || 0,
      transferAmount: t.transfer_amount || 0,
      transferTo: t.transfer_to || null,
    });
    const komisi = formatRupiahNumber(Number(t.marketing_fee || 0));
    const depositCash = Number(t.deposit_cash || 0);
    const depositTransfer = Number(t.deposit_transfer || 0);
    const depositLine = depositCash > 0 || depositTransfer > 0
      ? `Deposit: ${depositCash > 0 ? `Tunai ${formatRupiahNumber(depositCash)} ` : ''}${depositTransfer > 0 ? `Transfer ${formatRupiahNumber(depositTransfer)}` : ''}`.trim()
      : null;
    return `*LAPORAN TRANSAKSI*\n\nCustomer: ${t.customer_name}\nLokasi: ${t.apartment_location} - ${t.room_number}\nMarketing: ${t.marketing_name || '-'}\nKomisi: ${komisi}\nSewa: ${formatRentalDuration(t.rental_duration)} (${t.shift || '-'})\nCheck-in: ${formatReportDateTime(t.checkin_at || t.created_at)}\nCheckout: ${formatReportDateTime(inferCheckoutTime(t))}\nTotal Bayar: ${formatRupiahNumber(total)}\nPembayaran: ${lines.join('\n')}${depositLine ? `\n${depositLine}` : ''}\nInput oleh: ${t.input_by || '-'}`;
  };

  const sendForwardReport = (t, force = false) => {
    const sentAt = getSentMap()[t.id];
    if (sentAt && !force) { setConfirmResendTransaksi(t); return; }
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(buildForwardMessage(t))}`, '_blank');
    markSent(t.id);
  };

  const openReportModal = (t) => {
    const original = {
      customer_name: t.customer_name || '',
      apartment_location: t.apartment_location || '',
      room_number: t.room_number || '',
      marketing_name: t.marketing_name || '',
      rental_duration: formatRentalDuration(t.rental_duration),
      shift: t.shift || '',
      cash_amount: String(t.cash_amount || 0),
      transfer_amount: String(t.transfer_amount || 0),
      transfer_to: t.transfer_to || '',
      marketing_fee: String(t.marketing_fee || 0),
      deposit_cash: String(t.deposit_cash || 0),
      deposit_transfer: String(t.deposit_transfer || 0),
      input_by: t.input_by || user?.email || '',
    };
    setReportDraft({ ...original, alasan: '', _original: original });
    setReportTransaksi(t);
  };

  const sendIssueReport = () => {
    if (!reportTransaksi || !reportDraft) return;
    const { total, lines } = formatPaymentLines({
      cashAmount: Number(reportDraft.cash_amount || 0),
      transferAmount: Number(reportDraft.transfer_amount || 0),
      transferTo: reportDraft.transfer_to || null,
    });

    // Buat daftar field yang diubah
    const changedFields = REPORT_FIELDS.filter(
      (f) => reportDraft[f] !== reportDraft._original[f]
    );

    let changesSection = '';
    if (changedFields.length > 0) {
      changesSection = '\n\n*PERUBAHAN DATA:*\n' + changedFields.map((f) =>
        `• ${FIELD_LABELS[f]}:\n  Sebelum: ${reportDraft._original[f] || '-'}\n  Sesudah: ${reportDraft[f] || '-'}`
      ).join('\n');
    } else {
      changesSection = '\n\n_(Tidak ada perubahan data, hanya laporan alasan)_';
    }

    const msg = `*LAPOR KESALAHAN TRANSAKSI*\nID: ${reportTransaksi.id}\n\nAlasan: ${reportDraft.alasan || '-'}${changesSection}\n\n*DATA TERKINI:*\nCustomer: ${reportDraft.customer_name}\nLokasi: ${reportDraft.apartment_location} - ${reportDraft.room_number}\nMarketing: ${reportDraft.marketing_name || '-'}\nDurasi Sewa: ${reportDraft.rental_duration}\nShift: ${reportDraft.shift || '-'}\nTotal Bayar: ${formatRupiahNumber(total)}\n${lines.join('\n')}\nFee Marketing: ${formatRupiahNumber(Number(reportDraft.marketing_fee || 0))}\nDeposit: ${Number(reportDraft.deposit_cash || 0) > 0 ? `Tunai ${formatRupiahNumber(Number(reportDraft.deposit_cash || 0))} ` : ''}${Number(reportDraft.deposit_transfer || 0) > 0 ? `Transfer ${formatRupiahNumber(Number(reportDraft.deposit_transfer || 0))}` : 'Tidak ada'}\nInput oleh: ${reportDraft.input_by || '-'}`;

    window.open(`https://wa.me/6289613413636?text=${encodeURIComponent(msg)}`, '_blank');
    setReportTransaksi(null);
  };

  // ─── Data transaksi ─────────────────────────────────────────────────────────
  const loadTransactions = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('transactions')
      .select('id, customer_name, apartment_location, room_number, marketing_name, rental_duration, shift, created_at, checkin_at, checkout_at, input_by, cash_amount, transfer_amount, transfer_to, marketing_fee, deposit_cash, deposit_transfer, ktp_image_url, transfer_proof_url')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    if (error) toast({ title: 'Gagal memuat transaksi', description: error.message, variant: 'destructive' });
    else setTransactions(data || []);
    setLoading(false);
  }, [user]);

  useEffect(() => { loadTransactions(); }, [loadTransactions]);

  const totalPages = Math.max(1, Math.ceil(transactions.length / pageSize));
  const paginatedTransactions = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return transactions.slice(start, start + pageSize);
  }, [transactions, currentPage, pageSize]);

  const previewViewerItems = useMemo(() => {
    if (!previewTransaksi) return [];
    const list = [];
    if (previewTransaksi.ktp_image_url) list.push({ src: resolveStorageUrl(previewTransaksi.ktp_image_url), title: 'KTP', downloadName: `ktp-${previewTransaksi.id}.jpg` });
    if (previewTransaksi.transfer_proof_url) list.push({ src: resolveStorageUrl(previewTransaksi.transfer_proof_url), title: 'Bukti transfer', downloadName: `bukti-${previewTransaksi.id}.jpg` });
    return list;
  }, [previewTransaksi]);

  // ─── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-cyan-50 to-indigo-100 px-3 py-6 pb-28 sm:px-6">
      <div className="mx-auto max-w-6xl space-y-4">

        {/* Header */}
        <header className="rounded-2xl border border-blue-200 bg-gradient-to-r from-blue-600 to-cyan-500 p-5 text-white shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Input Data Check-in</h1>
              <p className="text-sm text-blue-100">Catat transaksi dan pantau riwayat input Anda.</p>
            </div>
            <div className="rounded-xl bg-white/20 px-4 py-2 text-sm text-white">
              <div className="font-medium">{user?.user_metadata?.full_name || user?.email}</div>
              <div className="text-xs uppercase tracking-wide text-blue-100">Karyawan</div>
            </div>
          </div>
        </header>

        {/* Banner hari — compact, tidak mengganggu */}
        <DayInfoBanner />

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:items-start">
          {/* Kolom Form */}
          <div className="lg:col-span-7">
            <FormTransaksiPage
              roleMode="karyawan"
              requireMarketing={true}
              allowReferenceManagement={false}
              defaultInputBy={user?.user_metadata?.full_name || user?.email || ''}
              onSuccess={loadTransactions}
              embedded={true}
            />
          </div>

          {/* Kolom Riwayat */}
          <div className="lg:col-span-5">
            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-slate-900">Riwayat Transaksi</h2>
                <span className="text-xs text-slate-400">{transactions.length} total</span>
              </div>

              {loading ? (
                <p className="text-sm text-slate-500 py-4 text-center">Memuat transaksi...</p>
              ) : transactions.length === 0 ? (
                <p className="text-sm text-slate-500 py-4 text-center">Belum ada transaksi yang Anda input.</p>
              ) : (
                <>
                  <div className="space-y-4">
                    {paginatedTransactions.map((t) => {
                      const sentAt = getSentMap()[t.id];
                      return (
                        <motion.div key={t.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
                          className="rounded-2xl border bg-white/70 p-4">
                          <div className="mb-3 flex items-start justify-between gap-2">
                            <h3 className="font-bold text-gray-800">{t.customer_name}</h3>
                            <p className="text-right text-base font-extrabold text-orange-600 whitespace-nowrap">
                              Rp {new Intl.NumberFormat('id-ID').format((t.cash_amount || 0) + (t.transfer_amount || 0))}
                            </p>
                          </div>
                          <div className="mb-3 space-y-1 border-y py-2 text-xs text-gray-700">
                            <p>Lokasi: {t.apartment_location} - Kamar {t.room_number}</p>
                            <p>Sewa: {formatRentalDuration(t.rental_duration)} ({t.shift || '-'})</p>
                            <p>Check-in: {formatReportDateTime(t.checkin_at || t.created_at)}</p>
                            <p>Checkout: {formatReportDateTime(inferCheckoutTime(t))}</p>
                            <p>Marketing: {t.marketing_name || '-'}</p>
                            <p>Diinput oleh: {t.input_by || '-'}</p>
                          </div>
                          <div className="flex justify-end gap-2">
                            <Button size="icon" variant="outline" className="h-8 w-8" title="Lihat berkas"
                              onClick={() => {
                                if (!t.ktp_image_url && !t.transfer_proof_url) {
                                  toast({ title: 'Tidak ada berkas', description: 'Belum ada KTP atau bukti transfer.' });
                                  return;
                                }
                                setPreviewTransaksi(t);
                                setViewerOpen(true);
                              }}>
                              <ImageIcon className="h-4 w-4" />
                            </Button>
                            <Button size="icon" variant="outline" className="h-8 w-8" title="Laporkan kesalahan"
                              onClick={() => openReportModal(t)}>
                              <AlertTriangle className="h-4 w-4" />
                            </Button>
                            <Button size="icon" title={sentAt ? 'Kirim ulang laporan' : 'Kirim laporan WA'}
                              className={`h-8 w-8 ${sentAt ? 'bg-slate-500 hover:bg-slate-600' : 'bg-green-600 hover:bg-green-700'}`}
                              onClick={() => sendForwardReport(t)}>
                              <MessageCircle className="h-4 w-4" />
                            </Button>
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>

                  {/* Pagination */}
                  <div className="mt-4">
                    <PaginationControls
                      currentPage={currentPage}
                      totalPages={totalPages}
                      onPageChange={setCurrentPage}
                      itemsPerPage={pageSize}
                      totalItems={transactions.length}
                      onPageSizeChange={(s) => { setPageSize(s); setCurrentPage(1); }}
                    />
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Image viewer */}
      <ImageViewerModal
        open={viewerOpen && Boolean(previewTransaksi && previewViewerItems.length > 0)}
        onOpenChange={(open) => { setViewerOpen(open); if (!open) setPreviewTransaksi(null); }}
        items={previewViewerItems}
      />

      {/* Modal laporan kesalahan */}
      <Dialog open={Boolean(reportTransaksi)} onOpenChange={() => setReportTransaksi(null)}>
        <DialogContent className="bg-white w-[calc(100vw-2rem)] max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-700">
              <AlertTriangle className="w-5 h-5" /> Laporkan Kesalahan
            </DialogTitle>
            <DialogDescription>
              Edit data yang salah, lalu kirim ke admin via WhatsApp. Field yang diubah akan ditandai otomatis.
            </DialogDescription>
          </DialogHeader>

          {reportDraft && (
            <div className="space-y-4 pt-1">
              {/* Alasan */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">
                  Alasan Laporan <span className="text-red-500">*</span>
                </label>
                <textarea
                  rows={2}
                  className="w-full rounded-xl border-2 border-red-300 bg-red-50 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-red-500 resize-none"
                  placeholder="Jelaskan kesalahan yang terjadi..."
                  value={reportDraft.alasan}
                  onChange={(e) => setReportDraft((p) => ({ ...p, alasan: e.target.value }))}
                />
              </div>

              <div className="border-t pt-3">
                <p className="text-xs font-semibold text-gray-500 mb-3 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />
                  Field yang diubah akan berwarna kuning
                </p>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {REPORT_FIELDS.map((field) => {
                    const isChanged = reportDraft[field] !== reportDraft._original[field];
                    return (
                      <div key={field}>
                        <label className="block text-xs font-semibold mb-1">
                          <span className={isChanged ? 'text-amber-700' : 'text-gray-600'}>
                            {FIELD_LABELS[field]}
                          </span>
                          {isChanged && (
                            <span className="ml-1.5 text-[10px] font-bold text-amber-600 bg-amber-100 px-1.5 py-0.5 rounded-full">
                              diubah
                            </span>
                          )}
                        </label>
                        <input
                          className={`w-full rounded-xl border-2 px-3 py-2 text-sm text-gray-900 focus:outline-none transition-colors ${
                            isChanged
                              ? 'border-amber-400 bg-amber-50 focus:border-amber-500'
                              : 'border-gray-200 bg-white focus:border-blue-400'
                          }`}
                          value={reportDraft[field] || ''}
                          onChange={(e) => setReportDraft((p) => ({ ...p, [field]: e.target.value }))}
                          placeholder={reportDraft._original[field] || '-'}
                        />
                        {isChanged && (
                          <p className="text-[10px] text-gray-400 mt-0.5 pl-1">
                            Sebelum: <span className="font-medium text-gray-500">{reportDraft._original[field] || '-'}</span>
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Ringkasan perubahan */}
              {REPORT_FIELDS.some((f) => reportDraft[f] !== reportDraft._original[f]) && (
                <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800">
                  <p className="font-semibold mb-1">Perubahan yang akan dilaporkan:</p>
                  <ul className="space-y-0.5">
                    {REPORT_FIELDS.filter((f) => reportDraft[f] !== reportDraft._original[f]).map((f) => (
                      <li key={f}>
                        <span className="font-medium">{FIELD_LABELS[f]}:</span>{' '}
                        <span className="line-through text-gray-400">{reportDraft._original[f] || '-'}</span>
                        {' → '}
                        <span className="font-semibold text-amber-900">{reportDraft[f] || '-'}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="flex gap-2 pt-1">
                <Button variant="outline" className="flex-1" onClick={() => setReportTransaksi(null)}>
                  Batal
                </Button>
                <Button
                  className="flex-1 bg-green-600 hover:bg-green-700"
                  onClick={sendIssueReport}
                  disabled={!reportDraft.alasan.trim()}
                >
                  <MessageCircle className="mr-2 h-4 w-4" />
                  Kirim via WhatsApp
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Modal konfirmasi kirim ulang */}
      <Dialog open={Boolean(confirmResendTransaksi)} onOpenChange={() => setConfirmResendTransaksi(null)}>
        <DialogContent className="bg-white">
          <DialogHeader>
            <DialogTitle>Konfirmasi Lapor Ulang</DialogTitle>
            <DialogDescription>
              Customer ini sudah dilaporkan pada{' '}
              {confirmResendTransaksi ? new Date(getSentMap()[confirmResendTransaksi.id]).toLocaleString('id-ID') : '-'}.
              Apakah Anda yakin ingin laporkan ulang?
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setConfirmResendTransaksi(null)}>Gak jadi</Button>
            <Button className="flex-1 bg-green-600 hover:bg-green-700"
              onClick={() => { if (confirmResendTransaksi) sendForwardReport(confirmResendTransaksi, true); setConfirmResendTransaksi(null); }}>
              Ya, kirim aja
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default KaryawanTransaksi;
