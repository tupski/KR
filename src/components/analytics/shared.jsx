import React from 'react';
import { Calendar } from 'lucide-react';

/**
 * SectionCard — wrapper card dengan judul + label periode untuk setiap section.
 * Styling konsisten dengan glassmorphic-card yang digunakan di seluruh proyek.
 *
 * @param {object} props
 * @param {string} props.title - Judul section
 * @param {string} [props.periodLabel] - Label periode ringkas (mis. "30 hari terakhir")
 * @param {string} [props.subtitle] - Deskripsi singkat tambahan opsional
 * @param {React.ReactNode} props.children
 */
export function SectionCard({ title, periodLabel, subtitle, children }) {
  return (
    <div className="glassmorphic-card p-5 space-y-4">
      <div className="space-y-1">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-bold text-lg text-gray-800">{title}</h2>
          {periodLabel ? (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-blue-50 border border-blue-200 text-blue-700 text-xs font-semibold whitespace-nowrap">
              <Calendar className="w-3 h-3" />
              {periodLabel}
            </span>
          ) : null}
        </div>
        {subtitle ? (
          <p className="text-xs text-gray-500">{subtitle}</p>
        ) : null}
      </div>
      {children}
    </div>
  );
}

/**
 * SortableHeader — header kolom tabel yang bisa diklik untuk sortir A-Z / Z-A.
 *
 * @param {object} props
 * @param {string} props.label - Label kolom
 * @param {string} props.sortKey - Key data yang dipakai untuk sorting
 * @param {(key: string) => void} props.onSort - Handler klik
 * @param {(key: string) => string} props.getSortIcon - Mengembalikan '↑' | '↓' | '↕'
 * @param {'left' | 'right'} [props.align='left'] - Alignment teks
 * @param {string} [props.className] - Kelas tambahan
 */
export function SortableHeader({
  label,
  sortKey,
  onSort,
  getSortIcon,
  align = 'left',
  className = '',
}) {
  const icon = getSortIcon(sortKey);
  const isActive = icon !== '↕';
  const alignClass = align === 'right' ? 'text-right justify-end' : 'text-left justify-start';

  return (
    <th
      className={`py-2 pr-4 font-semibold ${align === 'right' ? 'text-right' : 'text-left'} ${className}`}
    >
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={`inline-flex items-center gap-1 ${alignClass} w-full select-none hover:text-blue-600 transition-colors ${isActive ? 'text-blue-700' : ''
          }`}
        aria-label={`Sortir ${label}`}
      >
        <span>{label}</span>
        <span className={`text-[11px] ${isActive ? 'text-blue-700' : 'text-gray-400'}`}>{icon}</span>
      </button>
    </th>
  );
}

/**
 * SectionSkeleton — loading state per section menggunakan pola Tailwind animate-pulse.
 */
export function SectionSkeleton() {
  return (
    <div className="glassmorphic-card p-5 space-y-4 animate-pulse">
      {/* Judul placeholder */}
      <div className="h-5 w-40 rounded-lg bg-gray-200" />
      {/* Chart placeholder */}
      <div className="h-40 w-full rounded-xl bg-gray-200" />
      {/* Baris tabel placeholder */}
      <div className="space-y-2">
        <div className="h-4 w-full rounded bg-gray-200" />
        <div className="h-4 w-5/6 rounded bg-gray-200" />
        <div className="h-4 w-4/6 rounded bg-gray-200" />
      </div>
    </div>
  );
}

/**
 * SectionError — error state per section dengan border merah.
 * @param {string} name - Nama section yang mengalami error
 * @param {string} message - Pesan error teknis
 */
export function SectionError({ name, message }) {
  return (
    <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-center text-sm text-red-600">
      <p className="font-semibold">{name}: Data tidak tersedia</p>
      <p className="mt-1 text-xs text-red-400">{message}</p>
    </div>
  );
}

/**
 * SectionEmpty — empty state per section dengan pesan yang dapat dikustomisasi.
 * @param {string} message - Pesan yang ditampilkan saat data kosong
 */
export function SectionEmpty({ message = 'Tidak ada data untuk periode ini.' }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 p-6 text-center text-sm text-gray-500">
      <p>{message}</p>
    </div>
  );
}
