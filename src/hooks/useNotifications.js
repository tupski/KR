import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '@/lib/customSupabaseClient';

/**
 * useNotifications — Unread notification count with role-based
 * audience filtering and realtime subscription.
 *
 * @param {object} session - Supabase auth session object
 * @param {string} userRole - Current user role
 * @returns {{ unreadCount: number, refreshUnread: () => void }}
 */
export function useNotifications(session, userRole) {
  const [unreadCount, setUnreadCount] = useState(0);

  const audienceFilter = useMemo(() => {
    const userId = session?.user?.id;
    if (!userId) return null;
    if (userRole === 'super_admin')
      return `audience_user_id.eq.${userId},audience_role.eq.super_admin,audience_role.eq.admin,audience_role.eq.all`;
    if (userRole === 'admin')
      return `audience_user_id.eq.${userId},audience_role.eq.admin,audience_role.eq.all`;
    return `audience_user_id.eq.${userId},audience_role.eq.all`;
  }, [session?.user?.id, userRole]);

  const refreshUnread = useCallback(async () => {
    const userId = session?.user?.id;
    if (!userId || !audienceFilter) return;
    try {
      const { data: notif, error: nErr } = await supabase
        .from('notifications')
        .select('id')
        .or(audienceFilter)
        .order('created_at', { ascending: false });
      if (nErr) throw nErr;

      const ids = (notif || []).map((n) => n.id);
      if (!ids.length) {
        setUnreadCount(0);
        return;
      }

      const [{ data: reads, error: rErr }, { data: hidden, error: hErr }] =
        await Promise.all([
          supabase
            .from('notification_reads')
            .select('notification_id')
            .eq('user_id', userId)
            .in('notification_id', ids),
          supabase
            .from('notification_hidden')
            .select('notification_id')
            .eq('user_id', userId)
            .in('notification_id', ids),
        ]);
      if (rErr) throw rErr;
      if (hErr) throw hErr;

      const readSet = new Set((reads || []).map((r) => r.notification_id));
      const hiddenSet = new Set((hidden || []).map((h) => h.notification_id));
      const visibleIds = ids.filter((id) => !hiddenSet.has(id));
      setUnreadCount(visibleIds.filter((id) => !readSet.has(id)).length);
    } catch (_error) {
      setUnreadCount(0);
    }
  }, [session?.user?.id, audienceFilter]);

  useEffect(() => {
    if (!session?.user?.id) return;
    refreshUnread();
    const channel = supabase
      .channel(`notif_badge_${session.user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications' }, refreshUnread)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notification_reads' }, refreshUnread)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notification_hidden' }, refreshUnread)
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [session?.user?.id, audienceFilter, refreshUnread]);

  return { unreadCount, refreshUnread };
}
