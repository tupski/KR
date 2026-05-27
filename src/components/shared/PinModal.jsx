import React from 'react';
import { Lock } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import PinInput from '@/components/PinInput';

/**
 * PinModal — Reusable PIN input modal for protected operations.
 *
 * Uses PinInput for 6-digit entry and isValidFinancePin from authConfig
 * for validation. The parent receives the validated PIN via onPinValidated.
 *
 * @param {object} props
 * @param {boolean} props.open - Whether the modal is visible
 * @param {(open: boolean) => void} props.onOpenChange - Dialog open state setter
 * @param {(pin: string) => void} props.onPinComplete - Called when all 6 digits entered
 * @param {string} [props.title] - Modal title (default: "Akses Terbatas")
 * @param {string} [props.description] - Modal description
 */
export function PinModal({
  open,
  onOpenChange,
  onPinComplete,
  title = 'Akses Terbatas',
  description = 'Masukkan PIN untuk mengubah data transaksi.',
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Lock className="h-5 w-5" />
            {title}
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <PinInput onComplete={onPinComplete} />
      </DialogContent>
    </Dialog>
  );
}
