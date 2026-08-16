import React from 'react';
import ReactDOM from 'react-dom/client';
import App from '@/App';
import '@/index.css';
import { BrowserRouter } from 'react-router-dom';
import { Toaster } from '@/components/ui/toaster';
import { AuthProvider } from '@/contexts/AuthContext';
import { checkAppUpdate } from '@/utils/checkAppUpdate';

// Cek update aplikasi setelah render — jangan block render & jangan clear storage saat startup
// Ini mencegah reload otomatis saat user baru buka app dan form belum tersimpan
setTimeout(() => {
  checkAppUpdate({ clearStorage: false });
}, 5000);

ReactDOM.createRoot(document.getElementById('root')).render(
  <BrowserRouter>
    <AuthProvider>
      <App />
      <Toaster />
    </AuthProvider>
  </BrowserRouter>
);

// FIX: Jangan register service worker di localhost/dev mode.
// Service worker bisa menyebabkan reload otomatis saat tab switch dan fetch error
// karena cached responses yang stale.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((error) => {
      console.error('SW register gagal:', error);
    });
  });
}