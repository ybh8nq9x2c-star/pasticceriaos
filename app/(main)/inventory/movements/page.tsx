// =============================================================================
// app/(main)/inventory/movements/page.tsx
// Storico movimenti di magazzino — Server Component.
// =============================================================================

import type { Metadata } from 'next';
import Link from 'next/link';
import { listMovements } from '@/modules/inventory/service';
import { ClipboardList } from 'lucide-react';
import { UNIT_LABELS } from '@/lib/utils';
import type { MovementType } from '@/modules/inventory/types';

export const metadata: Metadata = { title: 'Storico movimenti' };

const MOVEMENT_LABELS: Record<MovementType, string> = {
  purchase_receipt:   'Acquisto ricevuto',
  production_usage:   'Utilizzo produzione',
  waste:              'Scarico / Scarto',
  manual_adjustment:  'Rettifica manuale',
  initial_stock:      'Stock iniziale',
  return_to_supplier: 'Reso fornitore',
};

const MOVEMENT_BADGE: Record<MovementType, string> = {
  purchase_receipt:   'bg-success-light text-success-strong',
  production_usage:   'bg-neutral-light text-ink',
  waste:              'bg-danger-light text-danger',
  manual_adjustment:  'bg-warning-light text-warning-strong',
  initial_stock:      'bg-primary-light text-primary',
  return_to_supplier: 'bg-info-light text-info-strong',
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('it-IT', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

export default async function MovementsPage() {
  const movements = await listMovements(undefined, 100);

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-6 sm:mb-8">
        <div>
          <Link href="/inventory" className="text-sm text-ink-muted hover:text-ink transition-colors">
            ← Magazzino
          </Link>
          <h1 className="text-3xl font-bold text-ink mt-3 leading-tight">
            Storico movimenti
          </h1>
          <p className="text-sm text-ink-muted mt-1.5">
            Ultimi {movements.length} movimenti registrati
          </p>
        </div>
        <Link
          href="/inventory/movement"
          className="px-4 py-2.5 bg-primary text-primary-fg rounded-xl text-sm font-semibold hover:bg-primary-hover transition-colors text-center shrink-0"
        >
          + Registra movimento
        </Link>
      </div>

      {movements.length === 0 ? (
        <div className="text-center py-20 bg-surface-2 rounded-2xl border border-border">
          <ClipboardList size={40} className="mx-auto mb-3 text-ink-faint" aria-hidden="true" />
          <p className="text-lg font-bold text-ink">Nessun movimento</p>
          <p className="text-sm text-ink-muted mt-1">I movimenti vengono registrati automaticamente dagli ordini e dalla produzione.</p>
        </div>
      ) : (
        <>
        {/* Mobile (P0-4): card-stack — il ledger leggibile da telefono.
            Gerarchia: Δ quantità (il fatto) → ingrediente → tipo → data → nota. */}
        <div className="md:hidden bg-surface-2 rounded-2xl border border-border divide-y divide-divider overflow-hidden">
          {movements.map((mv) => (
            <div key={mv.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-ink truncate">{mv.ingredientName}</p>
                  <p className="mt-1">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${MOVEMENT_BADGE[mv.movementType]}`}>
                      {MOVEMENT_LABELS[mv.movementType]}
                    </span>
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className={`font-mono text-base font-bold ${mv.quantityDelta >= 0 ? 'text-success-strong' : 'text-danger'}`}>
                    {mv.quantityDelta >= 0 ? '+' : ''}{mv.quantityDelta}
                    <span className="text-xs font-normal text-ink-muted ml-1">{UNIT_LABELS[mv.unit]}</span>
                  </p>
                  <p className="text-[11px] font-mono text-ink-muted mt-0.5">{formatDate(mv.createdAt)}</p>
                </div>
              </div>
              {mv.notes && <p className="mt-1.5 text-xs text-ink-muted">{mv.notes}</p>}
            </div>
          ))}
        </div>

        {/* Desktop: tabella completa (invariata) */}
        <div className="hidden md:block bg-surface-2 rounded-2xl border border-border overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-bg border-b border-border">
              <tr>
                <th className="text-left px-6 py-3.5 font-semibold text-ink-muted text-xs uppercase tracking-wide">Data</th>
                <th className="text-left px-6 py-3.5 font-semibold text-ink-muted text-xs uppercase tracking-wide">Tipo</th>
                <th className="text-left px-6 py-3.5 font-semibold text-ink-muted text-xs uppercase tracking-wide">Ingrediente</th>
                <th className="text-right px-6 py-3.5 font-semibold text-ink-muted text-xs uppercase tracking-wide">Δ Quantità</th>
                <th className="text-left px-6 py-3.5 font-semibold text-ink-muted text-xs uppercase tracking-wide">Note</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-divider">
              {movements.map((mv) => (
                <tr key={mv.id} className="hover:bg-surface-offset transition-colors">
                  <td className="px-6 py-3.5 text-ink-muted text-xs font-mono whitespace-nowrap">
                    {formatDate(mv.createdAt)}
                  </td>
                  <td className="px-6 py-3.5 whitespace-nowrap">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${MOVEMENT_BADGE[mv.movementType]}`}>
                      {MOVEMENT_LABELS[mv.movementType]}
                    </span>
                  </td>
                  <td className="px-6 py-3.5 font-medium text-ink">
                    {mv.ingredientName}
                  </td>
                  <td className="px-6 py-3.5 text-right font-mono font-medium">
                    <span className={mv.quantityDelta >= 0 ? 'text-success-strong' : 'text-danger'}>
                      {mv.quantityDelta >= 0 ? '+' : ''}{mv.quantityDelta}
                    </span>
                    <span className="text-xs text-ink-muted ml-1">{UNIT_LABELS[mv.unit]}</span>
                  </td>
                  <td className="px-6 py-3.5 text-ink-muted text-xs max-w-xs truncate">
                    {mv.notes ?? '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </>
      )}
    </div>
  );
}
