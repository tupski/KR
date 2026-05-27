import React from 'react';
import { formatRupiah, parseCurrency } from '@/lib/formatRupiah';
import { getRentalConfig } from '@/lib/roomUtils';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

/**
 * FormTransaksiConfirm — Confirmation dialog showing form summary before submit.
 *
 * @param {object}   props
 * @param {boolean}  props.open          - Dialog open state
 * @param {Function} props.onOpenChange  - Dialog state setter
 * @param {object}   props.formData      - Current form state
 * @param {object}   props.user          - Auth user object
 * @param {boolean}  props.isSubmitting  - Whether submit is in progress
 * @param {File|null} props.ktpFile      - Selected KTP file
 * @param {File|null} props.transferProofFile - Selected transfer proof file
 * @param {Function} props.onConfirm     - Called when user clicks confirm
 */
export function FormTransaksiConfirm({
  open,
  onOpenChange,
  formData,
  user,
  isSubmitting,
  ktpFile,
  transferProofFile,
  onConfirm,
}) {
  const previewCheckInDate = formData.checkin_at ? new Date(formData.checkin_at) : new Date();
  const previewRentalConfig =
    formData.rental_type && formData.rental_duration
      ? getRentalConfig(formData.rental_type, formData.rental_duration, formData.custom_hours, previewCheckInDate)
      : null;

  const formatDateTime = (date) => {
    if (!date) return '-';
    return date.toLocaleString('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const rentalTypeLabel =
    formData.rental_type === 'PER_MALAM' ? 'Per malam' : formData.rental_type === 'TRANSIT' ? 'Transit' : '-';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Konfirmasi data transaksi</DialogTitle>
          <DialogDescription>Periksa ringkasan berikut sebelum mengirim.</DialogDescription>
        </DialogHeader>

        <ul className="space-y-1.5 text-sm text-slate-700">
          <li>
            <span className="font-medium text-slate-900">Customer:</span>{' '}
            {formData.guest_name || '-'}
          </li>
          <li>
            <span className="font-medium text-slate-900">Lokasi / Kamar:</span>{' '}
            {formData.apartment_location || '-'} — {formData.room_number || '-'}
          </li>
          <li>
            <span className="font-medium text-slate-900">Marketing:</span>{' '}
            {formData.marketing_name || '-'}
          </li>
          <li>
            <span className="font-medium text-slate-900">Durasi / Shift:</span>{' '}
            {formData.rental_duration || '-'}
            {formData.rental_type === 'TRANSIT' &&
              formData.rental_duration === 'Custom' &&
              ` (${formData.custom_hours} jam)`}
            / {formData.shift || '-'}
          </li>
          <li>
            <span className="font-medium text-slate-900">Jenis sewa:</span> {rentalTypeLabel}
          </li>
          <li>
            <span className="font-medium text-slate-900">Check-in:</span>{' '}
            {formatDateTime(previewCheckInDate)}
          </li>
          <li>
            <span className="font-medium text-slate-900">Estimasi checkout:</span>{' '}
            {previewRentalConfig
              ? formatDateTime(previewRentalConfig.checkoutDate)
              : '-'}
          </li>
          <li>
            <span className="font-medium text-slate-900">Tunai:</span>{' '}
            {formatRupiah(Number(formData.cash_amount) || 0)}
          </li>
          <li>
            <span className="font-medium text-slate-900">Transfer:</span>{' '}
            {formatRupiah(Number(formData.transfer_amount) || 0)}
            {formData.transfer_to ? ` (ke ${formData.transfer_to})` : ''}
          </li>
          <li>
            <span className="font-medium text-slate-900">Fee marketing:</span>{' '}
            {formatRupiah(Number(formData.tarif) || 0)}
          </li>
          <li>
            <span className="font-medium text-slate-900">Input oleh:</span>{' '}
            {user?.user_metadata?.full_name || user?.email || '-'}
          </li>

          {Number(formData.deposit_amount) > 0 && (
            <li className="rounded-lg bg-amber-50 p-2 text-amber-800">
              <span className="font-medium">💰 Deposit:</span>{' '}
              {formatRupiah(Number(formData.deposit_amount))} (tidak masuk omset)
            </li>
          )}

          <li>
            <span className="font-medium text-slate-900">Berkas:</span> KTP{' '}
            {ktpFile ? `(${ktpFile.name})` : '(tidak ada)'} — Bukti{' '}
            {transferProofFile ? `(${transferProofFile.name})` : '(tidak ada)'}
          </li>
        </ul>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
          >
            Batal
          </Button>
          <Button
            type="button"
            className="bg-emerald-600 hover:bg-emerald-700"
            onClick={onConfirm}
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Mengirim...' : 'Kirim'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
