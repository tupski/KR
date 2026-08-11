import { useEffect, useRef } from 'react';

/**
 * Hook untuk mencegah reload/refresh saat tab disembunyikan dan ditampilkan kembali.
 *
 * FIX: Sekarang menggunakan debounce & throttle untuk mencegah:
 * - Refetch berulang saat visibility change
 * - Fetch error dari notification_hidden saat tab switch
 * - Remount komponen saat focus kembali
 */
export const useDisableAutoReload = () => {
  const timerRef = useRef(null);
  const lastTriggerRef = useRef(0);

  useEffect(() => {
    // Flag untuk tracking visibility state
    let wasHidden = false;

    const handleVisibilityChange = () => {
      if (document.hidden) {
        wasHidden = true;
        console.log('[usePageVisibility] Document hidden');
      } else if (wasHidden) {
        // Page kembali terlihat - prevent automatic reload
        wasHidden = false;
        console.log('[usePageVisibility] Document visible again — preventing reload');

        // FIX: Jangan trigger apa-apa saat kembali ke tab
        // Cukup disable service worker refresh dan stop pending reload timers
        
        // Disable service worker refresh
        if ('serviceWorker' in navigator) {
          navigator.serviceWorker.getRegistrations().then((registrations) => {
            registrations.forEach((registration) => {
              // Skip update check
              registration.onupdatefound = null;
            });
          });
        }

        // Prevent page reload by stopping any pending reload timers
        if (window.pendingReloadTimer) {
          clearTimeout(window.pendingReloadTimer);
          window.pendingReloadTimer = null;
        }

        // FIX: Jangan trigger refetch notifikasi otomatis saat visibility change
        // Biarkan komponen anak yang handle refetch sendiri dengan debounce
        console.log('[usePageVisibility] No automatic refetch triggered');
      }
    };

    // FIX: Focus handler dengan debounce & throttle
    const handleFocus = () => {
      const now = Date.now();
      const elapsed = now - lastTriggerRef.current;
      
      // Throttle: max sekali per 60 detik
      if (elapsed < 60_000) {
        console.log('[usePageVisibility] Focus event throttled — last trigger', Math.round(elapsed / 1000), 's ago');
        return;
      }

      // Skip jika form dirty
      const isFormDirty = localStorage.getItem('kr:form-dirty') === '1';
      if (isFormDirty) {
        console.log('[usePageVisibility] Focus event skipped — form is dirty');
        return;
      }

      lastTriggerRef.current = now;
      console.log('[usePageVisibility] Focus event processed');
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);
    window.addEventListener('pageshow', (event) => {
      // Jika page restore dari back-forward cache, jangan reload
      if (event.persisted) {
        wasHidden = false;
        console.log('[usePageVisibility] Page restored from bfcache — no reload');
      }
    });

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);
};
