// =============================================================================
// <Skeleton> — loading state con shimmer. Rispetta la forma del contenuto
// finale: righe per testo, cerchi per avatar, rettangoli per card.
// =============================================================================

import { cn } from '@/lib/utils';

export function Skeleton({
  className,
  circle = false,
}: {
  className?: string;
  circle?: boolean;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'block animate-shimmer',
        circle ? 'rounded-full' : 'rounded-md',
        className,
      )}
    />
  );
}

/** Riga di testo skeleton (altezza tipografica base). */
export function SkeletonText({ className }: { className?: string }) {
  return <Skeleton className={cn('h-4 w-full', className)} />;
}

/** Card KPI skeleton (per le strip dashboard). */
export function SkeletonKpi() {
  return (
    <div className="bg-surface border border-border rounded-lg shadow-sm p-4 space-y-3">
      <Skeleton className="h-4 w-20" />
      <Skeleton className="h-7 w-16" />
      <Skeleton className="h-3 w-24" />
    </div>
  );
}

/** Righe tabella skeleton (5 righe, larghezze variabili). */
export function SkeletonRows({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  const widths = ['w-3/4', 'w-1/2', 'w-2/3', 'w-1/3', 'w-5/6'];
  return (
    <div className="divide-y divide-divider" role="status" aria-label="Caricamento dati">
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex items-center gap-4 px-4 py-3">
          {Array.from({ length: cols }).map((__, c) => (
            <Skeleton key={c} className={cn('h-4 flex-1', widths[(r + c) % widths.length])} />
          ))}
        </div>
      ))}
    </div>
  );
}
