'use client';

// =============================================================================
// app/(main)/production/new/NewPlanForm.tsx
// Form piano di produzione. I dati iniziali (ricette, suggerimenti, ordini di
// oggi) arrivano dal SERVER via props (P0-1: niente fetch client mute). Le due
// letture dinamiche — ordini per data e fabbisogno live — passano da server
// action tipizzate: o dati, o errore visibile con "Riprova". Mai liste vuote
// ambigue.
// =============================================================================

import { useEffect, useRef, useState, useTransition } from 'react';
import { useFormState } from 'react-dom';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Cake } from 'lucide-react';
import { IDLE_STATE, UNIT_LABELS } from '@/lib/utils';
import {
  createPlanAction,
  ordersForPlanDateAction,
  previewRequirementsAction,
  type PlanDateOrder,
} from '@/modules/production/actions';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { QuantityStepper } from '@/components/ui/QuantityStepper';
import { StickyActionBar } from '@/components/ui/StickyActionBar';
import type { UnitOfMeasure } from '@/lib/database.types';

export interface RecipeOption { id: string; name: string; emoji: string | null; basePortions: number }
export interface PlanSuggestionOption {
  kind: 'last' | 'sameWeekday';
  planDate: string;
  label: string;
  items: { recipeId: string; recipeName: string; batchCount: number }[];
}
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

let keyCounter = 0;

