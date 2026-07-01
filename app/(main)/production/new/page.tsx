'use client';
import { useFormState } from 'react-dom';

// =============================================================================
// app/(main)/production/new/page.tsx
// Crea un nuovo piano di produzione con righe ricette (Client Component).
// =============================================================================

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Cake } from 'lucide-react';
import { IDLE_STATE, UNIT_LABELS } from '@/lib/utils';
import { createPlanAction } from '@/modules/production/actions';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { QuantityStepper } from '@/components/ui/QuantityStepper';
import { StickyActionBar } from '@/components/ui/StickyActionBar';
import type { UnitOfMeasure } from '@/lib/database.types';

interface RecipeOption { id: string; name: string; emoji: string | null; basePortions: number }
interface PlanRow { key: number; recipeId: string; batchCount: string; notes: string }
interface LiveRequirement {
  ingredientProductId: string;
  ingredientName: string;
  unit: UnitOfMeasure;
  totalRequired: number;
  currentStock: number;
  shortage: number;
  status: 'ok' | 'warn' | 'danger';
}
interface PlanSuggestion {
  kind: 'last' | 'sameWeekday';
  planDate: string;
  label: string;
  items: { recipeId: string; recipeName: string; batchCount: number }[];
}
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
  const [requirements, setRequirements] = useState<LiveRequirement[]>([]);
  const [reqLoading, setReqLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<PlanSuggestion[]>([]);

  const [state, formAction] = useFormState(createPlanAction, IDLE_STATE);

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

  // Template ricorrenti (Task 2): carica i suggerimenti e, se la vista è ancora
  // vuota, PRECOMPILA con l'ultimo piano → non si parte da una tela bianca.
  useEffect(() => {
    fetch('/api/production/suggestions')
      .then((r) => (r.ok ? r.json() : { suggestions: [] }))
      .then((d) => {
        const sugg: PlanSuggestion[] = Array.isArray(d.suggestions) ? d.suggestions : [];
        setSuggestions(sugg);
        if (sugg.length > 0) {
          setRows((prev) =>
            prev.length === 1 && prev[0].recipeId === '' // solo se l'utente non ha già toccato
              ? sugg[0].items.map((it) => ({ key: ++keyCounter, recipeId: it.recipeId, batchCount: String(it.batchCount), notes: '' }))
              : prev,
          );
        }
      })
      .catch(() => {});
  }, []);

  function applySuggestion(s: PlanSuggestion) {
    setRows(s.items.map((it) => ({ key: ++keyCounter, recipeId: it.recipeId, batchCount: String(it.batchCount), notes: '' })));
  }
  function startBlank() {
    setRows([{ key: ++keyCounter, recipeId: '', batchCount: '1', notes: '' }]);
  }

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

  // FABBISOGNO LIVE (Task 1): a ogni modifica righe/quantità ricalcola da solo —
  // niente bottone "Calcola" separato. Debounce 350ms + abort della richiesta stale.
  const itemsKey = rows.map((r) => `${r.recipeId}:${r.batchCount}`).join('|');
  useEffect(() => {
    const items = rows
      .filter((r) => r.recipeId && (parseInt(r.batchCount) || 0) > 0)
      .map((r) => ({ recipeId: r.recipeId, batchCount: parseInt(r.batchCount) || 1 }));
    if (items.length === 0) {
      setRequirements([]);
      setReqLoading(false);
      return;
    }
    const ctrl = new AbortController();
    setReqLoading(true);
    const t = setTimeout(() => {
      fetch('/api/production/requirements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items }),
        signal: ctrl.signal,
      })
        .then((r) => (r.ok ? r.json() : { requirements: [] }))
        .then((d) => setRequirements(Array.isArray(d.requirements) ? d.requirements : []))
        .catch(() => {})
        .finally(() => setReqLoading(false));
    }, 350);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemsKey]);

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
    <div className="p-4 sm:p-6 lg:p-8 max-w-2xl mx-auto">
      <div className="mb-6">
        <Link href="/production" className="text-sm text-ink-muted hover:text-ink transition-colors">
          ← Produzione
        </Link>
        <h1 className="text-2xl sm:text-3xl font-bold text-ink mt-3">Nuovo piano di produzione</h1>
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
                <p className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary-hover">
                  <Cake size={15} aria-hidden="true" className="shrink-0" />
                  {customerOrders.length} {customerOrders.length === 1 ? 'ordine cliente' : 'ordini clienti'} con ritiro in questa data
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

        {/* Template ricorrenti (Task 2): riparti da un piano sensato, non da zero */}
        {suggestions.length > 0 && (
          <div className="rounded-2xl border border-border bg-surface-2 p-4">
            <p className="text-xs font-semibold text-ink-muted uppercase tracking-wide mb-2">Riparti da un piano</p>
            <div className="flex flex-wrap gap-2">
              {suggestions.map((s) => (
                <button
                  key={s.kind}
                  type="button"
                  onClick={() => applySuggestion(s)}
                  className="px-3 py-1.5 rounded-full border border-border bg-bg text-xs font-semibold text-ink hover:bg-surface-offset transition-colors"
                >
                  {s.kind === 'last' ? '↺ ' : '📅 '}
                  {s.label} · {s.items.length} ricett{s.items.length === 1 ? 'a' : 'e'}
                </button>
              ))}
              <button
                type="button"
                onClick={startBlank}
                className="px-3 py-1.5 rounded-full border border-dashed border-border text-xs font-semibold text-ink-muted hover:text-ink transition-colors"
              >
                Da capo
              </button>
            </div>
          </div>
        )}

        {/* Ricette nel piano */}
        <div className="bg-surface-2 rounded-2xl border border-border p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-bold text-ink">
              Ricette <span className="text-danger">*</span>
              {(() => {
                const n = rows.filter((r) => r.recipeId && (parseInt(r.batchCount) || 0) > 0).length;
                return n > 0 ? (
                  <span className="ml-2 text-xs font-semibold text-primary align-middle">
                    {n} selezionat{n === 1 ? 'a' : 'e'}
                  </span>
                ) : null;
              })()}
            </h2>
            <button
              type="button"
              onClick={addRow}
              className="min-h-[44px] px-2 text-xs font-semibold text-primary hover:underline"
            >
              + Aggiungi ricetta
            </button>
          </div>

          <div className="space-y-3">
            {rows.map((row, idx) => {
              const recipe = recipes.find((r) => r.id === row.recipeId);
              const selected = row.recipeId !== '' && (parseInt(row.batchCount) || 0) > 0;
              const totalPortions = recipe ? recipe.basePortions * (parseInt(row.batchCount) || 0) : null;
              return (
                // Mobile: card impilata (ricetta su riga piena, stepper sotto).
                // Da sm in su: riga compatta come prima. Selezionata → bordo primario.
                <div
                  key={row.key}
                  className={`rounded-xl border p-3 sm:p-2 flex flex-wrap gap-2 items-center transition-colors ${
                    selected ? 'border-primary-soft bg-primary-light/30' : 'border-border'
                  }`}
                >
                  <span className="text-xs text-ink-muted w-5 text-center font-mono">{idx + 1}</span>

                  <select
                    aria-label={`Ricetta riga ${idx + 1}`}
                    value={row.recipeId}
                    onChange={(e) => updateRow(row.key, 'recipeId', e.target.value)}
                    className="min-w-full sm:min-w-0 sm:flex-1 rounded-xl border border-border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-ring bg-surface-2"
                  >
                    <option value="">Seleziona ricetta…</option>
                    {recipes.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.emoji ?? '📖'} {r.name}
                      </option>
                    ))}
                  </select>

                  <QuantityStepper
                    value={row.batchCount}
                    onChange={(v) => updateRow(row.key, 'batchCount', v)}
                    min={1}
                    label={recipe ? `infornate di ${recipe.name}` : 'infornate'}
                  />
                  <span className="text-xs text-ink-muted font-mono min-w-[64px]">
                    {recipe
                      ? `${totalPortions} pz (${recipe.basePortions}/inf.)`
                      : ''}
                  </span>

                  {rows.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeRow(row.key)}
                      aria-label={`Rimuovi riga ${idx + 1}`}
                      className="ml-auto flex items-center justify-center w-11 h-11 rounded-md text-ink-faint hover:text-danger hover:bg-danger-light transition-colors text-lg leading-none"
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

        {/* Fabbisogno LIVE — si aggiorna da solo mentre componi il piano (Task 1) */}
        {(requirements.length > 0 || reqLoading) && (
          <div id="fabbisogno" className="bg-surface-2 rounded-2xl border border-border p-6 scroll-mt-24">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-bold text-ink">Fabbisogno ingredienti</h2>
              <span className="text-xs text-ink-muted">{reqLoading ? 'Aggiorno…' : 'Aggiornato'}</span>
            </div>
            <div className="space-y-2">
              {requirements.map((req) => {
                const cfg =
                  req.status === 'danger'
                    ? { dot: 'bg-danger', txt: 'text-danger' }
                    : req.status === 'warn'
                      ? { dot: 'bg-warning', txt: 'text-warning-strong' }
                      : { dot: 'bg-success', txt: 'text-success-strong' };
                return (
                  <div key={req.ingredientProductId} className="flex items-center gap-3 text-sm">
                    <span className={`w-2 h-2 rounded-full shrink-0 ${cfg.dot}`} />
                    <span className="flex-1 text-ink truncate">{req.ingredientName}</span>
                    <span className="font-mono text-xs text-ink-muted">
                      {req.totalRequired} / {req.currentStock} {UNIT_LABELS[req.unit]}
                    </span>
                    {req.shortage > 0 ? (
                      <Link
                        href={`/orders/new?ingredient=${req.ingredientProductId}&qty=${req.shortage}`}
                        className={`shrink-0 text-xs font-semibold ${cfg.txt} hover:underline whitespace-nowrap`}
                      >
                        manca {req.shortage} {UNIT_LABELS[req.unit]} · Ordina →
                      </Link>
                    ) : (
                      <span className="shrink-0 text-xs text-success-strong">OK</span>
                    )}
                  </div>
                );
              })}
            </div>
            {requirements.some((r) => r.shortage > 0) && (
              <p className="mt-3 text-xs text-ink-muted">
                Gli ingredienti in rosso/giallo non bastano per questo piano: ordina prima di produrre.
              </p>
            )}
          </div>
        )}

        {/* CTA primaria SEMPRE visibile su mobile (niente scroll fino in fondo). */}
        <StickyActionBar>
          {(() => {
            const shortageCount = requirements.filter((r) => r.shortage > 0).length;
            return shortageCount > 0 ? (
              <p className="mb-1.5 text-xs font-medium text-warning-strong">
                Mancano {shortageCount} ingredient{shortageCount === 1 ? 'e' : 'i'} per questo piano —{' '}
                <a href="#fabbisogno" className="underline">vedi e ordina</a>. Puoi comunque salvare.
              </p>
            ) : null;
          })()}
          <div className="flex gap-3">
            <Link
              href="/production"
              className="flex-1 py-3 text-center rounded-xl border border-border text-sm font-semibold text-ink bg-surface-2 hover:bg-surface-offset"
            >
              Annulla
            </Link>
            <SubmitButton
              pendingLabel="Creazione…"
              className="flex-1 py-3 bg-primary text-primary-fg rounded-xl text-sm font-semibold hover:bg-primary-hover transition-colors"
            >
              Crea piano
            </SubmitButton>
          </div>
        </StickyActionBar>
      </form>
    </div>
  );
}
