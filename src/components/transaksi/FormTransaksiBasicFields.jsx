import React from 'react';
import Select from 'react-select';
import { MapPin, DoorOpen, Clock3, UserCircle2 } from 'lucide-react';
import { SectionCard } from '@/components/shared/SectionCard';
import {
  RENTAL_TYPE_OPTIONS,
  DURATION_OPTIONS_TRANSIT,
  DURATION_OPTIONS_PER_MALAM,
  SHIFT_OPTIONS,
  selectStyles,
} from '@/lib/transactionConstants';

/**
 * FormTransaksiBasicFields — Guest identity, location, room, rental type,
 * duration, shift, and check-in time fields.
 *
 * @param {object}   props
 * @param {object}   props.formData        - Current form state (useTransactionForm)
 * @param {Function} props.setField        - Single-field setter
 * @param {object}   props.errors          - Validation errors
 * @param {Array}    props.lokasiOptions   - React-Select options for location
 * @param {Array}    props.kamarOptions    - React-Select options for rooms (filtered)
 */
export function FormTransaksiBasicFields({ formData, setField, errors, lokasiOptions, kamarOptions }) {
  const selectedDurationOptions =
    formData.rental_type === 'PER_MALAM' ? DURATION_OPTIONS_PER_MALAM : DURATION_OPTIONS_TRANSIT;

  return (
    <>
      {/* ─── Customer & Unit ─────────────────────────────── */}
      <SectionCard icon={UserCircle2} title="Data Penyewa" subtitle="Identitas customer dan unit apartemen">
        <div className="space-y-4">
          {/* Guest Name */}
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">
              Nama Customer <span className="text-red-500">*</span>
            </label>
            <input
              value={formData.guest_name || ''}
              onChange={(e) => setField('guest_name', e.target.value)}
              className={`h-11 w-full rounded-2xl border px-4 text-sm outline-none focus:border-slate-700 ${
                errors.guest_name ? 'border-red-400' : 'border-slate-300'
              }`}
              placeholder="Masukkan nama customer"
            />
            {errors.guest_name && <p className="mt-1 text-xs text-red-500">{errors.guest_name}</p>}
          </div>

          {/* Phone */}
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">No. Telepon</label>
            <input
              value={formData.phone || ''}
              onChange={(e) => setField('phone', e.target.value)}
              className="h-11 w-full rounded-2xl border border-slate-300 px-4 text-sm outline-none focus:border-slate-700"
              placeholder="08xxx (opsional)"
            />
          </div>

          {/* Location Select */}
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">
              Lokasi Apartemen <span className="text-red-500">*</span>
            </label>
            <Select
              styles={selectStyles}
              menuPortalTarget={document.body}
              options={lokasiOptions}
              placeholder="Pilih lokasi..."
              value={lokasiOptions.find((x) => x.value === formData.apartment_location) || null}
              onChange={(opt) => {
                setField('apartment_location', opt?.value || '');
                setField('room_number', '');
              }}
              isClearable
            />
            {errors.apartment_location && <p className="mt-1 text-xs text-red-500">{errors.apartment_location}</p>}
          </div>

          {/* Room Select */}
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">
              Nomor Kamar <span className="text-red-500">*</span>
            </label>
            <Select
              styles={selectStyles}
              menuPortalTarget={document.body}
              options={kamarOptions}
              placeholder={formData.apartment_location ? 'Pilih nomor kamar...' : 'Pilih lokasi terlebih dahulu'}
              value={kamarOptions.find((x) => x.value === formData.room_number) || null}
              onChange={(opt) => setField('room_number', opt?.value || '')}
              isDisabled={!formData.apartment_location}
              isClearable
            />
            {errors.room_number && <p className="mt-1 text-xs text-red-500">{errors.room_number}</p>}
          </div>
        </div>
      </SectionCard>

      {/* ─── Rental & Marketing ──────────────────────────── */}
      <SectionCard icon={Clock3} title="Sewa & Shift" subtitle="Durasi sewa, shift, dan waktu check-in">
        <div className="space-y-4">
          {/* Check-in */}
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">
              Waktu Check-in <span className="text-red-500">*</span>
            </label>
            <input
              type="datetime-local"
              value={formData.checkin_at || ''}
              onChange={(e) => setField('checkin_at', e.target.value)}
              className={`h-11 w-full rounded-2xl border px-4 text-sm outline-none focus:border-slate-700 ${
                errors.checkin_at ? 'border-red-400' : 'border-slate-300'
              }`}
            />
            {errors.checkin_at && <p className="mt-1 text-xs text-red-500">{errors.checkin_at}</p>}
          </div>

          {/* Rental Type Toggle */}
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">
              Jenis Sewa <span className="text-red-500">*</span>
            </label>
            <div className="mb-3 grid grid-cols-2 gap-2">
              {RENTAL_TYPE_OPTIONS.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => {
                    setField('rental_type', item.value);
                    setField('rental_duration', '');
                    setField('custom_hours', '');
                  }}
                  className={`rounded-xl px-3 py-2 text-sm font-semibold transition ${
                    formData.rental_type === item.value
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          {/* Duration Buttons */}
          {formData.rental_type && (
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                Durasi <span className="text-red-500">*</span>
              </label>
              {!formData.rental_type && (
                <p className="mb-2 text-xs text-slate-500">Pilih jenis sewa terlebih dahulu.</p>
              )}
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {selectedDurationOptions.map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setField('rental_duration', item)}
                    className={`rounded-xl px-3 py-2 text-xs font-semibold transition ${
                      formData.rental_duration === item
                        ? 'bg-slate-900 text-white'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    {item}
                  </button>
                ))}
              </div>

              {/* Custom hours input */}
              {formData.rental_duration === 'Custom' && formData.rental_type === 'TRANSIT' && (
                <input
                  type="number"
                  min={1}
                  max={168}
                  value={formData.custom_hours}
                  onChange={(e) => setField('custom_hours', e.target.value)}
                  className="mt-3 h-11 w-full rounded-2xl border border-slate-300 px-4 text-sm outline-none focus:border-slate-700"
                  placeholder="Jumlah jam custom"
                />
              )}
              {formData.rental_duration === 'Custom' && formData.rental_type === 'PER_MALAM' && (
                <input
                  type="number"
                  min={1}
                  max={30}
                  value={formData.custom_hours}
                  onChange={(e) => setField('custom_hours', e.target.value)}
                  className="mt-3 h-11 w-full rounded-2xl border border-slate-300 px-4 text-sm outline-none focus:border-slate-700"
                  placeholder="Jumlah malam custom"
                />
              )}
            </div>
          )}

          {/* Shift */}
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">Shift</label>
            <div className="grid grid-cols-3 gap-2">
              {SHIFT_OPTIONS.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setField('shift', item)}
                  className={`rounded-xl px-3 py-2 text-sm font-semibold transition ${
                    formData.shift === item
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  {item}
                </button>
              ))}
            </div>
          </div>
        </div>
      </SectionCard>
    </>
  );
}
