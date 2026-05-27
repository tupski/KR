import { supabase } from '@/lib/customSupabaseClient';

/**
 * Allowed fields for transaction edits via income dashboard.
 * @type {string[]}
 */
const ALLOWED_EDIT_FIELDS = [
  'guest_name',
  'phone',
  'tarif',
  'cash_amount',
  'transfer_amount',
  'transfer_to',
  'deposit_amount',
  'checkout_at',
  'shift',
  'ktp_image',
  'transfer_proof',
  'marketing_id',
];

/**
 * Edit a transaction from the income dashboard.
 * Filters updates to only allowed fields for safety.
 *
 * @param {string} transactionId - ID of the transaction to edit
 * @param {object} updates       - Fields to update (filtered to allowed set)
 * @param {object} session       - Current auth session (contains user.id)
 * @returns {Promise<object>} Updated transaction record
 */
export async function editTransaction(transactionId, updates, session) {
  const filtered = {};
  Object.keys(updates).forEach((key) => {
    if (ALLOWED_EDIT_FIELDS.includes(key)) {
      filtered[key] = updates[key];
    }
  });

  const { data, error } = await supabase
    .from('transactions')
    .update(filtered)
    .eq('id', transactionId)
    .select()
    .single();

  if (error) throw error;

  // Log activity
  await supabase.rpc('log_activity', {
    p_action: 'edit_transaction',
    p_description: `Edit transaksi ID: ${transactionId}`,
    p_user_id: session.user.id,
  });

  return data;
}

/**
 * Delete a transaction from the income dashboard using cascade RPC.
 *
 * @param {string} transactionId - ID of the transaction to delete
 * @param {object} session       - Current auth session (contains user.id)
 * @returns {Promise<any>} RPC result
 */
export async function deleteTransaction(transactionId, session) {
  const { data, error } = await supabase.rpc('delete_transaction_cascade', {
    p_transaction_id: transactionId,
  });

  if (error) throw error;

  // Log activity
  await supabase.rpc('log_activity', {
    p_action: 'delete_transaction',
    p_description: `Hapus transaksi ID: ${transactionId}`,
    p_user_id: session.user.id,
  });

  return data;
}

/**
 * Edit a deposit record from the income dashboard.
 *
 * @param {string} transactionId - ID of the deposit transaction to edit
 * @param {object} updates       - Fields to update
 * @param {object} session       - Current auth session (contains user.id)
 * @returns {Promise<object>} Updated transaction record
 */
export async function editDeposit(transactionId, updates, session) {
  const filtered = {};
  Object.keys(updates).forEach((key) => {
    if (ALLOWED_EDIT_FIELDS.includes(key)) {
      filtered[key] = updates[key];
    }
  });

  const { data, error } = await supabase
    .from('transactions')
    .update(filtered)
    .eq('id', transactionId)
    .select()
    .single();

  if (error) throw error;

  // Log activity
  await supabase.rpc('log_activity', {
    p_action: 'edit_deposit',
    p_description: `Edit deposit transaksi ID: ${transactionId}`,
    p_user_id: session.user.id,
  });

  return data;
}
