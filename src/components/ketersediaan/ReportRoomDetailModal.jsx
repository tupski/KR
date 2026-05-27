import React from 'react';
import { X } from 'lucide-react';
import { formatRupiah } from '@/lib/formatRupiah';
import { formatTimeWIB, capitalizeWords } from '@/lib/roomUtils';

export function ReportRoomDetailModal({ room, transactions, onClose }) {
  if (!room) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 pb-24 pt-6 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-md overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl max-h-[75vh]" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-start justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{room.lokasi}</p>
            <h2 className="text-xl font-bold text-slate-900">{room.name}</h2>
          </div>
          <button onClick={onClose} className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="mb-4 rounded-xl bg-slate-50 p-3 text-xs text-slate-700">
          Transaksi: <span className="font-bold text-slate-900">{room.jumlahDigunakan || 0}</span> · Pendapatan:{' '}
          <span className="font-bold text-emerald-700">{formatRupiah(room.pendapatan || 0)}</span>
        </div>
        <div className="space-y-2">
          {(!transactions || transactions.length === 0) ? (
            <p className="text-center text-sm text-slate-500 py-4">Tidak ada transaksi pada periode ini.</p>
          ) : (
            transactions.map((tx) => (
              <div key={tx.id} className="rounded-xl border p-3 space-y-1">
                <p className="text-xs text-slate-500">{formatTimeWIB(new Date(tx.checkin_at || tx.created_at))}</p>
                <p className="text-sm font-semibold text-slate-800">{capitalizeWords(tx.customer_name || 'Tanpa nama')}</p>
                <p className="text-xs text-slate-600">Tunai: {formatRupiah(tx.cash_amount || 0)} · Transfer: {formatRupiah(tx.transfer_amount || 0)}</p>
                <p className="text-xs font-semibold text-slate-800">Total: {formatRupiah((tx.cash_amount || 0) + (tx.transfer_amount || 0))}</p>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
