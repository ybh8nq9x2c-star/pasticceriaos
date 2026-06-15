'use client';

// =============================================================================
// <IngredientsManager> — lista ingredienti con filtro "senza fornitore" e
// assegnazione massiva del fornitore. Gli ingredienti senza fornitore NON
// entrano nel riordino automatico: questa vista li trova e li sistema in blocco.
// Barra azioni sticky in basso per l'uso da telefono.
// =============================================================================

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertTriangle } from 'lucide-react';
import { UNIT_LABELS, formatCurrency, IDLE_STATE, cn } from '@/lib/utils';
import { assignSupplierBulkAction } from '@/modules/catalog/actions';
import type { IngredientProduct } from '@/modules/catalog/types';

type Filter = 'all' | 'no-supplier';
interface SupplierOpt {
  id: string;
  name: string;
}

export function IngredientsManager({
  ingredients,
  suppliers,
}: {
  ingredients: IngredientProduct[];
  suppliers: SupplierOpt[];
}) {
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [supplierId, setSupplierId] = useState('');
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  const noSupplierCount = useMemo(() => ingredients.filter((i) => !i.supplierId).length, [ingredients]);
  const visible = useMemo(
    () => (filter === 'no-supplier' ? ingredients.filter((i) => !i.supplierId) : ingredients),
    [filter, ingredients],
  );

  const visibleIds = visible.map((i) => i.id);
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));

  function toggle(id: string) {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  function toggleAll() {
    setSelected((prev) => {
      const n = new Set(prev);
      if (allVisibleSelected) visibleIds.forEach((id) => n.delete(id));
      else visibleIds.forEach((id) => n.add(id));
      return n;
    });
  }

  async function assign() {
    if (selected.size === 0 || !supplierId) return;
    setPending(true);
    setFeedback(null);
    const fd = new FormData();
    fd.set('ingredientIds', JSON.stringify([...selected]));
    fd.set('supplierId', supplierId);
    const res = await assignSupplierBulkAction(IDLE_STATE, fd);
    setPending(false);
    if (res.status === 'success') {
      setSelected(new Set());
      setSupplierId('');
      setFeedback({ kind: 'success', text: res.message ?? 'Fornitore assegnato.' });
      router.refresh(); // ricarica i dati server → supplierName aggiornato
    } else if (res.status === 'error') {
      setFeedback({ kind: 'error', text: res.error });
    }
  }

  const chip = (active: boolean) =>
    cn(
      'px-3 py-1.5 rounded-full text-sm font-medium transition-colors',
      active ? 'bg-primary text-primary-fg' : 'bg-surface-2 text-ink-muted border border-border hover:text-ink',
    );

  return (
    <div className="space-y-4 pb-28 lg:pb-4">
      {/* Avviso buchi fornitore */}
      {noSupplierCount > 0 && (
        <button
          type="button"
          onClick={() => setFilter('no-supplier')}
          className="flex w-full items-center gap-2 rounded-xl bg-warning-light px-4 py-3 text-left text-sm text-warning-strong hover:brightness-95 transition"
        >
          <AlertTriangle size={16} aria-hidden="true" className="shrink-0" />
          <span>
            <strong>{noSupplierCount}</strong> ingredient{noSupplierCount === 1 ? 'e' : 'i'} senza fornitore: non
            entrano nel riordino automatico. Tocca per assegnarne uno in blocco.
          </span>
        </button>
      )}

      {feedback && (
        <p
          role={feedback.kind === 'error' ? 'alert' : 'status'}
          className={cn(
            'rounded-md px-3 py-2 text-sm',
            feedback.kind === 'error' ? 'bg-danger-light text-danger' : 'bg-success-light text-success-strong',
          )}
        >
          {feedback.text}
        </p>
      )}

      {/* Filtri */}
      <div className="flex items-center gap-2">
        <button type="button" className={chip(filter === 'all')} onClick={() => setFilter('all')}>
          Tutti ({ingredients.length})
        </button>
        <button type="button" className={chip(filter === 'no-supplier')} onClick={() => setFilter('no-supplier')}>
          Senza fornitore ({noSupplierCount})
        </button>
      </div>

      {visible.length === 0 ? (
        <div className="rounded-2xl border border-border bg-surface-2 p-8 text-center text-sm text-ink-muted">
          {filter === 'no-supplier' ? 'Tutti gli ingredienti hanno un fornitore. 🎉' : 'Nessun ingrediente.'}
        </div>
      ) : (
        <div className="bg-surface-2 rounded-2xl border border-border overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-bg border-b border-border">
              <tr>
                <th className="px-4 py-3.5 w-10">
                  <input
                    type="checkbox"
                    checked={allVisibleSelected}
                    onChange={toggleAll}
                    aria-label="Seleziona tutti"
                    className="h-4 w-4 rounded border-border accent-primary"
                  />
                </th>
                <th className="text-left px-4 py-3.5 font-semibold text-ink-muted text-xs uppercase tracking-wide">Nome</th>
                <th className="text-left px-4 py-3.5 font-semibold text-ink-muted text-xs uppercase tracking-wide">SKU</th>
                <th className="text-left px-4 py-3.5 font-semibold text-ink-muted text-xs uppercase tracking-wide">Unità</th>
                <th className="text-left px-4 py-3.5 font-semibold text-ink-muted text-xs uppercase tracking-wide">Prezzo/unità</th>
                <th className="text-left px-4 py-3.5 font-semibold text-ink-muted text-xs uppercase tracking-wide">Fornitore</th>
                <th className="px-4 py-3.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-divider">
              {visible.map((ing) => {
                const checked = selected.has(ing.id);
                return (
                  <tr key={ing.id} className={cn('transition-colors', checked ? 'bg-primary-light/40' : 'hover:bg-surface-offset')}>
                    <td className="px-4 py-4">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggle(ing.id)}
                        aria-label={`Seleziona ${ing.name}`}
                        className="h-4 w-4 rounded border-border accent-primary"
                      />
                    </td>
                    <td className="px-4 py-4 font-medium text-ink">{ing.name}</td>
                    <td className="px-4 py-4 text-ink-muted font-mono text-xs">{ing.sku ?? '—'}</td>
                    <td className="px-4 py-4 text-ink-muted">{UNIT_LABELS[ing.unit]}</td>
                    <td className="px-4 py-4 text-ink-muted font-mono">
                      {ing.unitPrice !== null ? formatCurrency(ing.unitPrice) : '—'}
                    </td>
                    <td className="px-4 py-4">
                      {ing.supplierName ? (
                        <span className="text-ink-muted">{ing.supplierName}</span>
                      ) : (
                        <span className="inline-flex items-center rounded-full bg-warning-light px-2 py-0.5 text-xs font-semibold text-warning-strong">
                          senza fornitore
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-4 text-right">
                      <Link href={`/ingredients/${ing.id}`} className="text-primary text-xs font-semibold hover:underline">
                        Modifica
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Barra azione massiva sticky */}
      {selected.size > 0 && (
        <div
          className="fixed inset-x-0 bottom-0 z-30 border-t border-divider bg-glass backdrop-blur px-4 py-3 lg:static lg:mt-4 lg:rounded-2xl lg:border lg:border-border lg:bg-surface-2"
          style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
        >
          <div className="mx-auto flex max-w-5xl flex-col gap-2 sm:flex-row sm:items-center">
            <span className="text-sm font-medium text-ink">
              {selected.size} selezionat{selected.size === 1 ? 'o' : 'i'}
            </span>
            <div className="flex flex-1 items-center gap-2">
              <select
                value={supplierId}
                onChange={(e) => setSupplierId(e.target.value)}
                className="flex-1 rounded-xl border border-border bg-surface-2 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-ring"
              >
                <option value="">
                  {suppliers.length === 0 ? '— Nessun fornitore: creane uno prima —' : '— Scegli fornitore —'}
                </option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
              <button
                type="button"
                disabled={!supplierId || pending}
                onClick={assign}
                className="shrink-0 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-fg hover:bg-primary-hover disabled:opacity-60 transition-colors"
              >
                {pending ? 'Assegno…' : `Assegna a ${selected.size}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
