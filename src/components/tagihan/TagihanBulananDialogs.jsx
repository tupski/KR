import React from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import ImageViewerModal from '@/components/ImageViewerModal';
import { resolveStorageUrl } from '@/lib/storageUrl';

/**
 * AddTagihanDialog — Form to create a new monthly bill.
 */
export function AddTagihanDialog({
  open,
  onOpenChange,
  form,
  onInputChange,
  onSubmit,
  isSubmitting,
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Tambah Tagihan Bulanan</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <input
            placeholder="Nama Tagihan"
            value={form.nama}
            onChange={(e) => onInputChange('nama', e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
          <div className="flex gap-2">
            <input
              type="number"
              placeholder="Jumlah"
              value={form.jumlah}
              onChange={(e) => onInputChange('jumlah', e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
            <input
              type="date"
              value={form.due_date}
              onChange={(e) => onInputChange('due_date', e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <input
            placeholder="Kategori"
            value={form.kategori}
            onChange={(e) => onInputChange('kategori', e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
          <div className="flex gap-2">
            <input
              placeholder="Lokasi"
              value={form.lokasi}
              onChange={(e) => onInputChange('lokasi', e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
            <input
              placeholder="Kamar"
              value={form.kamar}
              onChange={(e) => onInputChange('kamar', e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <input
            type="month"
            value={form.bulan}
            onChange={(e) => onInputChange('bulan', e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.is_recurring}
              onChange={(e) => onInputChange('is_recurring', e.target.checked)}
              className="rounded"
            />
            Tagihan recurring bulanan
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Batal
          </Button>
          <Button onClick={onSubmit} disabled={isSubmitting}>
            {isSubmitting ? 'Menyimpan...' : 'Simpan'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * EditTagihanDialog — Form to edit an existing monthly bill.
 */
export function EditTagihanDialog({
  open,
  onOpenChange,
  editForm,
  onInputChange,
  onSubmit,
  isSubmitting,
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Tagihan</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <input
            placeholder="Nama Tagihan"
            value={editForm.nama}
            onChange={(e) => onInputChange('nama', e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
          <div className="flex gap-2">
            <input
              type="number"
              placeholder="Jumlah"
              value={editForm.jumlah}
              onChange={(e) => onInputChange('jumlah', e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
            <input
              type="date"
              value={editForm.due_date}
              onChange={(e) => onInputChange('due_date', e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <input
            placeholder="Kategori"
            value={editForm.kategori}
            onChange={(e) => onInputChange('kategori', e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
          <div className="flex gap-2">
            <input
              placeholder="Lokasi"
              value={editForm.lokasi}
              onChange={(e) => onInputChange('lokasi', e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
            <input
              placeholder="Kamar"
              value={editForm.kamar}
              onChange={(e) => onInputChange('kamar', e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <input
            type="month"
            value={editForm.bulan}
            onChange={(e) => onInputChange('bulan', e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={editForm.is_recurring}
              onChange={(e) => onInputChange('is_recurring', e.target.checked)}
              className="rounded"
            />
            Tagihan recurring bulanan
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Batal
          </Button>
          <Button onClick={onSubmit} disabled={isSubmitting}>
            {isSubmitting ? 'Menyimpan...' : 'Simpan'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * PayTagihanDialog — Confirmation to mark a bill as paid, with optional proof upload.
 */
export function PayTagihanDialog({
  open,
  onOpenChange,
  payProofFile,
  onProofFileChange,
  onConfirm,
  isSubmitting,
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Konfirmasi Pembayaran</AlertDialogTitle>
          <AlertDialogDescription>
            Apakah tagihan ini sudah dibayar? Anda dapat melampirkan bukti bayar (opsional).
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="py-2">
          <input
            type="file"
            accept="image/*"
            onChange={(e) => onProofFileChange(e.target.files?.[0] || null)}
            className="w-full text-sm"
          />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>Batal</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} disabled={isSubmitting}>
            {isSubmitting ? 'Memproses...' : 'Ya, Sudah Dibayar'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/**
 * DeleteTagihanDialog — Confirm deletion of a bill.
 */
export function DeleteTagihanDialog({
  open,
  onOpenChange,
  onConfirm,
}) {
  return (
    <AlertDialog
      open={open}
      onOpenChange={(open) => onOpenChange(open)}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Hapus Tagihan</AlertDialogTitle>
          <AlertDialogDescription>
            Hapus tagihan ini? Tindakan ini tidak dapat dibatalkan.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Batal</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>Hapus</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/**
 * ImageViewerModalWrapper — Shows bukti_bayar image in a modal.
 */
export function ImageViewerModalWrapper({ viewImage, onClose }) {
  if (!viewImage) return null;
  return (
    <ImageViewerModal
      open={!!viewImage}
      onOpenChange={onClose}
      items={[{ src: resolveStorageUrl(viewImage), title: 'Bukti Bayar' }]}
    />
  );
}
