// =============================================================================
// app/(main)/production/[id]/page.tsx
// Dettaglio piano di produzione con sezione fabbisogno ingredienti.
// Server Component — azioni inlineate come void wrappers.
// =============================================================================

import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getPlan } from '@/modules/production/service';
import { getIngredientRequirements } from '@/modules/reporting/service';
import { completePlanAction, cancelPlanAction } from '@/modules/production/actions';
import { isPendingConfirmation } from '@/modules/production/status';
import { DraftOrdersButton } from './DraftOrdersButton';
import type { PlanStatus } from '@/modules/production/types';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { UNIT_LABELS } from '@/lib/utils';

export const metadata: Metadata = { title: 'Piano di produzione' };

const STATUS_VARIANT: Record<PlanStatus, 'gray' | 'blue' | 'green' | 'red'> = {
  draft:       'gray',
  in_progress: 'blue',
  completed:   'green',
  cancelled:   'red',
};

const STATUS_LABELS: Record<PlanStatus, string> = {
  draft:       'Bozza',
  in_progress: 'In corso',
  completed:   'Completato',
  cancelled:   'Annullato',
};

function formatDate(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('it-IT', {
    weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
  });
}

function formatQty(n: number) {
  return n % 1 === 0 ? String(n) : n.toFixed(2);
}

