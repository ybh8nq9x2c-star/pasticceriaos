// =============================================================================
// components/ui/StatusBadge.tsx
// Badge di stato riutilizzabile con varianti semantiche.
// =============================================================================

type BadgeVariant =
  | 'gray'
  | 'blue'
  | 'indigo'
  | 'green'
  | 'red'
  | 'amber'
  | 'gold'
  | 'navy'
  | 'teal';

const VARIANTS: Record<BadgeVariant, string> = {
  gray:   'bg-gray-100 text-gray-600',
  blue:   'bg-blue-100 text-blue-700',
  indigo: 'bg-indigo-100 text-indigo-700',
  green:  'bg-[#27AE60]/12 text-[#1E7E45]',
  red:    'bg-[#C0392B]/12 text-[#C0392B]',
  amber:  'bg-amber-100 text-amber-700',
  gold:   'bg-[#C9962A]/15 text-[#8A6418]',
  navy:   'bg-[#1A2B4A] text-white',
  teal:   'bg-[#2A7D6B]/12 text-[#2A7D6B]',
};

export function StatusBadge({
  label,
  variant = 'gray',
  className = '',
}: {
  label: string;
  variant?: BadgeVariant;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${VARIANTS[variant]} ${className}`}
    >
      {label}
    </span>
  );
}
