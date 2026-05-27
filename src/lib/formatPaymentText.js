import { format } from 'date-fns';
import { id as idLocale } from 'date-fns/locale';
import { formatRupiah } from './formatRupiah';
import { getSewaDisplay } from './roomUtils';

export function formatRupiahNumber(value) {
  return `Rp ${new Intl.NumberFormat('id-ID').format(Number(value || 0))}`;
}

/**
 * Format pembayaran untuk teks WhatsApp (tunai/transfer/split).
 * - Jika transfer 0 => tampil "Tunai/Cash"
 * - Jika split => tampil 2 baris, dan transfer menampilkan tujuan jika ada
 */
export function formatPaymentLines({ cashAmount = 0, transferAmount = 0, transferTo = null } = {}) {
  const cash = Number(cashAmount || 0);
  const transfer = Number(transferAmount || 0);
  const total = cash + transfer;

  const lines = [];
  if (transfer <= 0 && cash > 0) {
    lines.push(`Tunai/Cash ${formatRupiahNumber(cash)}`);
    return { total, lines };
  }

  if (cash <= 0 && transfer > 0) {
    lines.push(`Transfer ${formatRupiahNumber(transfer)}${transferTo ? ` (ke ${transferTo})` : ''}`);
    return { total, lines };
  }

  lines.push(`Split Payment:`);
  lines.push(`- Tunai/Cash: ${formatRupiahNumber(cash)}`);
  lines.push(`- Transfer: ${formatRupiahNumber(transfer)}${transferTo ? ` (ke ${transferTo})` : ''}`);
  return { total, lines };
}

/**
 * Format an ISO date string for WhatsApp display.
 * "2026-05-27T14:30:00" → "Senin, 27 Mei 2026 14:30 WIB"
 *
 * @param {string} iso - ISO date string
 * @returns {string} Formatted date-time string or "-" on error
 */
export function formatWhatsappDateTime(iso) {
  if (!iso) return '-';
  try {
    return format(new Date(iso), 'EEEE, dd MMM yyyy HH:mm', { locale: idLocale }) + ' WIB';
  } catch {
    return '-';
  }
}

/**
 * Build a complete WhatsApp share text for a transaction.
 *
 * @param {object} transaction - Transaction object with guest_name, room_number, etc.
 * @returns {string} Formatted WhatsApp message text
 */
export function formatTransactionForWhatsApp(transaction) {
  const { cash_amount = 0, transfer_amount = 0, transfer_to = null } = transaction;
  const { total, lines } = formatPaymentLines({
    cashAmount: cash_amount,
    transferAmount: transfer_amount,
    transferTo: transfer_to,
  });

  let text = `*Transaksi Baru - ${transaction.apartment_location || '-'}*\n`;
  text += `Tamu: ${transaction.guest_name || '-'}\n`;
  text += `Kamar: ${transaction.room_number || '-'}\n`;
  text += `Check-in: ${formatWhatsappDateTime(transaction.checkin_at || transaction.created_at)}\n`;
  text += `Sewa: ${getSewaDisplay(transaction)}\n`;
  text += `\n_Pembayaran:_\n`;
  lines.forEach((line) => {
    text += `${line}\n`;
  });
  text += `\n_Total: ${formatRupiah(total)}_`;
  return text;
}