export default async function ProductionDetailPage({ params }: { params: { id: string } }) {
  let plan;
  try {
    plan = await getPlan(params.id);
  } catch {
    notFound();
  }

  // Fabbisogno ingredienti reale: un errore qui deve emergere (error boundary),
  // non nascondere silenziosamente la sezione shortage.
  const requirements = await getIngredientRequirements(plan.id);

  const canComplete = plan.status === 'draft' || plan.status === 'in_progress';
  const canCancel   = plan.status !== 'completed' && plan.status !== 'cancelled';
  const pending     = isPendingConfirmation(plan.planDate, plan.status); // passato + aperto
  const totalPortions = plan.items.reduce((s, i) => s + i.totalPortions, 0);

  const shortageItems = requirements.filter((r) => r.estimatedShortage > 0);
  const okItems       = requirements.filter((r) => r.estimatedShortage <= 0);

  // Inline server actions (void wrappers — PRESERVATI INVARIATI)
  const planId = plan.id;

  async function handleComplete(_formData: FormData): Promise<void> {
    'use server';
    await completePlanAction(planId);
  }

  async function handleCancel(_formData: FormData): Promise<void> {
    'use server';
    await cancelPlanAction(planId);
  }

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-6">

      {/* Breadcrumb + header */}
      <div>
        <Link href="/production" className="text-sm text-ink-muted hover:text-ink transition-colors">
          ← Produzione
        </Link>
        <div className="flex items-start justify-between gap-4 mt-3">
          <div>
            <h1 className="text-3xl font-bold text-ink capitalize leading-tight">
              {formatDate(plan.planDate)}
            </h1>
            <p className="text-xs text-ink-muted font-mono mt-1.5">
              {plan.items.length} ricette · {totalPortions} porzioni tot.
            </p>
          </div>
          <StatusBadge
            label={pending ? 'Da confermare' : STATUS_LABELS[plan.status]}
            variant={pending ? 'amber' : STATUS_VARIANT[plan.status]}
            className="text-sm px-3 py-1"
          />
        </div>
      </div>

      {/* Promemoria SOFT (piano passato non chiuso): niente auto-completamento,
          solo invito a confermare ESPLICITAMENTE → scarico magazzino via completePlan. */}
      {pending && (
        <div className="mb-6 rounded-2xl border border-warning-soft bg-warning-light/50 px-5 py-4">
          <p className="font-semibold text-ink">Questa produzione non è ancora confermata.</p>
          <p className="text-sm text-ink-muted mt-1">
            Il piano è di un giorno passato. Se l'hai prodotto, confermalo qui sotto: il magazzino verrà aggiornato.
            Se non l'hai prodotto, puoi annullarlo. Nulla viene scaricato in automatico.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">

        {/* ── Colonna principale ─────────────────────────────────────── */}
        <div className="lg:col-span-2 space-y-6">

          {/* Ricette nel piano */}
          <div className="bg-surface-2 rounded-2xl border border-border overflow-hidden">
            <div className="px-6 py-4 border-b border-divider">
              <h2 className="font-semibold text-[15px] text-ink">Ricette</h2>
            </div>
            {plan.items.length === 0 ? (
              <div className="px-6 py-8 text-center text-sm text-ink-muted">
                Nessuna ricetta in questo piano.
              </div>
            ) : (
              <div className="divide-y divide-divider">
                {plan.items.map((item) => (
                  <div key={item.id} className="flex items-center gap-4 px-6 py-4">
                    <span className="text-2xl leading-none shrink-0">{item.recipeEmoji ?? '📖'}</span>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-ink">{item.recipeName}</p>
                      <p className="text-xs text-ink-muted mt-0.5">
                        {item.batchCount} batch × {item.basePortions} porz.
                        {' = '}
                        <span className="font-mono font-medium text-ink">{item.totalPortions} porzioni</span>
                      </p>
                      {item.notes && (
                        <p className="text-xs text-ink-muted mt-1 italic">{item.notes}</p>
                      )}
                    </div>
                    <div className="shrink-0 text-right">
                      <span className="text-2xl font-bold text-primary">
                        {item.batchCount}×
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Fabbisogno ingredienti */}
          {requirements.length > 0 && (
            <div className="bg-surface-2 rounded-2xl border border-border overflow-hidden">
              <div className="flex items-center justify-between px-6 py-4 border-b border-divider">
                <h2 className="font-semibold text-[15px] text-ink">
                  Fabbisogno ingredienti
                </h2>
                {shortageItems.length > 0 && (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-danger-light text-danger">
                    <span className="w-1.5 h-1.5 rounded-full bg-danger" />
                    {shortageItems.length} shortage
                  </span>
                )}
              </div>

              <table className="w-full text-sm">
                <thead className="bg-bg border-b border-border">
                  <tr>
                    <th className="text-left px-6 py-3 font-semibold text-ink-muted text-xs uppercase tracking-wide">Ingrediente</th>
                    <th className="text-right px-6 py-3 font-semibold text-ink-muted text-xs uppercase tracking-wide">Necessario</th>
                    <th className="text-right px-6 py-3 font-semibold text-ink-muted text-xs uppercase tracking-wide">Disponibile</th>
                    <th className="text-center px-6 py-3 font-semibold text-ink-muted text-xs uppercase tracking-wide">Stato</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-divider">
                  {/* Shortage items prima */}
                  {shortageItems.map((req) => (
                    <tr key={req.ingredientProductId} className="bg-danger-light">
                      <td className="px-6 py-3 font-medium text-ink">{req.ingredientName}</td>
                      <td className="px-6 py-3 text-right font-mono text-ink">
                        {formatQty(req.totalRequired)}{' '}
                        <span className="text-xs text-ink-muted font-sans">{UNIT_LABELS[req.unit]}</span>
                      </td>
                      <td className="px-6 py-3 text-right font-mono text-danger">
                        {formatQty(req.currentStock)}{' '}
                        <span className="text-xs font-sans">{UNIT_LABELS[req.unit]}</span>
                      </td>
                      <td className="px-6 py-3 text-center">
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-danger-light text-danger">
                          −{formatQty(req.estimatedShortage)} {UNIT_LABELS[req.unit]}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {/* OK items */}
                  {okItems.map((req) => (
                    <tr key={req.ingredientProductId} className="hover:bg-surface-offset transition-colors">
                      <td className="px-6 py-3 font-medium text-ink">{req.ingredientName}</td>
                      <td className="px-6 py-3 text-right font-mono text-ink">
                        {formatQty(req.totalRequired)}{' '}
                        <span className="text-xs text-ink-muted font-sans">{UNIT_LABELS[req.unit]}</span>
                      </td>
                      <td className="px-6 py-3 text-right font-mono text-success-strong">
                        {formatQty(req.currentStock)}{' '}
                        <span className="text-xs font-sans">{UNIT_LABELS[req.unit]}</span>
                      </td>
                      <td className="px-6 py-3 text-center">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-success-light text-success-strong">
                          OK
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {shortageItems.length > 0 && (
                <div className="px-6 py-4 border-t border-divider bg-bg flex items-center justify-between gap-3">
                  <p className="text-xs text-ink-muted">
                    {shortageItems.length} ingrediente/i non sufficienti per completare il piano.
                    {shortageItems.some((s) => s.estimatedShortageCost !== null) && (
                      <> Costo riordino stimato:{' '}
                        <span className="font-mono font-semibold text-ink">
                          €{shortageItems.reduce((sum, s) => sum + (s.estimatedShortageCost ?? 0), 0).toFixed(2)}
                        </span>
                      </>
                    )}
                  </p>
                  <DraftOrdersButton planId={plan.id} />
                </div>
              )}
            </div>
          )}

        </div>

        {/* ── Colonna azioni ─────────────────────────────────────────── */}
        <div className="space-y-4">

          {plan.notes && (
            <div className="bg-surface-2 rounded-2xl border border-border p-5">
              <h2 className="text-xs font-semibold text-ink-muted uppercase tracking-wide mb-2">Note</h2>
              <p className="text-sm text-ink whitespace-pre-wrap">{plan.notes}</p>
            </div>
          )}

          {plan.status === 'completed' && plan.completedAt && (
            <div className="bg-success-light rounded-2xl border border-success-soft p-5 text-center">
              <div className="w-10 h-10 rounded-full bg-success-light flex items-center justify-center mx-auto mb-2">
                <span className="text-success-strong font-bold text-lg">✓</span>
              </div>
              <p className="text-sm text-success-strong font-semibold">Produzione completata</p>
              <p className="text-xs text-success-strong font-mono mt-1">
                {new Date(plan.completedAt).toLocaleDateString('it-IT', {
                  day: '2-digit', month: 'short', year: 'numeric',
                })}
              </p>
              <p className="text-xs text-ink-muted mt-2">
                Stock magazzino aggiornato.
              </p>
            </div>
          )}

          {canComplete && (
            <form action={handleComplete}>
              {/* Copy chiaro (non "Segna come completato"): l'azione scarica il magazzino.
                  SubmitButton → disabilita + spinner (niente doppio click). */}
              <SubmitButton
                pendingLabel="Confermo…"
                className="w-full py-3 bg-primary text-primary-fg rounded-xl text-sm font-semibold hover:bg-primary-hover transition-colors"
              >
                ✓ Conferma produzione eseguita
              </SubmitButton>
              <p className="mt-1.5 text-xs text-ink-muted text-center">
                Scarica automaticamente dal magazzino gli ingredienti usati.
              </p>
            </form>
          )}

          {canCancel && (
            <form action={handleCancel}>
              <SubmitButton
                pendingLabel="Annullamento…"
                className="w-full py-3 border border-danger-soft text-danger rounded-xl text-sm font-semibold hover:bg-danger-light transition-colors"
              >
                Annulla piano
              </SubmitButton>
            </form>
          )}

        </div>
      </div>
    </div>
  );
}
