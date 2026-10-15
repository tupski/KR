import { useEffect } from 'react';
import { cancelScheduledAppReload, checkAppUpdate } from '@/utils/checkAppUpdate';

export const useDisableAutoReload = () => {
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        cancelScheduledAppReload();
        void checkAppUpdate();
      }
    };

    const handlePageShow = () => {
      cancelScheduledAppReload();
      void checkAppUpdate();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pageshow', handlePageShow);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pageshow', handlePageShow);
      cancelScheduledAppReload();
    };
  }, []);
};
