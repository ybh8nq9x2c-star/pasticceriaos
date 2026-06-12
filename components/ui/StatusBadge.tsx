// =============================================================================
// <StatusBadge> — adapter di compatibilità sopra <Badge>.
// Le varianti storiche (gray/blue/…/navy/teal) mappano sulle 6 semantiche del
// design system. Nuovo codice: usare direttamente <Badge>.
// =============================================================================

import { Badge, type BadgeVariant } from './Badge';

type LegacyVariant =
  | 'gray'
  | 'blue'
  | 'indigo'
  | 'green'
  | 'red'
  | 'amber'
  | 'gold'
  | 'navy'
  | 'teal';

const MAP: Record<LegacyVariant, BadgeVariant> = {
  gray:   'neutral',
  blue:   'info',
  indigo: 'info',
  green:  'success',
  red:    'danger',
  amber:  'warning',
  gold:   'warning',
  navy:   'primary',
  teal:   'primary',
};

export function StatusBadge({
  label,
  variant = 'gray',
  className = '',
}: {
  label: string;
  variant?: LegacyVariant;
  className?: string;
}) {
  return (
    <Badge variant={MAP[variant]} className={className}>
      {label}
    </Badge>
  );
}
