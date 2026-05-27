import { supabase } from '@/lib/customSupabaseClient';

/**
 * Check out a room by updating the active transaction's checkout_at timestamp
 * and logging the activity.
 *
 * @param {object} room    - Room object with nomor_kamar and apartment_location
 * @param {object} session - Current auth session (contains user.id)
 * @returns {Promise<object>} Updated transaction record
 */
export async function checkoutRoom(room, session) {
  // 1. Update transaction: set checkout_at to now
  const { data, error } = await supabase
    .from('transactions')
    .update({ checkout_at: new Date().toISOString() })
    .eq('room_number', room.nomor_kamar)
    .is('checkout_at', null)
    .select()
    .single();

  if (error) throw error;

  // 2. Log activity
  const { error: logError } = await supabase.rpc('log_activity', {
    p_action: 'checkout',
    p_description: `Checkout kamar ${room.nomor_kamar} - ${room.apartment_location}`,
    p_user_id: session.user.id,
  });

  if (logError) throw logError;

  return data;
}

/**
 * Log a generic activity entry.
 *
 * @param {string} action      - Activity action identifier
 * @param {string} description - Human-readable description
 * @param {string} userId      - User ID performing the action
 * @returns {Promise<any>} RPC result
 */
export async function logActivity(action, description, userId) {
  const { data, error } = await supabase.rpc('log_activity', {
    p_action: action,
    p_description: description,
    p_user_id: userId,
  });

  if (error) throw error;
  return data;
}
