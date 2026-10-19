import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  applyUpdate,
  dismissUpdate,
  getState,
  subscribe,
} from '@/lib/pwaUpdateManager';

export default function PwaUpdatePrompt() {
  const [snapshot, setSnapshot] = useState(() => getState());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const busyRef = useRef(false);

  useEffect(() => subscribe(setSnapshot), []);

  const state = snapshot?.state ?? 'idle';
  const isActivating = state === 'activating' || busy;
  const open = state === 'available' || isActivating;

  const handleOpenChange = useCallback((nextOpen) => {
    if (!nextOpen) dismissUpdate();
  }, []);

  const handleApply = useCallback(async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError(false);

    let ok = false;
    try {
      ok = await applyUpdate();
    } catch (_err) {
      ok = false;
    }

    busyRef.current = false;
    setBusy(false);
    if (!ok) setError(true);
  }, []);

  if (!open) return null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Update baru tersedia</DialogTitle>
          <DialogDescription>
            Versi terbaru Kakarama Room tersedia. Muat ulang aplikasi untuk
            menggunakan versi terbaru.
          </DialogDescription>
        </DialogHeader>
        {error && (
          <p className="text-sm font-medium text-destructive" role="alert">
            Gagal memperbarui aplikasi. Coba lagi.
          </p>
        )}
        <DialogFooter className="flex-col-reverse gap-2 sm:flex-row">
          <Button
            type="button"
            variant="outline"
            onClick={() => dismissUpdate()}
            disabled={isActivating}
          >
            Nanti
          </Button>
          <Button type="button" onClick={handleApply} disabled={isActivating}>
            {isActivating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isActivating ? 'Memuat ulang…' : 'Muat Ulang'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
