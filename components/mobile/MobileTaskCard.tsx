// =============================================================================
// <MobileTaskCard> — task azionabile "Da fare adesso" (dashboard mobile).
// UNA riga = UN task = UN tap: icona, titolo breve, CTA. Target ≥64px.
// Presentational puro (Server Component friendly).
// =============================================================================

import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export type TaskTone = 'danger' | 'warning' | 'primary';

const TONE: Record<TaskTone, { circle: string; icon: string }> = {
  danger:  { circle: 'bg-danger-light',  icon: 'text-danger' },
  warning: { circle: 'bg-warning-light', icon: 'text-warning-strong' },
  primary: { circle: 'bg-primary-light', icon: 'text-primary' },
};

export function MobileTaskCard({
  href,
  icon: Icon,
  title,
  cta,
  tone = 'primary',
}: {
  href: string;
  icon: LucideIcon;
  title: string;
  cta: string;
  tone?: TaskTone;
}) {
  const t = TONE[tone];
  return (
    <Link
      href={href}
      className="flex items-center gap-3 min-h-[64px] px-4 py-3 rounded-2xl border border-border bg-surface-2 active:bg-surface-offset transition-colors"
    >
      <span
        aria-hidden="true"
        className={cn('flex items-center justify-center w-10 h-10 rounded-full shrink-0', t.circle)}
      >
        <Icon size={19} className={t.icon} />
      </span>
      <span className="flex-1 min-w-0 text-sm font-semibold text-ink leading-snug">{title}</span>
      <span className="shrink-0 text-sm font-semibold text-primary whitespace-nowrap">{cta} →</span>
    </Link>
  );
}
