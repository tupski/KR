import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { toast } from '@/components/ui/use-toast';
import { formatRupiah } from '@/lib/formatRupiah';
import { returnDeposit } from '@/lib/depositApi';

/**
 * DepositReturnModal — Return deposit modal with Vercel Blob proof upload.
 *
 * @param {object}   props
 * @param {object|null} props.selectedTx   - Selected transaction to return
 * @param {function} props.onClose         - () => void — close modal
 * @param {function} props.onSuccess       - () => void — called after successful return
 * @param {object}   props.session         - Auth session (for depositApi)
 */
export function DepositReturnModal({ selectedTx, onClose, onSuccess, session }) {
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);

  const handleReturn = async () => {
    if (!selectedTx || !session) return;
    setUploading(true);

    try {
      await returnDeposit(selectedTx.id, file, session);
      toast({ title: 'Deposit berhasil dikembalikan ✅' });
      setFile(null);
      onSuccess();
      onClose();
    } catch (err) {
      toast({
        title: 'Gagal mengembalikan deposit',
        description: err.message,
        variant: 'destructive',
      });
    } finally {
      setUploading(false);
    }
  };

  const handleClose = () => {
    if (uploading) return;
    setFile(null);
    onClose();
  };

  return (
    <Dialog open={!!selectedTx} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="max-w-sm rounded-3xl bg-white">
        <DialogHeader>
          <DialogTitle>Kembalikan Deposit</DialogTitle>
          <DialogDescription>
            Customer: {selectedTx?.customer_name}
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          {/* Deposit Amount Display */}
          <div className="mb-4 rounded-xl bg-amber-50 p-3 text-center border border-amber-200">
            <p className="text-xs font-semibold text-amber-700">Total Deposit</p>
            <p className="text-2xl font-extrabold text-amber-600">
              {formatRupiah(
                (Number(selectedTx?.deposit_cash) || 0) +
                  (Number(selectedTx?.deposit_transfer) || 0)
              )}
            </p>
            <div className="flex justify-center gap-3 mt-1 text-xs">
              {Number(selectedTx?.deposit_cash) > 0 && (
                <span className="text-green-700 font-medium">
                  💵 Tunai: {formatRupiah(selectedTx.deposit_cash)}
                </span>
              )}
              {Number(selectedTx?.deposit_transfer) > 0 && (
                <span className="text-blue-700 font-medium">
                  🏦 Transfer: {formatRupiah(selectedTx.deposit_transfer)}
                </span>
              )}
            </div>
          </div>

          {/* File Upload */}
          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-700">
              Bukti Transfer / Pengembalian (Opsional)
            </label>
            <div className="flex items-center justify-center rounded-xl border-2 border-dashed border-slate-300 p-4">
              <input
                type="file"
                accept="image/*"
                onChange={(e) => setFile(e.target.files[0])}
                disabled={uploading}
                className="w-full text-sm text-slate-500 file:mr-4 file:rounded-full file:border-0 file:bg-amber-50 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-amber-700 hover:file:bg-amber-100"
              />
            </div>
            {file && (
              <p className="text-xs text-green-600 font-medium">
                File terpilih: {file.name}
              </p>
            )}
          </div>
        </div>

        <DialogFooter className="flex gap-2 sm:justify-center flex-col sm:flex-row">
          <Button
            variant="outline"
            className="w-full"
            onClick={handleClose}
            disabled={uploading}
          >
            Batal
          </Button>
          <Button
            className="w-full bg-amber-500 hover:bg-amber-600 font-bold text-white"
            onClick={handleReturn}
            disabled={uploading || !session}
          >
            {uploading ? 'Memproses...' : 'Kembalikan Deposit'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
