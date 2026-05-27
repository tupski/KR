import React from 'react';
import { motion } from 'framer-motion';
import {
  Banknote, Clock, DoorOpen, Landmark, LogOut, User, X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatRupiah } from '@/lib/formatRupiah';
import { formatTimeWIB, capitalizeWords, getSewaDisplay } from '@/lib/roomUtils';

export function RoomDetailModal({ room, onClose, onCheckOut, canCheckout }) {
  if (!room) return null;

  const isOccupied = room.status === 'terisi';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 pb-24 pt-6 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ type: 'spring', damping: 22, stiffness: 300 }}
        className="w-full max-w-md overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl max-h-[75vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="mb-5 flex items-start justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{room.lokasi}</p>
            <h2 className="text-2xl font-bold text-slate-900">{room.name}</h2>
          </div>
          <div className="flex items-center gap-2">
            {isOccupied ? (
              <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-bold text-red-700">Terisi</span>
            ) : (
              <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-bold text-green-700">Tersedia</span>
            )}
            <button onClick={onClose} className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {isOccupied ? (
          <div className="space-y-4">
            {/* Customer info */}
            <div className="rounded-2xl bg-slate-50 p-4 space-y-2">
              <div className="flex items-center gap-2 text-sm text-slate-700">
                <User className="h-4 w-4 text-slate-400" />
                <span className="font-semibold text-slate-900">{capitalizeWords(room.customerName)}</span>
              </div>
              {room.tx?.marketing_name && (
                <div className="space-y-1 pl-6">
                  <div className="flex items-center gap-2 text-sm text-slate-600">
                    <span>Marketing: <span className="font-medium">{room.tx.marketing_name}</span></span>
                  </div>
                  <div className="text-xs">
                    <span className="text-slate-500">Komisi: </span>
                    <span className={`font-semibold ${room.feePaid ? 'text-green-600' : 'text-amber-600'}`}>
                      {room.tx.marketing_fee > 0
                        ? `${formatRupiah(room.tx.marketing_fee)} (${room.feePaid ? 'Sudah dibayar' : 'Belum dibayar'})`
                        : 'Rp 0 (Tanpa komisi)'}
                    </span>
                  </div>
                </div>
              )}
              {room.tx?.input_by && (
                <div className="flex items-center gap-2 text-xs text-slate-500 pl-6 italic">
                  <span>Diinput oleh: {room.tx.input_by} (shift: {room.tx.shift?.toLowerCase() || '-'})</span>
                </div>
              )}
            </div>

            {/* Time info */}
            <div className="rounded-2xl bg-slate-50 p-4 space-y-2">
              <div className="flex items-center gap-2 text-xs text-slate-700">
                <Clock className="h-4 w-4 text-slate-400" />
                <div className="space-y-1">
                  <p>Check-in: <span className="font-semibold">{formatTimeWIB(room.checkInTime)}</span></p>
                  <p>Check-out: <span className="font-semibold">{formatTimeWIB(room.readyAt)}</span></p>
                  <p>Durasi: <span className="font-semibold">{getSewaDisplay(room.tx)}</span></p>
                </div>
              </div>
            </div>

            {/* Payment info */}
            <div className="rounded-2xl bg-slate-50 p-4 space-y-1.5">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Pembayaran Sewa</p>
              {(room.tx?.cash_amount || 0) > 0 && (
                <div className="flex items-center gap-2 text-sm">
                  <Banknote className="h-4 w-4 text-green-500" />
                  <span className="text-slate-700">Tunai: <span className="font-semibold text-green-700">{formatRupiah(room.tx.cash_amount)}</span></span>
                </div>
              )}
              {(room.tx?.transfer_amount || 0) > 0 && (
                <div className="flex items-center gap-2 text-sm">
                  <Landmark className="h-4 w-4 text-blue-500" />
                  <span className="text-slate-700">Transfer: <span className="font-semibold text-blue-700">{formatRupiah(room.tx.transfer_amount)}</span>{room.tx.transfer_to ? ` → ${room.tx.transfer_to}` : ''}</span>
                </div>
              )}
              <p className="text-sm font-bold text-slate-800 pt-1 border-t">
                Total: {formatRupiah((room.tx?.cash_amount || 0) + (room.tx?.transfer_amount || 0))}
              </p>
            </div>

            {/* Deposit info */}
            {((room.tx?.deposit_cash || 0) > 0 || (room.tx?.deposit_transfer || 0) > 0) && (
              <div className={`rounded-2xl border p-4 space-y-1.5 ${room.tx?.deposit_returned_at ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'}`}>
                <div className="flex justify-between items-center">
                  <p className={`text-xs font-semibold uppercase tracking-wide ${room.tx?.deposit_returned_at ? 'text-green-700' : 'text-amber-600'}`}>
                    💰 Deposit {room.tx?.deposit_returned_at && '(Sudah Dikembalikan)'}
                  </p>
                </div>
                {(room.tx?.deposit_cash || 0) > 0 && (
                  <p className={`text-sm ${room.tx?.deposit_returned_at ? 'text-green-800' : 'text-amber-800'}`}>Tunai: <span className="font-semibold">{formatRupiah(room.tx.deposit_cash)}</span></p>
                )}
                {(room.tx?.deposit_transfer || 0) > 0 && (
                  <p className={`text-sm ${room.tx?.deposit_returned_at ? 'text-green-800' : 'text-amber-800'}`}>Transfer: <span className="font-semibold">{formatRupiah(room.tx.deposit_transfer)}</span></p>
                )}
              </div>
            )}

            {/* Checkout button */}
            {canCheckout && (
              <Button
                onClick={() => { onCheckOut(room); onClose(); }}
                className="h-12 w-full rounded-2xl bg-red-500 text-white hover:bg-red-600"
              >
                <LogOut className="mr-2 h-4 w-4" /> Check Out Sekarang
              </Button>
            )}
            {!canCheckout && (
              <p className="text-center text-xs text-slate-500">Hanya admin atau karyawan yang input transaksi ini yang bisa checkout.</p>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center py-8 gap-3">
            <div className="rounded-full bg-green-100 p-4">
              <DoorOpen className="h-8 w-8 text-green-600" />
            </div>
            <p className="text-sm text-slate-500">Kamar ini sedang kosong dan siap disewa.</p>
          </div>
        )}
      </motion.div>
    </div>
  );
}
