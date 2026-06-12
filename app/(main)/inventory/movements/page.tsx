// =============================================================================
// app/(main)/inventory/movements/page.tsx
// Storico movimenti di magazzino — Server Component.
// =============================================================================

import type { Metadata } from 'next';
import Link from 'next/link';
import { listMovements } from '@/modules/inventory/service';
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
  manual_adjustment:  'bg-amber-100 text-amber-700',
  initial_stock:      'bg-primary-light text-primary',
  return_to_supplier: 'bg-indigo-100 text-indigo-700',
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('it-IT', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

export default async function MovementsPage() {
  const movements = await listMovements(undefined, 100);

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="flex items-start justify-between mb-8">
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
          className="px-4 py-2.5 bg-primary text-primary-fg rounded-xl text-sm font-semibold hover:bg-primary-hover transition-colors"
        >
          + Registra movimento
        </Link>
      </div>

      {movements.length === 0 ? (
        <div className="text-center py-20 bg-surface-2 rounded-2xl border border-border">
          <p className="text-4xl mb-3">📋</p>
          <p className="text-lg font-bold text-ink">Nessun movimento</p>
          <p className="text-sm text-ink-muted mt-1">I movimenti vengono registrati automaticamente dagli ordini e dalla produzione.</p>
        </div>
      ) : (
        <div className="bg-surface-2 rounded-2xl border border-border overflow-hidden">
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
      )}
    </div>
  );
}
