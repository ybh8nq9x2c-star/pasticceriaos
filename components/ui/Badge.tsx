// =============================================================================
// <Badge> — stato entità. Pill, uppercase xs, niente bordi colorati né ombre.
// =============================================================================

import { cn } from '@/lib/utils';

export type BadgeVariant = 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'primary';

// Testo nelle varianti "-strong": garantisce WCAG AA (≥4.5:1) sul fondo tinta.
const VARIANTS: Record<BadgeVariant, string> = {
  success: 'bg-success-light text-success-strong',
  warning: 'bg-warning-light text-warning-strong',
  danger:  'bg-danger-light text-danger',
  info:    'bg-info-light text-info-strong',
  neutral: 'bg-surface-offset text-ink-muted',
  primary: 'bg-primary-light text-primary',
};

const SIZES = {
  sm: 'px-2 py-0.5 text-xs',
  md: 'px-2.5 py-0.5 text-xs',
} as const;

export function Badge({
  children,
  variant = 'neutral',
  size = 'md',
  className,
}: {
  children: React.ReactNode;
  variant?: BadgeVariant;
  size?: 'sm' | 'md';
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full font-medium uppercase tracking-wide whitespace-nowrap animate-state-fade',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
    >
      {children}
    </span>
  );
}
