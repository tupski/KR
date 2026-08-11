/**
 * Helper untuk mengecek versi aplikasi dan memaksa pembersihan cache jika ada update.
 */
export const checkAppUpdate = async (options = { clearStorage: true }) => {
  try {
    const versionFile = '/version.json';
    
    // Fetch version.json dengan cache: "no-store" agar selalu fresh
    const response = await fetch(`${versionFile}?t=${Date.now()}`, {
      cache: 'no-store',
      headers: {
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
      }
    });

    if (!response.ok) return;

    const data = await response.json();
    const newVersion = data.version;
    const currentVersion = localStorage.getItem('app_version');

    // Jika versi berbeda atau belum ada di localStorage
    if (newVersion && currentVersion !== newVersion) {
      console.log(`[Update] Versi baru terdeteksi: ${newVersion} (Versi lama: ${currentVersion || 'none'})`);

      // 1. Clear PWA Cache
      if ('caches' in window) {
        const cacheNames = await caches.keys();
        await Promise.all(cacheNames.map(name => caches.delete(name)));
        console.log('[Update] Cache PWA dihapus');
      }

      // 2. Unregister Service Workers
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        for (const registration of registrations) {
          await registration.unregister();
        }
        console.log('[Update] Service Worker di-unregister');
        
        // Kirim message ke SW yang sedang aktif (jika ada) untuk hapus cache
        if (navigator.serviceWorker.controller) {
          navigator.serviceWorker.controller.postMessage({ type: 'CLEAR_PWA_CACHE' });
        }
      }

      // 3. Clear Storage (Optional)
      if (options.clearStorage) {
        // Simpan versi baru dulu agar tidak kena clear
        localStorage.setItem('app_version', newVersion);
        
        // Hapus sisanya
        const itemsToKeep = ['app_version'];
        const keys = Object.keys(localStorage);
        keys.forEach(key => {
          if (!itemsToKeep.includes(key)) {
            localStorage.removeItem(key);
          }
        });
        
        sessionStorage.clear();
        console.log('[Update] Local & Session Storage dibersihkan');
      } else {
        localStorage.setItem('app_version', newVersion);
      }

      // 4. Notify user dan reload HANYA jika form tidak sedang dirty
      const isDirty = localStorage.getItem('kr:form-dirty') === '1';
      if (isDirty) {
        // Jangan reload otomatis jika user sedang mengisi form.
        // Tandai ada update pending, reload akan terjadi setelah user submit atau manual refresh.
        localStorage.setItem('kr:app-update-pending', newVersion);
        console.log('[Update] Update pending, tidak reload karena form sedang diisi.');
        return;
      }
      
      // Beri sedikit delay agar proses storage selesai
      setTimeout(() => {
        window.location.reload();
      }, 500);
    }
  } catch (error) {
    console.error('[Update] Gagal mengecek update:', error);
  }
};
