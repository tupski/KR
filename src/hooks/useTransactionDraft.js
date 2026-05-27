import { useEffect, useRef, useCallback } from 'react';

const DRAFT_KEY = 'kr_transaction_draft';
const TOAST_GUARD_KEY = 'kr_draft_toast_shown';

/**
 * Auto-save transaction form data to localStorage as a draft.
 * File objects (ktp_image, transfer_proof) are excluded from persistence.
 *
 * On mount, if a draft exists, it is loaded into the form via setField.
 *
 * @param {object}   formData - Current form data (watched for changes)
 * @param {Function} setField - Single-field setter exposed by useTransactionForm
 * @returns {{ clearDraft: () => void }}
 */
export function useTransactionDraft(formData, setField) {
  const loadedRef = useRef(false);

  // ─── Load draft on mount ──────────────────────────────────
  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;

    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) return;

      const parsed = JSON.parse(raw);
      if (typeof parsed !== 'object' || parsed === null) return;

      Object.entries(parsed).forEach(([key, value]) => {
        setField(key, value);
      });

      // Show toast once per session
      if (!sessionStorage.getItem(TOAST_GUARD_KEY)) {
        sessionStorage.setItem(TOAST_GUARD_KEY, 'true');
        // Lazy-import toast to avoid circular dependency
        import('@/hooks/use-toast').then(({ toast }) => {
          toast.info('Draft tersimpan ditemukan. Melanjutkan input sebelumnya.');
        }).catch(() => {
          // Silently fail — toast is non-critical
        });
      }
    } catch {
      // Ignore corrupt draft data
    }
    // Only run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Auto-save on form changes (debounced 500ms) ──────────
  const timerRef = useRef(null);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);

    timerRef.current = setTimeout(() => {
      try {
        const payload = { ...formData };
        // Don't persist File objects
        delete payload.ktp_image;
        delete payload.transfer_proof;
        localStorage.setItem(DRAFT_KEY, JSON.stringify(payload));
      } catch {
        // Ignore quota / storage errors
      }
    }, 500);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [formData]);

  /**
   * Remove the draft from localStorage after a successful submit.
   */
  const clearDraft = useCallback(() => {
    localStorage.removeItem(DRAFT_KEY);
  }, []);

  return { clearDraft };
}
