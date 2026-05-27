/**
 * SectionCard — A simple wrapper component with border and padding.
 *
 * Extracted from inline usage in FormTransaksiModern.jsx.
 * Provides consistent section styling across the application.
 *
 * @param {object} props
 * @param {string} [props.title] - Optional section title
 * @param {React.ElementType} [props.icon] - Optional Lucide icon component to show next to title
 * @param {React.ReactNode} props.children - Section content
 * @param {string} [props.className] - Additional CSS classes
 */
export function SectionCard({ title, icon: Icon, children, className }) {
  return (
    <div className={`rounded-lg border p-4 ${className || ''}`}>
      {title && (
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700">
          {Icon && <Icon className="h-4 w-4" />}
          {title}
        </h3>
      )}
      {children}
    </div>
  );
}
