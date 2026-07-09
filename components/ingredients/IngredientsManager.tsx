'use client';

// =============================================================================
// <IngredientsManager> — lista ingredienti con filtro "senza fornitore" e
// assegnazione massiva del fornitore. Gli ingredienti senza fornitore NON
// entrano nel riordino automatico: questa vista li trova e li sistema in blocco.
// Barra azioni sticky in basso per l'uso da telefono.
// =============================================================================

import { memo, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertTriangle } from 'lucide-react';
import { UNIT_LABELS, formatCurrency, IDLE_STATE, cn } from '@/lib/utils';
import { assignSupplierBulkAction } from '@/modules/catalog/actions';
import { Badge } from '@/components/ui/Badge';
import { BulkActionBar } from '@/components/ui/BulkActionBar';
import { useRowSelection } from '@/lib/hooks/useRowSelection';
import type { IngredientProduct } from '@/modules/catalog/types';

// Riga memoizzata: la spunta di una checkbox aggiorna il Set di selezione nel
// parent, ma solo la riga il cui `checked` è cambiato viene ri-renderizzata
// (le altre ricevono props identiche → React.memo le salta). Evita di
// ri-renderizzare l'intera lista a ogni tap su liste lunghe.
const IngredientRow = memo(function IngredientRow({
  ing,
  checked,
  onToggle,
}: {
  ing: IngredientProduct;
  checked: boolean;
  onToggle: (id: string) => void;
}) {
  return (
    <tr className={cn('transition-colors', checked ? 'bg-primary-light/40' : 'hover:bg-surface-offset')}>
      <td className="px-4 py-4">
        <input
          type="checkbox"
          checked={checked}
          onChange={() => onToggle(ing.id)}
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
          <Badge variant="warning" size="sm">senza fornitore</Badge>
        )}
      </td>
      <td className="px-4 py-4 text-right">
        <Link href={`/ingredients/${ing.id}`} className="text-primary text-xs font-semibold hover:underline">
          Modifica
        </Link>
      </td>
    </tr>
  );
});

type Filter = 'all' | 'no-supplier';
interface SupplierOpt {
  id: string;
  name: string;
  email?: string | null;
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
  const sel = useRowSelection();
  const [supplierId, setSupplierId] = useState('');
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  // Copia locale per l'OPTIMISTIC UPDATE: dopo il bulk-assign la lista e il
  // conteggio si aggiornano subito in-page (la persistenza server è già ok),
  // senza dipendere da un reload manuale.
  const [items, setItems] = useState<IngredientProduct[]>(ingredients);

  const noSupplierCount = useMemo(() => items.filter((i) => !i.supplierId).length, [items]);
  const visible = useMemo(
    () => (filter === 'no-supplier' ? items.filter((i) => !i.supplierId) : items),
    [filter, items],
  );

  const visibleIds = visible.map((i) => i.id);
  const allVisibleSelected = sel.allSelected(visibleIds);
  const chosenSupplier = suppliers.find((s) => s.id === supplierId);
  // Quanti dei selezionati hanno GIÀ un fornitore: cambia la parola (Sposta vs Assegna).
  const movingCount = useMemo(
    () => items.filter((i) => sel.has(i.id) && i.supplierId).length,
    [items, sel],
  );
  const verb = movingCount > 0 ? 'Sposta' : 'Assegna';

  async function assign() {
    if (sel.count === 0 || !supplierId) return;
    setPending(true);
    setFeedback(null);
    const fd = new FormData();
    fd.set('ingredientIds', JSON.stringify([...sel.selected]));
    fd.set('supplierId', supplierId);
    const assignedIds = new Set(sel.selected);
    const res = await assignSupplierBulkAction(IDLE_STATE, fd);
    setPending(false);
    if (res.status === 'success') {
      // Optimistic update: rifletti subito il nuovo fornitore sulle righe
      // assegnate (il server ha già persistito) → righe + conteggio aggiornati.
      setItems((prev) =>
        prev.map((i) =>
          assignedIds.has(i.id) ? { ...i, supplierId, supplierName: chosenSupplier?.name ?? i.supplierName } : i,
        ),
      );
      sel.clear();
      setSupplierId('');
      setFeedback({ kind: 'success', text: res.message ?? 'Fornitore assegnato.' });
      router.refresh(); // riconciliazione in background (supplierName autorevole)
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
                    onChange={() => sel.toggleMany(visibleIds)}
                    aria-label="Seleziona tutti i visibili"
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
              {visible.map((ing) => (
                <IngredientRow key={ing.id} ing={ing} checked={sel.has(ing.id)} onToggle={sel.toggle} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Barra azione massiva (grammatica unica: BulkActionBar) — funziona su
          QUALSIASI selezione: assegna un fornitore ai "senza", o SPOSTA a un
          altro fornitore quelli che ne hanno già uno. */}
      <BulkActionBar count={sel.count} onClear={sel.clear}>
        <select
          value={supplierId}
          onChange={(e) => setSupplierId(e.target.value)}
          aria-label="Fornitore da assegnare"
          className="flex-1 rounded-xl border border-border bg-surface-2 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-ring"
        >
          <option value="">
            {suppliers.length === 0 ? '— Nessun fornitore: creane uno prima —' : `— ${verb} a… —`}
          </option>
          {suppliers.map((s) => (
            <option key={s.id} value={s.id}>{s.email ? `${s.name} — ${s.email}` : s.name}</option>
          ))}
        </select>
        <button
          type="button"
          disabled={!supplierId || pending}
          onClick={assign}
          className="shrink-0 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-fg hover:bg-primary-hover disabled:opacity-60 transition-colors"
        >
          {pending ? '…' : `${verb} (${sel.count})`}
        </button>
      </BulkActionBar>

      {/* Preview onesta dell'impatto, mostrata appena scelto il fornitore. */}
      {sel.count > 0 && chosenSupplier && (
        <p className="text-center text-xs text-ink-muted lg:text-left">
          {sel.count} ingredient{sel.count === 1 ? 'e' : 'i'} → <strong className="text-ink">{chosenSupplier.name}</strong>
          {movingCount > 0 && ` (${movingCount} cambiano fornitore)`}
        </p>
      )}
    </div>
  );
}
