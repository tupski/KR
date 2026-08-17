import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Save, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { locationsApi } from '@/api/locations.api.js';
import { usersApi } from '@/api/users.api.js';
import { getRentalConfig } from '@/lib/roomUtils';

const RENTAL_TYPE_OPTIONS = [
  { value: 'TRANSIT', label: 'Transit' },
  { value: 'PER_MALAM', label: 'Per malam' },
];
const TRANSIT_DURATION_OPTIONS = ['3 JAM', '6 JAM', '9 JAM', '12 JAM', '24 JAM', 'Custom'];
const OVERNIGHT_DURATION_OPTIONS = ['Promo Malam', 'Fullday', 'Custom'];
const SHIFT_OPTIONS = ['Pagi', 'Malam', 'Long Shift'];
const TRANSFER_TARGET_OPTIONS = ['Kakarama', 'Marketing'];

const formatRupiah = (value) =>
  value ? new Intl.NumberFormat('id-ID').format(String(value).replace(/[^0-9]/g, '')) : '';
const deformatRupiah = (value) =>
  value ? Number(String(value).replace(/[^0-9]/g, '')) || 0 : 0;

const toDateTimeLocalValue = (dateLike) => {
  const date = new Date(dateLike || new Date());
  if (Number.isNaN(date.getTime())) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
};

const parseCheckInDate = (value) => {
  const parsed = value ? new Date(value) : new Date();
  if (Number.isNaN(parsed.getTime())) return new Date();
  return parsed;
};

/**
 * Autocomplete input for locations, rooms, and marketing.
 * @param {'locations'|'rooms'|'marketing'} type - The type of autocomplete
 * @param {string} value - Current input value
 * @param {function} onValueChange - Callback when value changes
 * @param {string} [location] - Optional location filter for rooms
 */
