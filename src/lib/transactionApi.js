import { supabase } from '@/lib/customSupabaseClient';
import { uploadToVercelBlob } from '@/lib/vercelBlobUpload';
import { compressImageFile } from '@/lib/compressImage';

/**
 * Submit a new transaction with optional image uploads.
 *
 * @param {object} payload  - Transaction payload from useTransactionForm.getPayload()
 * @param {object} session  - Current auth session (contains user.id)
 * @returns {Promise<object>} Created transaction record
 */
export async function submitTransaction(payload, session) {
  let ktpUrl = payload.ktp_image;
  let transferUrl = payload.transfer_proof;

  // Upload images if they are still File objects (not yet uploaded)
  if (payload.ktp_image instanceof File) {
    const compressed = await compressImageFile(payload.ktp_image, {
      maxWidth: 1920,
      quality: 0.82,
    });
    ktpUrl = await uploadToVercelBlob(compressed, 'transaksi-proof');
  }

  if (payload.transfer_proof instanceof File) {
    const compressed = await compressImageFile(payload.transfer_proof, {
      maxWidth: 1920,
      quality: 0.82,
    });
    transferUrl = await uploadToVercelBlob(compressed, 'transaksi-proof');
  }

  const dbPayload = {
    ...payload,
    ktp_image: ktpUrl || null,
    transfer_proof: transferUrl || null,
    created_by: session.user.id,
  };

  const { data, error } = await supabase
    .from('transactions')
    .insert(dbPayload)
    .select()
    .single();

  if (error) throw error;

  // Log activity
  const { error: logError } = await supabase.rpc('log_activity', {
    p_action: 'create_transaction',
    p_description: `Transaksi baru: ${payload.guest_name} - Kamar ${payload.room_number}`,
    p_user_id: session.user.id,
  });

  if (logError) throw logError;

  return data;
}

/**
 * Create a new marketing reference entry.
 *
 * @param {string} name - Marketing name
 * @returns {Promise<object>} Created marketing record
 */
export async function createMarketing(name) {
  const { data, error } = await supabase
    .from('marketing')
    .insert({ name })
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Create a new karyawan reference entry.
 *
 * @param {string} name - Karyawan name
 * @returns {Promise<object>} Created karyawan record
 */
export async function createKaryawan(name) {
  const { data, error } = await supabase
    .from('karyawan')
    .insert({ nama: name })
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Delete a transaction using cascade RPC (handles related records).
 *
 * @param {string} transactionId - ID of the transaction to delete
 * @param {string} userId        - User ID for activity log
 * @returns {Promise<any>} RPC result
 */
export async function deleteTransaction(transactionId, userId) {
  const { data, error } = await supabase.rpc('delete_transaction_cascade', {
    p_transaction_id: transactionId,
  });

  if (error) throw error;

  // Log activity
  await supabase.rpc('log_activity', {
    p_action: 'delete_transaction',
    p_description: `Hapus transaksi ID: ${transactionId}`,
    p_user_id: userId,
  });

  return data;
}

/**
 * Allowed fields for transaction updates.
 * @type {string[]}
 */
const ALLOWED_UPDATE_FIELDS = [
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
 * Update a transaction with field-level filtering to prevent unwanted mutations.
 *
 * @param {string} transactionId - ID of the transaction to update
 * @param {object} updates       - Fields to update (filtered to allowed set)
 * @param {string} userId        - User ID for activity log
 * @returns {Promise<object>} Updated transaction record
 */
export async function updateTransaction(transactionId, updates, userId) {
  const filtered = {};
  Object.keys(updates).forEach((key) => {
    if (ALLOWED_UPDATE_FIELDS.includes(key)) {
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
    p_user_id: userId,
  });

  return data;
}
