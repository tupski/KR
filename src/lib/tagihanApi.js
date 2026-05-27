import { supabase } from '@/lib/customSupabaseClient';

/**
 * Pay one or more tagihan_bulanan bills via RPC.
 *
 * @param {string[]} tagihanIds - Array of bill IDs to mark as paid
 * @param {string}   paidBy    - User ID who processed the payment
 * @param {string}   [buktiBayar] - Optional upload proof URL from Vercel Blob
 * @returns {Promise<any>} RPC result
 */
export async function payTagihanBulanan(tagihanIds, paidBy, buktiBayar = null) {
  const { data, error } = await supabase.rpc('pay_tagihan_bulanan', {
    p_tagihan_ids: tagihanIds,
    p_paid_by: paidBy,
    p_bukti_bayar: buktiBayar,
  });

  if (error) throw error;
  return data;
}

/**
 * Pay multiple fee items in batch via RPC.
 *
 * @param {string[]} feeItemIds - Array of fee item IDs to mark as paid
 * @param {string}   paidBy    - User ID who processed the payment
 * @returns {Promise<any>} RPC result
 */
export async function payFeeItems(feeItemIds, paidBy) {
  const { data, error } = await supabase.rpc('pay_fee_items', {
    p_fee_item_ids: feeItemIds,
    p_paid_by: paidBy,
  });

  if (error) throw error;
  return data;
}

/**
 * Delete a tagihan_bulanan bill by ID.
 *
 * @param {string} id - Bill ID
 * @returns {Promise<void>}
 */
export async function deleteTagihan(id) {
  const { error } = await supabase.from('tagihan_bulanan').delete().eq('id', id);

  if (error) throw error;
}

/**
 * Delete a fee item by ID.
 *
 * @param {string} id - Fee item ID
 * @returns {Promise<void>}
 */
export async function deleteFeeItem(id) {
  const { error } = await supabase.from('fee_items').delete().eq('id', id);

  if (error) throw error;
}

/**
 * Get category summary for expenses via RPC.
 *
 * @param {object} params
 * @param {string} [params.lokasi] - Location filter
 * @param {string} [params.kamar] - Room filter
 * @param {string} [params.startDate] - Date range start
 * @param {string} [params.endDate] - Date range end
 * @returns {Promise<Array>} Category summary data
 */
export async function getCategorySummary({ lokasi, kamar, startDate, endDate } = {}) {
  const { data, error } = await supabase.rpc('get_category_summary', {
    p_lokasi: lokasi || null,
    p_kamar: kamar || null,
    p_start_date: startDate || null,
    p_end_date: endDate || null,
  });

  if (error) throw error;
  return data || [];
}

/**
 * Toggle the recurring flag on a tagihan_bulanan bill.
 *
 * @param {string}  id        - Bill ID
 * @param {boolean} isRecurring - New recurring state
 * @returns {Promise<void>}
 */
export async function toggleTagihanRecurring(id, isRecurring) {
  const { error } = await supabase
    .from('tagihan_bulanan')
    .update({ is_recurring: isRecurring })
    .eq('id', id);

  if (error) throw error;
}