const AutocompleteInput = ({ type, value, onValueChange, location }) => {
  const [listItems, setListItems] = useState([]);
  const [suggestions, setSuggestions] = useState([]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        if (type === 'locations') {
          const data = await locationsApi.list();
          // Locations API returns array of { name: string }
          setListItems((data || []).map(item => ({ name: item.name || item })));
        } else if (type === 'rooms') {
          const data = await locationsApi.listRoomsWithOccupancy({ location });
          // Rooms API returns { rooms, transactions, paidFees }
          setListItems(((data?.rooms) || []).map(item => ({ name: item.name })));
        } else if (type === 'marketing') {
          const data = await usersApi.list({ role: 'marketing' });
          // Users API returns { data, total, page, limit }
          setListItems(((data?.data) || []).map(item => ({ name: item.name })));
        }
      } catch (err) {
        console.error(`Error fetching ${type}:`, err);
        setListItems([]);
      }
    };
    fetchData();
  }, [type, location]);

  const handleChange = (e) => {
    const v = e.target.value;
    onValueChange(v);
    setSuggestions(v ? listItems.filter((item) => item.name.toLowerCase().includes(v.toLowerCase())) : []);
  };

  return (
    <div className="relative w-full">
      <input type="text" value={value} onChange={handleChange} className="w-full rounded-xl border-2 px-4 py-3 text-gray-900" />
      {suggestions.length > 0 && (
        <div className="absolute z-20 mt-1 max-h-40 w-full overflow-y-auto rounded-lg border bg-white shadow-lg">
          {suggestions.map((item, i) => (
            <div
              key={i}
              className="cursor-pointer px-4 py-2 text-gray-900 hover:bg-gray-100"
              onMouseDown={() => { onValueChange(item.name); setSuggestions([]); }}
            >
              {item.name}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const EditTransaksiModal = ({ transaksi, onClose, onSave }) => {
  const [formData, setFormData] = useState({});

  useEffect(() => {
    const isPerMalam = Number(transaksi.rental_duration || 0) >= 12 && ((transaksi.checkout_at && new Date(transaksi.checkout_at).getHours() === 12) || Number(transaksi.rental_duration || 0) > 24);
    const rentalType = isPerMalam ? 'PER_MALAM' : 'TRANSIT';
    const knownTransit = ['3 JAM', '6 JAM', '9 JAM', '12 JAM', '24 JAM'];
    const transitLabel = knownTransit.includes(`${transaksi.rental_duration} JAM`) ? `${transaksi.rental_duration} JAM` : 'Custom';
    setFormData({
      ...transaksi,
      rental_type: rentalType,
      rental_duration_label: rentalType === 'PER_MALAM' ? 'Promo Malam' : transitLabel,
      custom_duration: String(transaksi.rental_duration || 1),
      checkin_at: toDateTimeLocalValue(transaksi.checkin_at || transaksi.created_at),
      cash_amount: formatRupiah(transaksi.cash_amount),
      transfer_amount: formatRupiah(transaksi.transfer_amount),
      marketing_fee: formatRupiah(transaksi.marketing_fee),
      deposit_cash: formatRupiah(transaksi.deposit_cash),
      deposit_transfer: formatRupiah(transaksi.deposit_transfer),
    });
  }, [transaksi]);

  const set = (field, value) => setFormData((prev) => ({ ...prev, [field]: value }));

  const durationOptions = useMemo(
    () => (formData.rental_type === 'PER_MALAM' ? OVERNIGHT_DURATION_OPTIONS : TRANSIT_DURATION_OPTIONS),
    [formData.rental_type]
  );

  const handleSubmit = (e) => {
    e.preventDefault();
    const checkInDate = parseCheckInDate(formData.checkin_at);
    const rentalConfig = getRentalConfig(formData.rental_type, formData.rental_duration_label, formData.custom_duration, checkInDate);
    onSave({
      ...formData,
      checkin_at: checkInDate.toISOString(),
      checkout_at: rentalConfig.checkoutDate.toISOString(),
      rental_duration: rentalConfig.rentalHours,
      cash_amount: deformatRupiah(formData.cash_amount),
      transfer_amount: deformatRupiah(formData.transfer_amount),
      marketing_fee: deformatRupiah(formData.marketing_fee),
      deposit_cash: deformatRupiah(formData.deposit_cash),
      deposit_transfer: deformatRupiah(formData.deposit_transfer),
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 pb-24 pt-4">
      <motion.div
        initial={{ scale: 0.92, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="w-full max-w-md rounded-3xl bg-white shadow-2xl"
      >
        <div className="flex items-center justify-between border-b p-4">
          <h2 className="text-lg font-bold text-gray-900">Edit Transaksi</h2>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="h-5 w-5" /></Button>
        </div>

        <form onSubmit={handleSubmit} className="max-h-[calc(90vh-130px)] space-y-4 overflow-y-auto p-5">
          {/* Customer */}
          <div>
            <label className="mb-2 block text-sm font-semibold text-gray-700">Nama Customer</label>
            <input type="text" value={formData.customer_name || ''} onChange={(e) => set('customer_name', e.target.value)} className="w-full rounded-xl border-2 px-4 py-3 text-gray-900" required />
          </div>

          {/* Lokasi & Kamar */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-2 block text-sm font-semibold text-gray-700">Lokasi</label>
              <AutocompleteInput type="locations" value={formData.apartment_location || ''} onValueChange={(v) => set('apartment_location', v)} />
            </div>
            <div>
              <label className="mb-2 block text-sm font-semibold text-gray-700">Kamar</label>
              <AutocompleteInput type="rooms" location={formData.apartment_location} value={formData.room_number || ''} onValueChange={(v) => set('room_number', v)} />
            </div>
          </div>

          {/* Marketing */}
          <div>
            <label className="mb-2 block text-sm font-semibold text-gray-700">Marketing</label>
            <AutocompleteInput type="marketing" value={formData.marketing_name || ''} onValueChange={(v) => set('marketing_name', v)} />
          </div>

          <div>
            <label className="mb-2 block text-sm font-semibold text-gray-700">Waktu Check-in</label>
            <input
              type="datetime-local"
              value={formData.checkin_at || ''}
              onChange={(e) => set('checkin_at', e.target.value)}
              className="w-full rounded-xl border-2 px-4 py-2.5 text-gray-900"
            />
          </div>

          {/* Durasi */}
          <div>
            <label className="mb-2 block text-sm font-semibold text-gray-700">Durasi Sewa</label>
            <div className="mb-2 grid grid-cols-2 gap-2">
              {RENTAL_TYPE_OPTIONS.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => setFormData((prev) => ({ ...prev, rental_type: item.value, rental_duration_label: '', custom_duration: '1' }))}
                  className={`rounded-xl px-2 py-2.5 text-xs font-semibold ${formData.rental_type === item.value ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-800'}`}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {durationOptions.map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => set('rental_duration_label', d)}
                  className={`rounded-xl px-2 py-2.5 text-xs font-semibold ${formData.rental_duration_label === d ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-800'}`}
                >
                  {d}
                </button>
              ))}
            </div>
            {formData.rental_duration_label === 'Custom' && (
              <input
                type="number"
                min={1}
                max={formData.rental_type === 'PER_MALAM' ? 30 : 168}
                value={formData.custom_duration || '1'}
                onChange={(e) => set('custom_duration', e.target.value)}
                className="mt-2 w-full rounded-xl border-2 px-4 py-2.5 text-gray-900"
                placeholder={formData.rental_type === 'PER_MALAM' ? 'Jumlah malam' : 'Jumlah jam'}
              />
            )}
          </div>

          {/* Shift & Input oleh */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-2 block text-sm font-semibold text-gray-700">Shift</label>
              <div className="flex flex-col gap-1.5">
                {SHIFT_OPTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => set('shift', s)}
                    className={`rounded-xl px-3 py-2 text-xs font-semibold ${formData.shift === s ? 'bg-pink-500 text-white' : 'bg-gray-100 text-gray-800'}`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="mb-2 block text-sm font-semibold text-gray-700">Diinput oleh</label>
              <AutocompleteInput table="karyawan_list" value={formData.input_by || ''} onValueChange={(v) => set('input_by', v)} />
            </div>
          </div>

          {/* Pembayaran Sewa */}
          <div className="rounded-2xl bg-slate-50 p-4 space-y-3">
            <h3 className="text-sm font-bold text-gray-800">💳 Pembayaran Sewa</h3>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-gray-600">Tunai (Rp)</label>
              <input type="text" value={formData.cash_amount || ''} onChange={(e) => set('cash_amount', formatRupiah(e.target.value))} className="w-full rounded-xl border-2 px-4 py-2.5 text-gray-900" placeholder="0" />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-gray-600">Transfer (Rp)</label>
              <input type="text" value={formData.transfer_amount || ''} onChange={(e) => set('transfer_amount', formatRupiah(e.target.value))} className="w-full rounded-xl border-2 px-4 py-2.5 text-gray-900" placeholder="0" />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-gray-600">Transfer Ke</label>
              <div className="grid grid-cols-2 gap-2">
                {TRANSFER_TARGET_OPTIONS.map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => set('transfer_to', formData.transfer_to === item ? '' : item)}
                    className={`rounded-xl px-3 py-2.5 text-sm font-semibold ${formData.transfer_to === item ? 'bg-slate-900 text-white' : 'bg-gray-100 text-gray-800'}`}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-gray-600">Fee Marketing (Rp)</label>
              <input type="text" value={formData.marketing_fee || ''} onChange={(e) => set('marketing_fee', formatRupiah(e.target.value))} className="w-full rounded-xl border-2 px-4 py-2.5 text-gray-900" placeholder="0" />
            </div>
          </div>

          {/* Deposit */}
          <div className="rounded-2xl bg-amber-50 border border-amber-200 p-4 space-y-3">
            <h3 className="text-sm font-bold text-amber-800">💰 Apakah cs Deposit? (opsional)</h3>
            <p className="text-xs text-amber-600">Kosongkan jika cs tidak deposit</p>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-amber-700">Tunai (Rp)</label>
              <input type="text" value={formData.deposit_cash || ''} onChange={(e) => set('deposit_cash', formatRupiah(e.target.value))} className="w-full rounded-xl border-2 border-amber-200 bg-white px-4 py-2.5 text-gray-900" placeholder="0" />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-amber-700">Transfer (Rp)</label>
              <input type="text" value={formData.deposit_transfer || ''} onChange={(e) => set('deposit_transfer', formatRupiah(e.target.value))} className="w-full rounded-xl border-2 border-amber-200 bg-white px-4 py-2.5 text-gray-900" placeholder="0" />
            </div>
          </div>

          <div className="rounded-2xl bg-slate-50 p-4 space-y-3">
            <h3 className="text-sm font-bold text-gray-800">📎 Berkas (URL)</h3>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-gray-600">KTP URL</label>
              <input
                type="text"
                value={formData.ktp_image_url || ''}
                onChange={(e) => set('ktp_image_url', e.target.value)}
                className="w-full rounded-xl border-2 px-4 py-2.5 text-gray-900"
                placeholder="https://..."
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-gray-600">Bukti Transfer URL</label>
              <input
                type="text"
                value={formData.transfer_proof_url || ''}
                onChange={(e) => set('transfer_proof_url', e.target.value)}
                className="w-full rounded-xl border-2 px-4 py-2.5 text-gray-900"
                placeholder="https://..."
              />
            </div>
          </div>

          <Button type="submit" className="w-full rounded-xl bg-green-500 py-3 font-bold text-white hover:bg-green-600">
            <Save className="mr-2 h-5 w-5" /> Simpan Perubahan
          </Button>
        </form>
      </motion.div>
    </div>
  );
};

export default EditTransaksiModal;
