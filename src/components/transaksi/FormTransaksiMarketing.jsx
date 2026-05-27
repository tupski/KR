import React from 'react';
import CreatableSelect from 'react-select/creatable';
import { Building2 } from 'lucide-react';
import { SectionCard } from '@/components/shared/SectionCard';
import { selectStyles } from '@/lib/transactionConstants';

/**
 * FormTransaksiMarketing — Marketing name selector with create-new option.
 *
 * @param {object}   props
 * @param {object}   props.formData            - Current form state
 * @param {Function} props.setField            - Single-field setter
 * @param {Array}    props.marketingOptions    - React-Select options for marketing
 * @param {boolean}  props.requireMarketing    - Whether marketing field is required
 * @param {Function} props.onCreateMarketing   - Called with (inputValue) to create a new marketing entry
 * @param {Function} props.onDeleteMarketing   - Called with (name) to delete a marketing entry
 * @param {boolean}  props.canManageReferences - Whether user can delete marketing entries
 */
export function FormTransaksiMarketing({
  formData,
  setField,
  marketingOptions,
  requireMarketing = false,
  onCreateMarketing,
  onDeleteMarketing,
  canManageReferences = false,
}) {
  const label = requireMarketing ? 'Nama Marketing *' : 'Nama Marketing';

  const handleCreate = (inputValue) => {
    if (onCreateMarketing) {
      onCreateMarketing(inputValue);
    } else {
      // Fallback: just set the field without creating in DB
      setField('marketing_name', inputValue);
    }
  };

  const handleDelete = async () => {
    if (!onDeleteMarketing) return;
    if (!window.confirm(`Hapus nama marketing ${formData.marketing_name}?`)) return;
    await onDeleteMarketing(formData.marketing_name);
  };

  return (
    <SectionCard icon={Building2} title={label} subtitle="Pilih marketing yang menangani transaksi ini">
      <CreatableSelect
        styles={selectStyles}
        menuPortalTarget={document.body}
        options={marketingOptions}
        placeholder="Pilih marketing atau tambah baru..."
        value={marketingOptions.find((x) => x.value === formData.marketing_name) || null}
        onChange={(opt) => setField('marketing_name', opt?.value || '')}
        onCreateOption={handleCreate}
        isClearable
        formatCreateLabel={(inputValue) => `Tambah marketing: ${inputValue}`}
      />

      {canManageReferences && formData.marketing_name && (
        <div className="mt-2 flex gap-3">
          <button
            type="button"
            className="text-sm text-slate-600 hover:text-slate-900"
            onClick={() => setField('marketing_name', '')}
          >
            Kosongkan pilihan
          </button>
          {onDeleteMarketing && (
            <button
              type="button"
              className="text-sm text-red-600 hover:text-red-800"
              onClick={handleDelete}
            >
              Hapus dari daftar
            </button>
          )}
        </div>
      )}
    </SectionCard>
  );
}
