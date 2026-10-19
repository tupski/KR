import React from 'react';
import ReactDOM from 'react-dom/client';
import App from '@/App';
import '@/index.css';
import { BrowserRouter } from 'react-router-dom';
import { Toaster } from '@/components/ui/toaster';
import { AuthProvider } from '@/contexts/SupabaseAuthContext';
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/react';
import { checkAppUpdate } from '@/utils/checkAppUpdate';
import { initServiceWorkerUpdates } from '@/lib/pwaUpdateManager';
import PwaUpdatePrompt from '@/components/PwaUpdatePrompt';

// Establish the version baseline without delaying or reloading the current page.
void checkAppUpdate();

ReactDOM.createRoot(document.getElementById('root')).render(
  <BrowserRouter>
    <AuthProvider>
      <App />
      <PwaUpdatePrompt />
      <Toaster />
      <Analytics />
      <SpeedInsights />
    </AuthProvider>
  </BrowserRouter>
);

// FIX: Jangan register service worker di localhost/dev mode.
// Service worker bisa menyebabkan reload otomatis saat tab switch dan fetch error
// karena cached responses yang stale.
// UpdateViaCache 'none' memastikan sw.js selalu dicek ke server, sehingga
// update terdeteksi. Prompt update ditangani oleh PwaUpdatePrompt.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    initServiceWorkerUpdates().catch((error) => {
      console.error('SW register gagal:', error);
    });
  });
}
