import React from 'react';
import { Wallet } from 'lucide-react';
import { SectionCard } from '@/components/shared/SectionCard';
import { TRANSFER_TARGET_OPTIONS, selectStyles } from '@/lib/transactionConstants';
import { formatCurrency, parseCurrency, formatRupiah } from '@/lib/formatRupiah';

/**
 * FormTransaksiPayment — Payment detail fields: cash, transfer, target,
 * marketing fee, and deposit amounts.
 *
 * @param {object}   props
 * @param {object}   props.formData  - Current form state (useTransactionForm)
 * @param {Function} props.setField  - Single-field setter
 * @param {object}   props.errors    - Validation errors
 */
export function FormTransaksiPayment({ formData, setField, errors }) {
  /**
   * Handle cash amount change — formatted display, mutual exclusion with transfer.
   */
  const handleCashChange = (e) => {
    const val = formatCurrency(e.target.value);
    setField('cash_amount', parseCurrency(val));
    if (parseCurrency(val) > 0 && Number(formData.transfer_amount) > 0) {
      setField('transfer_amount', 0);
      setField('transfer_to', '');
    }
  };

  /**
   * Handle transfer amount change — formatted display, mutual exclusion with cash.
   */
  const handleTransferChange = (e) => {
    const val = formatCurrency(e.target.value);
    setField('transfer_amount', parseCurrency(val));
    if (parseCurrency(val) > 0 && Number(formData.cash_amount) > 0) {
      setField('cash_amount', 0);
    }
  };

  /**
   * Handle deposit cash change — mutual exclusion with deposit transfer.
   */
  const handleDepositCashChange = (e) => {
    const val = formatCurrency(e.target.value);
    setField('deposit_amount', parseCurrency(val));
  };

  const cashActive = Number(formData.cash_amount) > 0;
  const transferActive = Number(formData.transfer_amount) > 0;

  return (
    <SectionCard icon={Wallet} title="Detail Pembayaran" subtitle="Tunai, transfer, bank tujuan, dan fee marketing">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {/* Cash Amount */}
        <div>
          <label className="mb-2 block text-sm font-medium text-slate-700">Tunai (Rp)</label>
          <input
            inputMode="numeric"
            value={Number(formData.cash_amount) > 0 ? formatCurrency(formData.cash_amount) : ''}
            onChange={handleCashChange}
            className="h-11 w-full rounded-2xl border border-slate-300 px-4 text-sm outline-none focus:border-slate-700 disabled:cursor-not-allowed disabled:bg-slate-100"
            placeholder="0"
            disabled={transferActive}
          />
        </div>

        {/* Transfer Amount */}
        <div>
          <label className="mb-2 block text-sm font-medium text-slate-700">Transfer (Rp)</label>
          <input
            inputMode="numeric"
            value={Number(formData.transfer_amount) > 0 ? formatCurrency(formData.transfer_amount) : ''}
            onChange={handleTransferChange}
            className="h-11 w-full rounded-2xl border border-slate-300 px-4 text-sm outline-none focus:border-slate-700 disabled:cursor-not-allowed disabled:bg-slate-100"
            placeholder="0"
            disabled={cashActive}
          />
        </div>

        {/* Transfer Target */}
        <div>
          <label className="mb-2 block text-sm font-medium text-slate-700">Bank Tujuan</label>
          <div className="grid grid-cols-2 gap-2">
            {TRANSFER_TARGET_OPTIONS.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setField('transfer_to', item)}
                disabled={cashActive}
                className={`h-11 rounded-2xl border text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50 ${
                  formData.transfer_to === item
                    ? 'border-slate-900 bg-slate-900 text-white'
                    : cashActive
                      ? 'border-slate-200 bg-slate-100 text-slate-400'
                      : 'border-slate-300 bg-white text-slate-700'
                }`}
              >
                {item}
              </button>
            ))}
          </div>
        </div>

        {/* Marketing Fee */}
        <div>
          <label className="mb-2 block text-sm font-medium text-slate-700">Fee Marketing (Rp)</label>
          <input
            inputMode="numeric"
            value={Number(formData.tarif) > 0 ? formatCurrency(formData.tarif) : ''}
            onChange={(e) => setField('tarif', parseCurrency(e.target.value))}
            className="h-11 w-full rounded-2xl border border-slate-300 px-4 text-sm outline-none focus:border-slate-700"
            placeholder="0"
          />
        </div>
      </div>

      {/* Validation Error */}
      {errors.payment && (
        <p className="mt-2 text-xs text-red-500">{errors.payment}</p>
      )}

      {/* Deposit Section */}
      <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3">
        <p className="mb-2 text-xs font-semibold text-amber-700">Deposit Tamu (tidak masuk omset)</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-amber-700">Tunai (Rp)</label>
            <input
              inputMode="numeric"
              value={Number(formData.deposit_amount) > 0 ? formatCurrency(formData.deposit_amount) : ''}
              onChange={handleDepositCashChange}
              className="h-10 w-full rounded-xl border border-amber-300 bg-white px-3 text-sm outline-none focus:border-amber-500"
              placeholder="0"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-amber-700">Transfer (Rp)</label>
            <input
              inputMode="numeric"
              value={Number(formData.deposit_amount) > 0 ? formatCurrency(formData.deposit_amount) : ''}
              onChange={handleDepositCashChange}
              className="h-10 w-full rounded-xl border border-amber-300 bg-white px-3 text-sm outline-none focus:border-amber-500"
              placeholder="0"
            />
          </div>
        </div>
      </div>
    </SectionCard>
  );
}
