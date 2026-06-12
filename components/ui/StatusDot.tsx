// =============================================================================
// <StatusDot> — punto colorato 6px inline col testo.
// =============================================================================

import { cn } from '@/lib/utils';

const COLORS = {
  green:  'bg-success',
  orange: 'bg-warning',
  red:    'bg-danger',
  gray:   'bg-ink-faint',
} as const;

export function StatusDot({
  color,
  className,
  label,
}: {
  color: keyof typeof COLORS;
  className?: string;
  /** Testo per screen reader quando il colore è l'unica informazione. */
  label?: string;
}) {
  return (
    <span
      className={cn('inline-block w-1.5 h-1.5 rounded-full shrink-0 align-middle', COLORS[color], className)}
      aria-label={label}
      role={label ? 'img' : undefined}
      aria-hidden={label ? undefined : true}
    />
  );
}
