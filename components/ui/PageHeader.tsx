// =============================================================================
// <PageHeader> — intestazione pagina: titolo (unico h1), sottotitolo, azioni.
// =============================================================================

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';

export function PageHeader({
  title,
  subtitle,
  backHref,
  backLabel,
  action,
  actions,
  className,
}: {
  title: string;
  subtitle?: string;
  backHref?: string;
  backLabel?: string;
  /** Slot azioni a destra (alias storico). */
  action?: React.ReactNode;
  /** Slot azioni a destra. */
  actions?: React.ReactNode;
  className?: string;
}) {
  const right = actions ?? action;
  return (
    <header className={cn('border-b border-divider pb-4 mb-6', className)}>
      {backHref && (
        <Link
          href={backHref}
          className="inline-flex items-center gap-1 text-sm text-ink-muted hover:text-ink transition-colors mb-2"
        >
          <ArrowLeft size={14} aria-hidden="true" />
          {backLabel ?? 'Indietro'}
        </Link>
      )}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold text-ink leading-tight truncate">{title}</h1>
          {subtitle && <p className="text-sm text-ink-muted mt-1">{subtitle}</p>}
        </div>
        {right && <div className="shrink-0 flex items-center gap-2">{right}</div>}
      </div>
    </header>
  );
}
