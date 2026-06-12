'use client';
import { useFormState } from 'react-dom';

// =============================================================================
// app/(main)/production/new/page.tsx
// Crea un nuovo piano di produzione con righe ricette (Client Component).
// =============================================================================

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { IDLE_STATE } from '@/lib/utils';
import { createPlanAction } from '@/modules/production/actions';

interface RecipeOption { id: string; name: string; emoji: string | null; basePortions: number }
interface PlanRow { key: number; recipeId: string; batchCount: string; notes: string }
interface CustomerOrderForDate {
  id: string;
  customerName: string;
  pickupTime: string | null;
  items: { recipeId: string | null; recipeName: string | null; description: string; quantity: number }[];
}

let keyCounter = 0;

function today() {
  return new Date().toISOString().slice(0, 10);
}

export default function NewProductionPage() {
  const router = useRouter();
  const [recipes, setRecipes] = useState<RecipeOption[]>([]);
  const [rows, setRows] = useState<PlanRow[]>([
    { key: ++keyCounter, recipeId: '', batchCount: '1', notes: '' },
  ]);
  const [planDate, setPlanDate] = useState(today());
  const [customerOrders, setCustomerOrders] = useState<CustomerOrderForDate[]>([]);

  const [state, formAction, pending] = useFormState(createPlanAction, IDLE_STATE);

  useEffect(() => {
    fetch('/api/catalog/recipes')
      .then((r) => r.ok ? r.json() : [])
      .then(setRecipes)
      .catch(() => []);
  }, []);

  // Ordini clienti REALI per la data scelta: il piano li deve coprire.
  useEffect(() => {
    fetch(`/api/customers/orders?date=${planDate}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setCustomerOrders(Array.isArray(data) ? data : []))
      .catch(() => setCustomerOrders([]));
  }, [planDate]);

  /** Aggiunge al piano le ricette degli ordini clienti (batch per coprire i pezzi). */
  function addFromCustomerOrders() {
    const needed = new Map<string, number>(); // recipeId -> pezzi totali
    for (const order of customerOrders) {
      for (const item of order.items) {
        if (item.recipeId) {
          needed.set(item.recipeId, (needed.get(item.recipeId) ?? 0) + item.quantity);
        }
      }
    }
    if (needed.size === 0) return;

    setRows((prev) => {
      const next = [...prev.filter((r) => r.recipeId !== '' || prev.length === 1)];
      for (const [recipeId, pieces] of needed) {
        const recipe = recipes.find((r) => r.id === recipeId);
        const batches = recipe ? Math.max(1, Math.ceil(pieces / recipe.basePortions)) : 1;
        const existing = next.find((r) => r.recipeId === recipeId);
        if (existing) {
          existing.batchCount = String(Math.max(parseInt(existing.batchCount) || 0, batches));
          existing.notes = existing.notes || 'include ordini clienti';
        } else {
          next.push({
            key: ++keyCounter,
            recipeId,
            batchCount: String(batches),
            notes: 'include ordini clienti',
          });
        }
      }
      return next.filter((r) => r.recipeId !== '' || next.length === 1);
    });
  }

  useEffect(() => {
    if (state.status === 'success') router.push('/production');
  }, [state, router]);

  function addRow() {
    setRows((p) => [...p, { key: ++keyCounter, recipeId: '', batchCount: '1', notes: '' }]);
  }

  function removeRow(key: number) {
    setRows((p) => p.filter((r) => r.key !== key));
  }

  function updateRow(key: number, field: keyof PlanRow, value: string) {
    setRows((p) => p.map((r) => r.key === key ? { ...r, [field]: value } : r));
  }

  function handleSubmit(formData: FormData) {
    const items = rows.map((r, i) => ({
      recipeId:   r.recipeId,
      batchCount: Number(r.batchCount) || 1,
      notes:      r.notes || null,
      sortOrder:  i,
    }));
    formData.set('items', JSON.stringify(items));
    formAction(formData);
  }

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <div className="mb-6">
        <Link href="/production" className="text-sm text-ink-muted hover:text-ink transition-colors">
          ← Produzione
        </Link>
        <h1 className="text-3xl font-bold text-ink mt-3">Nuovo piano di produzione</h1>
      </div>

      <form action={handleSubmit} className="space-y-6">
        {state.status === 'error' && (
          <div className="rounded-xl bg-danger-light border border-danger-soft p-3 text-sm text-danger">
            {state.error}
          </div>
        )}

        {/* Dati piano */}
        <div className="bg-surface-2 rounded-2xl border border-border p-6 space-y-5">
          <h2 className="text-base font-bold text-ink">Dettagli piano</h2>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-ink mb-1.5">
                Data produzione <span className="text-danger">*</span>
              </label>
              <input
                name="planDate"
                type="date"
                required
                value={planDate}
                onChange={(e) => setPlanDate(e.target.value)}
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
              className="w-full rounded-xl border border-border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-ring focus:border-primary resize-none"
            />
          </div>
        </div>

        {/* Ordini clienti per la data scelta */}
        {customerOrders.length > 0 && (
          <div className="rounded-2xl border border-primary-soft bg-primary-light p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-primary-hover">
                  🎂 {customerOrders.length} {customerOrders.length === 1 ? 'ordine cliente' : 'ordini clienti'} con ritiro in questa data
                </p>
                <ul className="mt-2 space-y-1 text-xs text-ink-muted">
                  {customerOrders.map((o) => (
                    <li key={o.id}>
                      <span className="font-medium text-ink">{o.customerName}</span>
                      {o.pickupTime && ` (${o.pickupTime.slice(0, 5)})`}
                      {' — '}
                      {o.items.map((i) => `${i.quantity}× ${i.recipeName ?? i.description}`).join(', ')}
                    </li>
                  ))}
                </ul>
              </div>
              {customerOrders.some((o) => o.items.some((i) => i.recipeId)) && (
                <button
                  type="button"
                  onClick={addFromCustomerOrders}
                  className="shrink-0 px-3 py-2 bg-primary text-primary-fg rounded-xl text-xs font-semibold hover:bg-primary-hover"
                >
                  + Aggiungi al piano
                </button>
              )}
            </div>
            {customerOrders.some((o) => o.items.some((i) => !i.recipeId)) && (
              <p className="mt-2 text-xs text-primary-hover">
                Gli articoli fuori ricettario non hanno distinta base: vanno pianificati a mano.
              </p>
            )}
          </div>
        )}

        {/* Ricette nel piano */}
        <div className="bg-surface-2 rounded-2xl border border-border p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-bold text-ink">
              Ricette <span className="text-danger">*</span>
            </h2>
            <button
              type="button"
              onClick={addRow}
              className="text-xs font-semibold text-primary hover:underline"
            >
              + Aggiungi ricetta
            </button>
          </div>

          <div className="space-y-3">
            {rows.map((row, idx) => {
              const recipe = recipes.find((r) => r.id === row.recipeId);
              const totalPortions = recipe ? recipe.basePortions * (parseInt(row.batchCount) || 0) : null;
              return (
                <div key={row.key} className="flex gap-2 items-center">
                  <span className="text-xs text-ink-muted w-5 text-center font-mono">{idx + 1}</span>

                  <select
                    value={row.recipeId}
                    onChange={(e) => updateRow(row.key, 'recipeId', e.target.value)}
                    className="flex-1 rounded-xl border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-ring bg-surface-2"
                  >
                    <option value="">Seleziona ricetta…</option>
                    {recipes.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.emoji ?? '📖'} {r.name}
                      </option>
                    ))}
                  </select>

                  <div className="flex flex-col items-center">
                    <input
                      type="number"
                      min={1}
                      value={row.batchCount}
                      onChange={(e) => updateRow(row.key, 'batchCount', e.target.value)}
                      className="w-16 rounded-xl border border-border px-2 py-2 text-sm text-center font-mono focus:outline-none focus:ring-2 focus:ring-primary-ring"
                    />
                    {totalPortions !== null && (
                      <span className="text-xs text-ink-muted mt-0.5 font-mono">{totalPortions} pz</span>
                    )}
                  </div>

                  {rows.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeRow(row.key)}
                      className="text-ink-faint hover:text-danger transition-colors text-lg leading-none"
                    >
                      ×
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {recipes.length === 0 && (
            <p className="mt-3 text-xs text-primary-hover bg-primary-light rounded-xl p-3">
              Nessuna ricetta disponibile.{' '}
              <Link href="/recipes/new" className="underline">Crea una ricetta</Link>{' '}
              prima di pianificare.
            </p>
          )}
        </div>

        <div className="flex gap-3">
          <Link
            href="/production"
            className="flex-1 py-3 text-center rounded-xl border border-border text-sm font-semibold text-ink hover:bg-surface-offset"
          >
            Annulla
          </Link>
          <button
            type="submit"
            disabled={pending}
            className="flex-1 py-3 bg-primary text-primary-fg rounded-xl text-sm font-semibold hover:bg-primary-hover disabled:opacity-60 transition-colors"
          >
            {pending ? 'Creazione…' : 'Crea piano'}
          </button>
        </div>
      </form>
    </div>
  );
}
