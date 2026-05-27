import { supabase } from '@/lib/customSupabaseClient';
import { compressImageFile } from '@/lib/compressImage';
import { uploadToVercelBlob } from '@/lib/vercelBlobUpload';

/**
 * Process a deposit return: upload proof to Vercel Blob (NOT Supabase Storage),
 * update the transaction record, and log the activity.
 *
 * @param {string}     transactionId - ID of the transaction whose deposit is being returned
 * @param {File|null}  file          - Optional proof image file
 * @param {object}     session       - Current auth session (contains user.id)
 * @returns {Promise<object>} Updated transaction record
 */
export async function returnDeposit(transactionId, file, session) {
  let proofUrl = null;

  // 1. Upload return proof to Vercel Blob if a file is provided
  if (file) {
    const compressed = await compressImageFile(file, {
      maxWidth: 1920,
      quality: 0.82,
    });
    proofUrl = await uploadToVercelBlob(compressed, 'deposit-returns');
  }

  // 2. Update transaction with deposit return info
  const { data, error } = await supabase
    .from('transactions')
    .update({
      deposit_returned: true,
      deposit_returned_at: new Date().toISOString(),
      deposit_returned_by: session.user.id,
      deposit_return_proof: proofUrl,
    })
    .eq('id', transactionId)
    .select()
    .single();

  if (error) throw error;

  // 3. Log activity
  const { error: logError } = await supabase.rpc('log_activity', {
    p_action: 'return_deposit',
    p_description: `Deposit dikembalikan untuk transaksi ID: ${transactionId}`,
    p_user_id: session.user.id,
  });

  if (logError) throw logError;

  return data;
}
