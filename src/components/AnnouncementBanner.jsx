import React, { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Megaphone, X } from 'lucide-react';
import { settingsApi } from '@/api/settings.api';
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

/**
 * AnnouncementBanner
 * Menampilkan pengumuman aktif terbaru di bagian atas layar.
 * - Satu banner per waktu (pengumuman paling baru)
 * - Bisa ditutup; state disimpan di sessionStorage (muncul lagi saat reload)
 * 
 * Note: Real-time subscriptions are not available with REST API.
 * The banner will fetch announcements on mount and on window focus.
 */
const AnnouncementBanner = () => {
  const [announcement, setAnnouncement] = useState(null);
  const [dismissed, setDismissed] = useState(false);
  const [showFullModal, setShowFullModal] = useState(false);

  const fetchAnnouncement = useCallback(async () => {
    try {
      // Use settingsApi to fetch announcements
      const announcements = await settingsApi.listAnnouncements();
      
      // Filter for active announcements targeting 'all' audience
      const activeAnnouncement = announcements?.data?.find(
        a => a.type === 'announcement' && (a.audience_role === 'all' || !a.audience_role)
      );
      
      if (!activeAnnouncement) return;

      // Check if dismissed for this session
      const dismissedId = sessionStorage.getItem('kr_dismissed_announcement');
      if (dismissedId === String(activeAnnouncement.id)) {
        setDismissed(true);
      } else {
        setDismissed(false);
      }
      setAnnouncement(activeAnnouncement);
    } catch (error) {
      console.error('Failed to fetch announcement:', error);
    }
  }, []);

  useEffect(() => {
    fetchAnnouncement();

    // Refresh on window focus since we don't have real-time subscriptions
    const handleFocus = () => fetchAnnouncement();
    window.addEventListener('focus', handleFocus);
    
    return () => window.removeEventListener('focus', handleFocus);
  }, [fetchAnnouncement]);

  const handleDismiss = () => {
    if (announcement) {
      sessionStorage.setItem('kr_dismissed_announcement', String(announcement.id));
    }
    setDismissed(true);
  };

  const show = announcement && !dismissed;

  // Calculate line count (estimate: ~60 chars per line at sm size)
  const bodyLineCount = Math.ceil((announcement?.body?.length || 0) / 60);
  const isTruncated = bodyLineCount > 4;

  return (
    <>
      <AnimatePresence>
        {show && (
          <motion.div
            key={announcement.id}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="flex items-start gap-3 bg-amber-400 px-4 py-3 text-amber-950">
              <Megaphone className="mt-0.5 h-4 w-4 flex-shrink-0" />
              <div className="min-w-0 flex-1">
                {announcement.title && (
                  <span className="mr-2 font-bold">{announcement.title}:</span>
                )}
                <span className={`text-sm leading-snug ${isTruncated ? 'line-clamp-4' : ''}`}>
                  {announcement.body}
                </span>
                {isTruncated && (
                  <Dialog open={showFullModal} onOpenChange={setShowFullModal}>
                    <DialogTrigger asChild>
                      <button className="mt-1 text-xs font-semibold text-amber-900 hover:text-amber-800 underline">
                        Selengkapnya
                      </button>
                    </DialogTrigger>
                    <DialogContent className="max-w-md rounded-2xl">
                      <DialogHeader>
                        <DialogTitle>{announcement.title || 'Pengumuman'}</DialogTitle>
                      </DialogHeader>
                      <div className="py-4">
                        <p className="text-sm text-slate-700 whitespace-pre-wrap">{announcement.body}</p>
                      </div>
                    </DialogContent>
                  </Dialog>
                )}
              </div>
              <button
                onClick={handleDismiss}
                aria-label="Tutup pengumuman"
                className="ml-2 flex-shrink-0 rounded-full p-0.5 hover:bg-amber-300 transition"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default AnnouncementBanner;
