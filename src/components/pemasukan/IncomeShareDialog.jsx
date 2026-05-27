import React from 'react';
import { Share2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { capitalizeWords, getSewaDisplay } from '@/lib/roomUtils';
import { formatRupiahNumber, formatPaymentLines, formatWhatsappDateTime } from '@/lib/formatPaymentText';

/**
 * Build the WhatsApp share text for a transaction.
 *
 * @param {object} transaksi - Transaction object
 * @returns {string} Formatted WhatsApp message
 */
function buildShareMessage(transaksi) {
  const { total, lines } = formatPaymentLines({
    cashAmount: transaksi.cash_amount || 0,
    transferAmount: transaksi.transfer_amount || 0,
    transferTo: transaksi.transfer_to || null,
  });

  const komisi = formatRupiahNumber(Number(transaksi.marketing_fee || 0));
  const depositCash = Number(transaksi.deposit_cash || 0);
  const depositTransfer = Number(transaksi.deposit_transfer || 0);

  const depositLine =
    depositCash > 0 || depositTransfer > 0
      ? `${depositCash > 0 ? `Tunai ${formatRupiahNumber(depositCash)} ` : ''}${
          depositTransfer > 0 ? `Transfer ${formatRupiahNumber(depositTransfer)}` : ''
        }`.trim()
      : null;

  const checkInAt = transaksi.checkin_at || transaksi.created_at;
  const checkoutAt =
    transaksi.checkout_at ||
    new Date(
      new Date(checkInAt).getTime() +
        (Number(transaksi.rental_duration) || 1) * 60 * 60 * 1000,
    ).toISOString();

  const customerName = capitalizeWords(transaksi.customer_name);
  const sewaDisplay = getSewaDisplay(transaksi);

  return `*TRANSAKSI KAKARAMA GROUP*
-------------------
*Marketing:* ${transaksi.marketing_name || '-'}
*Komisi:* ${komisi}
-------------------
*Customer:* ${customerName}
*Lokasi:* ${transaksi.apartment_location} - ${transaksi.room_number}
*Check-in:* ${formatWhatsappDateTime(checkInAt)}
*Checkout:* ${formatWhatsappDateTime(checkoutAt)}
*Sewa:* ${sewaDisplay}
-------------------
*Total Bayar:* ${formatRupiahNumber(total)}
*Pembayaran:* ${lines.join('\n')}
${depositLine ? `*Deposit:* ${depositLine}\n` : ''}-------------------
Diinput oleh: ${transaksi.input_by || '-'} (Shift: ${transaksi.shift || '-'})`;
}

/**
 * IncomeShareDialog — WhatsApp share dialog for a transaction.
 *
 * Copies the formatted message to clipboard and opens WhatsApp.
 *
 * @param {object} props
 * @param {boolean} props.open - Dialog visibility
 * @param {(open: boolean) => void} props.onOpenChange - Dialog setter
 * @param {object} props.transaction - Transaction to share
 */
export function IncomeShareDialog({ open, onOpenChange, transaction }) {
  if (!transaction) return null;

  const message = buildShareMessage(transaction);

  const handleShare = async () => {
    try {
      await navigator.clipboard.writeText(message);
      window.open(
        `https://api.whatsapp.com/send?text=${encodeURIComponent(message)}`,
        '_blank',
      );
      onOpenChange(false);
    } catch (_error) {
      // Fallback: open WhatsApp anyway
      window.open(
        `https://api.whatsapp.com/send?text=${encodeURIComponent(message)}`,
        '_blank',
      );
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Share2 className="h-5 w-5 text-green-500" />
            Bagikan ke WhatsApp
          </DialogTitle>
          <DialogDescription>
            Kirim detail transaksi ini melalui WhatsApp.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <pre className="max-h-60 overflow-y-auto whitespace-pre-wrap rounded-lg bg-gray-50 p-3 text-xs text-gray-700">
            {message}
          </pre>

          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => onOpenChange(false)}
            >
              Batal
            </Button>
            <Button
              onClick={handleShare}
              className="flex-1 bg-green-500 text-white hover:bg-green-600"
            >
              <Share2 className="mr-2 h-4 w-4" />
              Bagikan
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
