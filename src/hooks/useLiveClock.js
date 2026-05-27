import { useState, useEffect, useMemo } from 'react';

/**
 * useLiveClock — Tracks current time with 1-second precision.
 *
 * Returns a formatted Indonesian locale date/time string
 * for display in the app header.
 */
export function useLiveClock() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const liveDateTime = useMemo(() => {
    const opts = {
      timeZone: 'Asia/Jakarta',
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    };
    const dateStr = now.toLocaleDateString('id-ID', opts);
    const timeStr = now.toLocaleTimeString('id-ID', {
      timeZone: 'Asia/Jakarta',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    return `${dateStr} — ${timeStr} WIB`;
  }, [now]);

  return { now, liveDateTime };
}
