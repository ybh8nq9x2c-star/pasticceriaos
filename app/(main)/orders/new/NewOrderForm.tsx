'use client';

// =============================================================================
// app/(main)/orders/new/NewOrderForm.tsx
// Form creazione ordine (Client Component). I dati (fornitori, ingredienti,
// eventuale prefill da shortage piano) arrivano dal Server Component padre:
// nessun fetch client, nessun dato statico.
// =============================================================================

import { useEffect, useState } from 'react';
import { useFormState } from 'react-dom';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { IDLE_STATE } from '@/lib/utils';
import { createOrderAction } from '@/modules/ordering/actions';

export interface SupplierOption   { id: string; name: string }
export interface IngredientOption { id: string; name: string; unit: string; unitPrice: number | null }
export interface PrefillRow {
  ingredientProductId: string;
  quantity: string;
  unitSnapshot: string;
  unitPriceSnapshot: string;
}

interface LineRow extends PrefillRow { key: number }

let keyCounter = 0;

function today() {
  return new Date().toISOString().slice(0, 10);
}

const EMPTY_ROW = (): LineRow => ({
  key: ++keyCounter, ingredientProductId: '', quantity: '', unitSnapshot: 'g', unitPriceSnapshot: '',
});

export function NewOrderForm({
  suppliers,
  ingredients,
  initialSupplierId,
  initialRows,
  prefillNote,
}: {
  suppliers: SupplierOption[];
  ingredients: IngredientOption[];
  initialSupplierId?: string;
  initialRows?: PrefillRow[];
  prefillNote?: string;
}) {
  const router = useRouter();
  const [rows, setRows] = useState<LineRow[]>(
    initialRows && initialRows.length > 0
      ? initialRows.map((r) => ({ ...r, key: ++keyCounter }))
      : [EMPTY_ROW()],
  );

  const [state, formAction, pending] = useFormState(createOrderAction, IDLE_STATE);

  useEffect(() => {
    if (state.status === 'success') router.push('/orders');
  }, [state, router]);

  function addRow() {
    setRows((p) => [...p, EMPTY_ROW()]);
  }

  function removeRow(key: number) {
    setRows((p) => p.filter((r) => r.key !== key));
  }

  function updateRow(key: number, field: keyof PrefillRow, value: string) {
    setRows((p) => p.map((r) => {
      if (r.key !== key) return r;
      const updated = { ...r, [field]: value };
      // Precompila unità e prezzo dall'ingrediente selezionato
      if (field === 'ingredientProductId') {
        const ing = ingredients.find((i) => i.id === value);
        if (ing) {
          updated.unitSnapshot = ing.unit;
          updated.unitPriceSnapshot = ing.unitPrice !== null ? String(ing.unitPrice) : '';
        }
      }
      return updated;
    }));
  }

  function handleSubmit(formData: FormData) {
    const lineItems = rows.map((r) => ({
      ingredientProductId: r.ingredientProductId,
      quantity:            r.quantity,
      unitSnapshot:        r.unitSnapshot,
      unitPriceSnapshot:   r.unitPriceSnapshot || '',
    }));
    formData.set('lineItems', JSON.stringify(lineItems));
    formAction(formData);
  }

  const lineTotal = rows.reduce((sum, r) => {
    const q = parseFloat(r.quantity) || 0;
    const p = parseFloat(r.unitPriceSnapshot) || 0;
    return q && p ? sum + q * p : sum;
  }, 0);

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <div className="mb-6">
        <Link href="/orders" className="text-sm text-ink-muted hover:text-ink transition-colors">
          ← Ordini
        </Link>
        <h1 className="text-3xl font-bold text-ink mt-3">Nuovo ordine d'acquisto</h1>
      </div>

      {prefillNote && (
        <div className="mb-6 rounded-2xl bg-primary-light border border-primary-soft p-4">
          <p className="text-sm font-semibold text-primary-hover">📋 Bozza generata dal fabbisogno</p>
          <p className="text-xs text-ink-muted mt-1">{prefillNote}</p>
        </div>
      )}

      <form action={handleSubmit} className="space-y-6">
        {state.status === 'error' && (
          <div className="rounded-xl bg-danger-light border border-danger-soft p-3 text-sm text-danger">
            {state.error}
          </div>
        )}

        {/* Testata ordine */}
        <div className="bg-surface-2 rounded-2xl border border-border p-6 space-y-5">
          <h2 className="text-base font-bold text-ink">Dettagli ordine</h2>

          <div>
            <label className="block text-sm font-medium text-ink mb-1.5">
              Fornitore <span className="text-danger">*</span>
            </label>
            <select
              name="supplierId"
              required
              defaultValue={initialSupplierId ?? ''}
              className="w-full rounded-xl border border-border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-ring bg-surface-2"
            >
              <option value="">Seleziona fornitore…</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            {suppliers.length === 0 && (
              <p className="text-xs text-danger mt-1.5">
                Nessun fornitore in anagrafica.{' '}
                <Link href="/suppliers/new" className="underline">Creane uno</Link> prima di ordinare.
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-ink mb-1.5">
                Data ordine <span className="text-danger">*</span>
              </label>
              <input
                name="orderDate"
                type="date"
                required
                defaultValue={today()}
                className="w-full rounded-xl border border-border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-ring focus:border-primary"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-ink mb-1.5">
                Consegna prevista <span className="text-ink-muted font-normal">(opz.)</span>
              </label>
              <input
                name="expectedDate"
                type="date"
                className="w-full rounded-xl border border-border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-ring focus:border-primary"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-ink mb-1.5">
              Note <span className="text-ink-muted font-normal">(opz.)</span>
            </label>
            <textarea
              name="notes"
              rows={2}
              maxLength={2000}
              defaultValue={prefillNote ? `Riordino da fabbisogno piano produzione.` : undefined}
              className="w-full rounded-xl border border-border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-ring focus:border-primary resize-none"
            />
          </div>
        </div>

        {/* Righe ordine */}
        <div className="bg-surface-2 rounded-2xl border border-border p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-bold text-ink">
              Prodotti <span className="text-danger">*</span>
            </h2>
            <button
              type="button"
              onClick={addRow}
              className="text-xs font-semibold text-primary hover:underline"
            >
              + Aggiungi riga
            </button>
          </div>

          <div className="space-y-3">
            {rows.map((row, idx) => (
              <div key={row.key} className="grid grid-cols-12 gap-2 items-center">
                <span className="col-span-1 text-xs text-ink-muted text-center font-mono">{idx + 1}</span>

                {/* Ingrediente */}
                <select
                  value={row.ingredientProductId}
                  onChange={(e) => updateRow(row.key, 'ingredientProductId', e.target.value)}
                  className="col-span-5 rounded-xl border border-border px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-ring bg-surface-2"
                >
                  <option value="">Ingrediente…</option>
                  {ingredients.map((i) => (
                    <option key={i.id} value={i.id}>{i.name}</option>
                  ))}
                </select>

                {/* Quantità */}
                <input
                  type="number"
                  step="0.001"
                  min="0"
                  placeholder="Qtà"
                  value={row.quantity}
                  onChange={(e) => updateRow(row.key, 'quantity', e.target.value)}
                  className="col-span-2 rounded-xl border border-border px-2 py-2 text-sm text-center font-mono focus:outline-none focus:ring-2 focus:ring-primary-ring"
                />

                {/* Unità */}
                <select
                  value={row.unitSnapshot}
                  onChange={(e) => updateRow(row.key, 'unitSnapshot', e.target.value)}
                  className="col-span-2 rounded-xl border border-border px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-ring bg-surface-2"
                >
                  {['g','kg','ml','l','pz','bustina','foglio'].map((u) => (
                    <option key={u} value={u}>{u}</option>
                  ))}
                </select>

                {/* Prezzo unitario */}
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="€/u"
                  value={row.unitPriceSnapshot}
                  onChange={(e) => updateRow(row.key, 'unitPriceSnapshot', e.target.value)}
                  className="col-span-1 rounded-xl border border-border px-2 py-2 text-sm text-center font-mono focus:outline-none focus:ring-2 focus:ring-primary-ring"
                />

                {/* Rimuovi */}
                {rows.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeRow(row.key)}
                    className="col-span-1 text-ink-faint hover:text-danger transition-colors text-lg leading-none text-center"
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
          </div>

          {/* Totale stimato */}
          {lineTotal > 0 && (
            <div className="mt-4 pt-4 border-t border-divider flex justify-end">
              <span className="text-sm text-ink-muted">Totale stimato:&nbsp;</span>
              <span className="text-sm font-mono font-semibold text-ink">
                {new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(lineTotal)}
              </span>
            </div>
          )}
        </div>

        <div className="flex gap-3">
          <Link
            href="/orders"
            className="flex-1 py-3 text-center rounded-xl border border-border text-sm font-semibold text-ink hover:bg-surface-offset"
          >
            Annulla
          </Link>
          <button
            type="submit"
            disabled={pending}
            className="flex-1 py-3 bg-primary text-primary-fg rounded-xl text-sm font-semibold hover:bg-primary-hover disabled:opacity-60 transition-colors"
          >
            {pending ? 'Creazione…' : 'Crea ordine'}
          </button>
        </div>
      </form>
    </div>
  );
}
