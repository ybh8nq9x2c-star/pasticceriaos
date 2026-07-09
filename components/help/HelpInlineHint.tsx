// =============================================================================
// <HelpInlineHint> — LIVELLO A: micro-help contestuale.
// Una riga sola, vicino a un campo/CTA/stato pericoloso. Presentational puro:
// si usa in Server o Client Component. Tono: dice la conseguenza, non "info".
//   <HelpInlineHint>Finché non completi, il magazzino non sa che la merce esiste.</HelpInlineHint>
// tone: 'neutral' (default) | 'warning' | 'danger'.
// =============================================================================

import { Info, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

const TONES = {
  neutral: { wrap: 'text-ink-muted', icon: Info, iconClass: 'text-ink-faint' },
  warning: { wrap: 'text-warning-strong', icon: AlertTriangle, iconClass: 'text-warning-strong' },
  danger:  { wrap: 'text-danger', icon: AlertTriangle, iconClass: 'text-danger' },
} as const;

export function HelpInlineHint({
  children,
  tone = 'neutral',
  className,
}: {
  children: React.ReactNode;
  tone?: keyof typeof TONES;
  className?: string;
}) {
  const t = TONES[tone];
  const Icon = t.icon;
  return (
    <p className={cn('flex items-start gap-1.5 text-xs leading-snug', t.wrap, className)}>
      <Icon size={13} aria-hidden="true" className={cn('mt-0.5 shrink-0', t.iconClass)} />
      <span>{children}</span>
    </p>
  );
}
