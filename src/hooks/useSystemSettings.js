import { useState, useEffect } from 'react';
import { supabase } from '@/lib/customSupabaseClient';

/**
 * useSystemSettings — Fetches system_settings from Supabase
 * with realtime subscription.
 *
 * Returns:
 *  isMaintenance  – Whether maintenance mode is active
 *  appName        – Application display name
 *  isLoading      – True while initial fetch is in progress
 */
export function useSystemSettings() {
  const [isMaintenance, setIsMaintenance] = useState(false);
  const [appName, setAppName] = useState('Kakarama Room');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchSettings = async () => {
      setIsLoading(true);
      const { data } = await supabase.from('system_settings').select('*');
      if (data) {
        const m = data.find((s) => s.key === 'maintenance_mode');
        const n = data.find((s) => s.key === 'app_name');
        if (m) setIsMaintenance(m.value === true);
        if (n) {
          setAppName(n.value);
          document.title = n.value;
        }
      }
      setIsLoading(false);
    };

    fetchSettings();

    const channel = supabase
      .channel('system_settings_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'system_settings' }, fetchSettings)
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, []);

  return { isMaintenance, appName, isLoading };
}
