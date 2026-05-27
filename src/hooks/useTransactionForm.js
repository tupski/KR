import { useState, useCallback } from 'react';
import { toDateTimeLocalValue } from '@/lib/dateUtils';
import { getRentalConfig } from '@/lib/roomUtils';

/**
 * Default form values for a new transaction.
 * @type {object}
 */
const DEFAULTS = {
  guest_name: '',
  phone: '',
  apartment_location: '',
  room_number: '',
  rental_type: 'TRANSIT',
  rental_duration: '2 Jam',
  custom_hours: '',
  checkin_at: toDateTimeLocalValue(new Date()),
  shift: 'PAGI',
  tarif: 0,
  cash_amount: 0,
  transfer_amount: 0,
  transfer_to: '',
  marketing_id: null,
  marketing_name: '',
  deposit_amount: 0,
  ktp_image: null,
  transfer_proof: null,
};

/**
 * Hook for managing transaction form state, validation, and payload construction.
 *
 * @param {object}  [initialData={}]  - Prefilled form values (used for editing)
 * @param {Function} [onReset]        - Optional callback invoked after resetForm()
 * @returns {object} Form state and action functions
 */
export function useTransactionForm(initialData = {}, onReset) {
  const [formData, setFormData] = useState({ ...DEFAULTS, ...initialData });
  const [errors, setErrors] = useState({});

  /**
   * Set a single field value and clear its validation error.
   * @param {string} field - Field name
   * @param {*}      value - New value
   */
  const setField = useCallback((field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  }, []);

  /**
   * Set multiple fields at once and clear errors for changed fields.
   * @param {object} fields - Partial form data to merge
   */
  const setMultipleFields = useCallback((fields) => {
    setFormData((prev) => ({ ...prev, ...fields }));
    setErrors((prev) => {
      const changed = Object.keys(fields);
      if (!changed.some((k) => k in prev)) return prev;
      const next = { ...prev };
      changed.forEach((k) => delete next[k]);
      return next;
    });
  }, []);

  /**
   * Validate all required fields.
   * @returns {boolean} `true` if the form is valid
   */
  const validate = useCallback(() => {
    const next = {};

    if (!formData.guest_name?.trim()) {
      next.guest_name = 'Nama tamu harus diisi';
    }

    if (!formData.apartment_location) {
      next.apartment_location = 'Pilih lokasi';
    }

    if (!formData.room_number) {
      next.room_number = 'Pilih kamar';
    }

    if (!formData.checkin_at) {
      next.checkin_at = 'Waktu check-in harus diisi';
    }

    if (Number(formData.tarif) <= 0) {
      next.tarif = 'Tarif harus lebih dari 0';
    }

    if (Number(formData.cash_amount) <= 0 && Number(formData.transfer_amount) <= 0) {
      next.payment = 'Pilih setidaknya satu metode pembayaran';
    }

    setErrors(next);
    return Object.keys(next).length === 0;
  }, [formData]);

  /**
   * Reset the form to default values.
   */
  const resetForm = useCallback(() => {
    setFormData({ ...DEFAULTS });
    setErrors({});
    if (onReset) onReset();
  }, [onReset]);

  /**
   * Build the payload object ready for submission.
   * Computes rental duration and checkout date via roomUtils.
   * @returns {object} Transaction payload
   */
  const getPayload = useCallback(() => {
    const checkinDate = new Date(formData.checkin_at);
    const { rentalHours, checkoutDate } = getRentalConfig(
      formData.rental_type,
      formData.rental_duration,
      formData.custom_hours,
      checkinDate,
    );

    return {
      guest_name: formData.guest_name.trim(),
      phone: formData.phone?.trim() || null,
      apartment_location: formData.apartment_location,
      room_number: formData.room_number,
      rental_type: formData.rental_type,
      rental_duration: rentalHours,
      checkin_at: formData.checkin_at,
      checkout_at: checkoutDate.toISOString(),
      shift: formData.shift,
      tarif: Number(formData.tarif),
      cash_amount: Number(formData.cash_amount) || 0,
      transfer_amount: Number(formData.transfer_amount) || 0,
      transfer_to: formData.transfer_to?.trim() || null,
      marketing_id: formData.marketing_id,
      ktp_image: formData.ktp_image,
      transfer_proof: formData.transfer_proof,
      deposit_amount: Number(formData.deposit_amount) || 0,
    };
  }, [formData]);

  return {
    formData,
    errors,
    setField,
    setMultipleFields,
    validate,
    resetForm,
    getPayload,
  };
}
