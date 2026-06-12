// =============================================================================
// <DataTable> — tabella dati desktop (≥768px). Su mobile le pagine rendono la
// lista card equivalente. Header offset, hover SOLO su righe cliccabili,
// colonne numeriche tabular-nums, skeleton e empty state integrati.
// =============================================================================

import { cn } from '@/lib/utils';
import { SkeletonRows } from './Skeleton';

export interface DataTableColumn<Row> {
  key: string;
  header: React.ReactNode;
  /** allinea a destra (numeri) */
  numeric?: boolean;
  className?: string;
  render: (row: Row) => React.ReactNode;
}

export function DataTable<Row>({
  columns,
  rows,
  rowKey,
  onRowHref,
  loading = false,
  empty,
  footer,
  className,
}: {
  columns: DataTableColumn<Row>[];
  rows: Row[];
  rowKey: (row: Row) => string;
  /** Se presente, la riga intera è un link (hover + cursor). */
  onRowHref?: (row: Row) => string | null;
  loading?: boolean;
  /** EmptyState specifico del contesto, renderizzato a tutta larghezza. */
  empty?: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('bg-surface border border-border rounded-lg shadow-sm overflow-hidden', className)}>
      <div className="overflow-x-auto">
        <table className="w-full text-base">
          <thead>
            <tr className="bg-surface-offset">
              {columns.map((col) => (
                <th
                  key={col.key}
                  scope="col"
                  className={cn(
                    'px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-ink-muted text-left whitespace-nowrap',
                    col.numeric && 'text-right',
                    col.className,
                  )}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          {!loading && rows.length > 0 && (
            <tbody className="divide-y divide-divider">
              {rows.map((row) => {
                const href = onRowHref?.(row) ?? null;
                return (
                  <tr
                    key={rowKey(row)}
                    className={cn(
                      'relative',
                      href && 'cursor-pointer hover:bg-[color:var(--color-surface-offset)]/50 transition-colors',
                    )}
                  >
                    {columns.map((col, i) => (
                      <td
                        key={col.key}
                        className={cn(
                          'px-4 py-3 text-ink align-middle',
                          col.numeric && 'text-right tnum',
                          col.className,
                        )}
                      >
                        {/* Prima cella: link overlay per rendere la riga intera navigabile */}
                        {i === 0 && href ? (
                          <a href={href} className="absolute inset-0" aria-label="Apri dettaglio" tabIndex={-1} />
                        ) : null}
                        <span className="relative">{col.render(row)}</span>
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          )}
        </table>
      </div>
      {loading && <SkeletonRows rows={5} cols={Math.min(columns.length, 5)} />}
      {!loading && rows.length === 0 && empty && <div>{empty}</div>}
      {footer && <div className="px-4 py-2.5 border-t border-divider text-sm text-ink-muted">{footer}</div>}
    </div>
  );
}
