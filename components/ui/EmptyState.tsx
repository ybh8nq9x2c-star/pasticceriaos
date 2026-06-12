// =============================================================================
// <EmptyState> — nessun dato. Icona Lucide 40px, testo SPECIFICO al contesto
// (mai "Nessun elemento trovato"), CTA opzionale.
// =============================================================================

import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import { Inbox } from 'lucide-react';
import { cn } from '@/lib/utils';

export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  ctaHref,
  ctaLabel,
  cta,
  className,
  bare = false,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  ctaHref?: string;
  ctaLabel?: string;
  /** CTA custom (es. <Button> con server action). */
  cta?: React.ReactNode;
  className?: string;
  /** true: nessun contenitore card (per uso dentro Card/tabella). */
  bare?: boolean;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center text-center py-12 px-6',
        !bare && 'bg-surface border border-border rounded-lg shadow-sm',
        className,
      )}
    >
      <Icon size={40} strokeWidth={1.5} className="text-ink-faint mb-3" aria-hidden="true" />
      <h3 className="text-md font-semibold text-ink">{title}</h3>
      {description && (
        <p className="text-sm text-ink-muted mt-1 max-w-[36ch]">{description}</p>
      )}
      {(cta || (ctaHref && ctaLabel)) && (
        <div className="mt-5">
          {cta ?? (
            <Link
              href={ctaHref!}
              className="inline-flex items-center h-10 px-4 rounded-md bg-primary text-primary-fg text-base font-medium hover:bg-primary-hover transition-colors"
            >
              {ctaLabel}
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
