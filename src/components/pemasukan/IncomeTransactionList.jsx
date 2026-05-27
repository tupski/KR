import React from 'react';
import { Edit, Trash2, Share2, Image as ImageIcon, UserCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogTrigger,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { formatRupiah } from '@/lib/formatRupiah';
import { capitalizeWords, getSewaDisplay } from '@/lib/roomUtils';
import { formatWhatsappDateTime } from '@/lib/formatPaymentText';
import { resolveStorageUrl } from '@/lib/storageUrl';

/**
 * IncomeTransactionList — Transaction list items with edit/delete/share actions.
 *
 * Renders each transaction as an expandable card with payment details
 * and action buttons (view proof image, edit, delete, share).
 *
 * @param {object} props
 * @param {object[]} props.transactions - Array of transaction objects
 * @param {(transaction: object) => void} props.onEditClick - Edit button handler
 * @param {(id: string) => void} props.onDelete - Delete button handler
 * @param {(transaction: object) => void} props.onShare - Share button handler
 */
export function IncomeTransactionList({
  transactions = [],
  onEditClick,
  onDelete,
  onShare,
}) {
  if (transactions.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-gray-500">
        Tidak ada transaksi pada filter ini.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {transactions.map((transaksi) => {
        const totalAmount =
          (transaksi.cash_amount || 0) + (transaksi.transfer_amount || 0);

        return (
          <div
            key={transaksi.id}
            className="rounded-2xl border bg-white/70 p-4"
          >
            {/* Header row: customer name + total */}
            <div className="mb-3 flex items-start justify-between gap-2">
              <h3 className="font-bold text-gray-800">
                {capitalizeWords(transaksi.customer_name)}
              </h3>
              <p className="text-right text-base font-extrabold text-orange-600 sm:text-lg">
                {formatRupiah(totalAmount)}
              </p>
            </div>

            {/* Detail row */}
            <div className="mb-3 space-y-1 border-y py-2 text-xs text-gray-700">
              <p>
                Lokasi: {transaksi.apartment_location} - Kamar{' '}
                {transaksi.room_number}
              </p>
              <p>Sewa: {getSewaDisplay(transaksi)}</p>
              <p>
                Check-in:{' '}
                {formatWhatsappDateTime(
                  transaksi.checkin_at || transaksi.created_at,
                )}
              </p>
              {transaksi.marketing_name && (
                <p>Marketing: {transaksi.marketing_name}</p>
              )}
              {transaksi.marketing_fee > 0 && (
                <p>Fee: {formatRupiah(transaksi.marketing_fee)}</p>
              )}
              {transaksi.input_by && (
                <p>
                  <UserCheck className="mr-1 inline h-3 w-3" />
                  Diinput oleh: {transaksi.input_by} (Shift:{' '}
                  {transaksi.shift || '-'})
                </p>
              )}
            </div>

            {/* Payment details + action buttons */}
            <div className="flex items-center justify-between">
              <div className="space-y-1 text-xs">
                {(transaksi.cash_amount || 0) > 0 && (
                  <p className="font-semibold text-green-600">
                    Tunai: {formatRupiah(transaksi.cash_amount)}
                  </p>
                )}
                {(transaksi.transfer_amount || 0) > 0 && (
                  <p className="font-semibold text-blue-600">
                    Transfer: {formatRupiah(transaksi.transfer_amount)}{' '}
                    {transaksi.transfer_to
                      ? `(ke ${transaksi.transfer_to})`
                      : ''}
                  </p>
                )}
              </div>

              <div className="flex gap-1">
                {/* Transfer proof image */}
                {transaksi.transfer_proof_url && (
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button
                        size="icon"
                        variant="outline"
                        className="h-8 w-8"
                      >
                        <ImageIcon className="h-4 w-4" />
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="bg-black/80">
                      <DialogHeader>
                        <DialogTitle className="text-white">
                          Bukti Transfer
                        </DialogTitle>
                        <DialogDescription className="text-gray-300">
                          Pratinjau gambar bukti transfer transaksi.
                        </DialogDescription>
                      </DialogHeader>
                      <img
                        src={resolveStorageUrl(
                          transaksi.transfer_proof_url,
                        )}
                        alt="Bukti Transfer"
                        className="w-full rounded-lg"
                      />
                    </DialogContent>
                  </Dialog>
                )}

                {/* Edit */}
                <Button
                  size="icon"
                  variant="outline"
                  className="h-8 w-8"
                  onClick={() => onEditClick(transaksi)}
                >
                  <Edit className="h-4 w-4" />
                </Button>

                {/* Delete */}
                <Button
                  size="icon"
                  variant="destructive"
                  className="h-8 w-8"
                  onClick={() => onDelete(transaksi.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>

                {/* Share */}
                <Button
                  size="icon"
                  onClick={() => onShare(transaksi)}
                  className="h-8 w-8 bg-green-500"
                >
                  <Share2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
