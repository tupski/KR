import React, { useRef } from 'react';
import { Upload, Eye, Landmark } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SectionCard } from '@/components/shared/SectionCard';

/**
 * FormTransaksiFiles — Image upload fields for KTP and transfer proof.
 *
 * @param {object}   props
 * @param {File|null} props.ktpFile         - Selected KTP file
 * @param {File|null} props.transferProofFile - Selected transfer proof file
 * @param {string|null} props.ktpPreviewUrl    - Object URL for KTP preview
 * @param {string|null} props.transferPreviewUrl - Object URL for transfer preview
 * @param {Function} props.onImagePick      - Called with (field, file | null)
 * @param {Function} props.onViewPreview    - Called with ({ src, title, downloadName })
 */
export function FormTransaksiFiles({
  ktpFile,
  transferProofFile,
  ktpPreviewUrl,
  transferPreviewUrl,
  onImagePick,
  onViewPreview,
}) {
  const ktpInputRef = useRef(null);
  const transferInputRef = useRef(null);

  const handleKtpChange = (e) => {
    onImagePick('ktp_image', e.target.files?.[0] || null);
  };

  const handleTransferChange = (e) => {
    onImagePick('transfer_proof', e.target.files?.[0] || null);
  };

  return (
    <SectionCard
      icon={Upload}
      title="Unggah Berkas"
      subtitle="KTP dan bukti transfer (gambar dikompres otomatis)"
    >
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {/* KTP Upload */}
        <div className="space-y-2">
          <label className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-4 text-center">
            <Upload className="mb-1 h-5 w-5 text-slate-500" />
            <span className="text-sm font-medium text-slate-700">Upload KTP</span>
            <span className="text-xs text-slate-500">{ktpFile?.name || 'Pilih file gambar'}</span>
            <input
              ref={ktpInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleKtpChange}
            />
          </label>
          {ktpPreviewUrl && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() =>
                onViewPreview({
                  src: ktpPreviewUrl,
                  title: 'KTP',
                  downloadName: ktpFile?.name || 'ktp.jpg',
                })
              }
            >
              <Eye className="mr-2 h-4 w-4" />
              Pratinjau KTP
            </Button>
          )}
        </div>

        {/* Transfer Proof Upload */}
        <div className="space-y-2">
          <label className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-4 text-center">
            <Landmark className="mb-1 h-5 w-5 text-slate-500" />
            <span className="text-sm font-medium text-slate-700">Upload Bukti Transfer</span>
            <span className="text-xs text-slate-500">{transferProofFile?.name || 'Pilih file gambar'}</span>
            <input
              ref={transferInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleTransferChange}
            />
          </label>
          {transferPreviewUrl && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() =>
                onViewPreview({
                  src: transferPreviewUrl,
                  title: 'Bukti transfer',
                  downloadName: transferProofFile?.name || 'bukti.jpg',
                })
              }
            >
              <Eye className="mr-2 h-4 w-4" />
              Pratinjau bukti
            </Button>
          )}
        </div>
      </div>
    </SectionCard>
  );
}
