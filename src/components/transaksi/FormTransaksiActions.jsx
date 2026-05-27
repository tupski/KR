import React from 'react';
import { MapPin, DoorOpen, Building2, UserSquare2, Save, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * FormTransaksiActions — Submit button, reset button, draft indicator,
 * and a compact summary bar showing selected location/room/marketing.
 *
 * @param {object}   props
 * @param {boolean}  props.isSubmitting  - Whether submit is in progress
 * @param {boolean}  props.hasDraft      - Whether a saved draft exists
 * @param {Function} props.onReset       - Reset form to defaults
 * @param {object}   props.formData      - Current form state
 * @param {object}   props.user          - Auth user object
 */
export function FormTransaksiActions({ isSubmitting, hasDraft, onReset, formData, user }) {
  return (
    <div className="space-y-3">
      {/* Summary Bar */}
      <div className="grid grid-cols-1 gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-2">
        <div className="flex items-center gap-2 text-sm text-slate-600">
          <MapPin className="h-4 w-4" />
          <span>Lokasi: {formData.apartment_location || '-'}</span>
        </div>
        <div className="flex items-center gap-2 text-sm text-slate-600">
          <DoorOpen className="h-4 w-4" />
          <span>Kamar: {formData.room_number || '-'}</span>
        </div>
        <div className="flex items-center gap-2 text-sm text-slate-600">
          <Building2 className="h-4 w-4" />
          <span>Marketing: {formData.marketing_name || '-'}</span>
        </div>
        <div className="flex items-center gap-2 text-sm text-slate-600">
          <UserSquare2 className="h-4 w-4" />
          <span>Input oleh: {user?.user_metadata?.full_name || user?.email || '-'}</span>
        </div>
      </div>

      {/* Submit & Reset */}
      <div className="flex items-center gap-3">
        <Button
          type="submit"
          disabled={isSubmitting}
          className="h-14 flex-1 rounded-2xl bg-emerald-600 text-base font-semibold text-white shadow-lg shadow-emerald-200 hover:bg-emerald-700 disabled:opacity-60"
        >
          <Save className="mr-2 h-5 w-5" />
          {isSubmitting ? 'Menyimpan Transaksi...' : 'Simpan Transaksi'}
        </Button>

        {onReset && (
          <Button
            type="button"
            variant="outline"
            onClick={onReset}
            disabled={isSubmitting}
            className="h-14 rounded-2xl border-slate-300 px-4"
            title="Reset formulir"
          >
            <RotateCcw className="h-5 w-5 text-slate-500" />
          </Button>
        )}
      </div>

      {/* Draft Indicator */}
      {hasDraft && (
        <p className="text-center text-xs text-amber-600">
          Draft tersimpan ditemukan. Data akan dipulihkan secara otomatis.
        </p>
      )}
    </div>
  );
}
