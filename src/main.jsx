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

// Establish the version baseline without delaying or reloading the current page.
void checkAppUpdate();

ReactDOM.createRoot(document.getElementById('root')).render(
  <BrowserRouter>
    <AuthProvider>
      <App />
      <Toaster />
      <Analytics />
      <SpeedInsights />
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