export function NewPlanForm({
  recipes,
  suggestions,
  initialOrders,
  initialDate,
  loadErrors,
}: {
  recipes: RecipeOption[];
  suggestions: PlanSuggestionOption[];
  initialOrders: PlanDateOrder[];
  initialDate: string;
  loadErrors: string[];
}) {
  const router = useRouter();
  // Precompila dall'ultimo piano (se esiste): mai partire da una tela bianca.
  const [rows, setRows] = useState<PlanRow[]>(() =>
    suggestions.length > 0
      ? suggestions[0].items.map((it) => ({ key: ++keyCounter, recipeId: it.recipeId, batchCount: String(it.batchCount), notes: '' }))
      : [{ key: ++keyCounter, recipeId: '', batchCount: '1', notes: '' }],
  );
  const [planDate, setPlanDate] = useState(initialDate);
  const [customerOrders, setCustomerOrders] = useState<PlanDateOrder[]>(initialOrders);
  const [ordersError, setOrdersError] = useState<string | null>(null);
  const [ordersPending, startOrdersTransition] = useTransition();
  const [requirements, setRequirements] = useState<LiveRequirement[]>([]);
  const [reqLoading, setReqLoading] = useState(false);
  const [reqError, setReqError] = useState<string | null>(null);

  const [state, formAction] = useFormState(createPlanAction, IDLE_STATE);

  // Ordini clienti REALI per la data scelta: server action, errore visibile.
  function loadOrdersFor(date: string) {
    startOrdersTransition(async () => {
      const res = await ordersForPlanDateAction(date);
      if (res.ok) {
        setCustomerOrders(res.orders);
        setOrdersError(null);
      } else {
        setCustomerOrders([]);
        setOrdersError(res.error);
      }
    });
  }

  function onDateChange(date: string) {
    setPlanDate(date);
    if (date === initialDate) {
      setCustomerOrders(initialOrders);
      setOrdersError(null);
    } else {
      loadOrdersFor(date);
    }
  }

  function applySuggestion(s: PlanSuggestionOption) {
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
          next.push({ key: ++keyCounter, recipeId, batchCount: String(batches), notes: 'include ordini clienti' });
        }
      }
      return next.filter((r) => r.recipeId !== '' || next.length === 1);
    });
  }

  useEffect(() => {
    if (state.status === 'success') router.push('/production');
  }, [state, router]);

  // FABBISOGNO LIVE: server action debounced; le risposte stale si scartano
  // con un contatore di richiesta (le action non sono abortabili).
  const reqSeq = useRef(0);
  const itemsKey = rows.map((r) => `${r.recipeId}:${r.batchCount}`).join('|');
  useEffect(() => {
    const items = rows
      .filter((r) => r.recipeId && (parseInt(r.batchCount) || 0) > 0)
      .map((r) => ({ recipeId: r.recipeId, batchCount: parseInt(r.batchCount) || 1 }));
    if (items.length === 0) {
      setRequirements([]);
      setReqLoading(false);
      setReqError(null);
      return;
    }
    const seq = ++reqSeq.current;
    setReqLoading(true);
    const t = setTimeout(async () => {
      const res = await previewRequirementsAction(items);
      if (seq !== reqSeq.current) return; // risposta stale: ignora
      if (res.ok) {
        setRequirements(res.requirements as LiveRequirement[]);
        setReqError(null);
      } else {
        setReqError(res.error);
      }
      setReqLoading(false);
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemsKey]);

  function addRow() {
    setRows((p) => [...p, { key: ++keyCounter, recipeId: '', batchCount: '1', notes: '' }]);
  }
  function removeRow(key: number) {
    setRows((p) => p.filter((r) => r.key !== key));
  }
  function updateRow(key: number, field: keyof PlanRow, value: string) {
    setRows((p) => p.map((r) => (r.key === key ? { ...r, [field]: value } : r)));
  }

  function handleSubmit(formData: FormData) {
    const items = rows.map((r, i) => ({
      recipeId: r.recipeId,
      batchCount: Number(r.batchCount) || 1,
      notes: r.notes || null,
      sortOrder: i,
    }));
    formData.set('items', JSON.stringify(items));
    formAction(formData);
  }

  return (
    <form action={handleSubmit} className="space-y-6">
      {/* Sorgenti server non disponibili: dirlo chiaramente, mai liste mute. */}
      {loadErrors.length > 0 && (
        <div role="alert" className="rounded-xl bg-warning-light border border-warning-soft p-3 text-sm text-warning-strong">
          {loadErrors.join(' ')}{' '}
          <button type="button" onClick={() => router.refresh()} className="font-semibold underline">
            Ricarica
          </button>
        </div>
      )}
      {state.status === 'error' && (
        <div role="alert" className="rounded-xl bg-danger-light border border-danger-soft p-3 text-sm text-danger">
          {state.error}
        </div>
      )}

      {/* Dati piano */}
      <div className="bg-surface-2 rounded-2xl border border-border p-6 space-y-5">
        <h2 className="text-base font-bold text-ink">Dettagli piano</h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-ink mb-1.5">
              Data produzione <span className="text-danger">*</span>
            </label>
            <input
              name="planDate"
              type="date"
              required
              value={planDate}
              onChange={(e) => onDateChange(e.target.value)}
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
      {ordersError ? (
        <div role="alert" className="rounded-2xl border border-warning-soft bg-warning-light/50 p-4 text-sm text-warning-strong">
          Non riesco a leggere gli ordini clienti per questa data ({ordersError}).{' '}
          <button type="button" onClick={() => loadOrdersFor(planDate)} className="font-semibold underline">
            Riprova
          </button>
        </div>
      ) : ordersPending ? (
        <p className="text-xs text-ink-muted px-1">Controllo gli ordini clienti per questa data…</p>
      ) : customerOrders.length > 0 ? (
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
      ) : null}

      {/* Template ricorrenti: riparti da un piano sensato, non da zero */}
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
                  {recipe ? `${totalPortions} pz (${recipe.basePortions}/inf.)` : ''}
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

      {/* Fabbisogno LIVE — si aggiorna da solo; se il calcolo fallisce, LO DICE. */}
      {reqError && (
        <div role="alert" className="rounded-2xl border border-warning-soft bg-warning-light/50 p-4 text-sm text-warning-strong">
          Fabbisogno non aggiornato ({reqError}). I numeri sotto potrebbero essere vecchi — riprova
          modificando una quantità.
        </div>
      )}
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
  );
}
