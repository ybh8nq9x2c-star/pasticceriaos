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
import type { PlanStatus } from '@/modules/production/types';
import { StatusBadge } from '@/components/ui/StatusBadge';
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
        <Link href="/production" className="text-sm text-[#6B7280] hover:text-[#1A2B4A] transition-colors">
          ← Produzione
        </Link>
        <div className="flex items-start justify-between gap-4 mt-3">
          <div>
            <h1 className="font-playfair text-3xl font-bold text-[#1A2B4A] capitalize leading-tight">
              {formatDate(plan.planDate)}
            </h1>
            <p className="text-xs text-[#6B7280] font-mono mt-1.5">
              {plan.items.length} ricette · {totalPortions} porzioni tot.
            </p>
          </div>
          <StatusBadge
            label={STATUS_LABELS[plan.status]}
            variant={STATUS_VARIANT[plan.status]}
            className="text-sm px-3 py-1"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">

        {/* ── Colonna principale ─────────────────────────────────────── */}
        <div className="lg:col-span-2 space-y-6">

          {/* Ricette nel piano */}
          <div className="bg-white rounded-2xl border border-[#E5DDD0] overflow-hidden">
            <div className="px-6 py-4 border-b border-[#F0EBE1]">
              <h2 className="font-semibold text-[15px] text-[#1A2B4A]">Ricette</h2>
            </div>
            {plan.items.length === 0 ? (
              <div className="px-6 py-8 text-center text-sm text-[#6B7280]">
                Nessuna ricetta in questo piano.
              </div>
            ) : (
              <div className="divide-y divide-[#F0EBE1]">
                {plan.items.map((item) => (
                  <div key={item.id} className="flex items-center gap-4 px-6 py-4">
                    <span className="text-2xl leading-none shrink-0">{item.recipeEmoji ?? '📖'}</span>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-[#1A2B4A]">{item.recipeName}</p>
                      <p className="text-xs text-[#6B7280] mt-0.5">
                        {item.batchCount} batch × {item.basePortions} porz.
                        {' = '}
                        <span className="font-mono font-medium text-[#1A2B4A]">{item.totalPortions} porzioni</span>
                      </p>
                      {item.notes && (
                        <p className="text-xs text-[#6B7280] mt-1 italic">{item.notes}</p>
                      )}
                    </div>
                    <div className="shrink-0 text-right">
                      <span className="font-playfair text-2xl font-bold text-[#C9962A]">
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
            <div className="bg-white rounded-2xl border border-[#E5DDD0] overflow-hidden">
              <div className="flex items-center justify-between px-6 py-4 border-b border-[#F0EBE1]">
                <h2 className="font-semibold text-[15px] text-[#1A2B4A]">
                  Fabbisogno ingredienti
                </h2>
                {shortageItems.length > 0 && (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-[#C0392B]/10 text-[#C0392B]">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#C0392B]" />
                    {shortageItems.length} shortage
                  </span>
                )}
              </div>

              <table className="w-full text-sm">
                <thead className="bg-[#FAF7F2] border-b border-[#E5DDD0]">
                  <tr>
                    <th className="text-left px-6 py-3 font-semibold text-[#6B7280] text-xs uppercase tracking-wide">Ingrediente</th>
                    <th className="text-right px-6 py-3 font-semibold text-[#6B7280] text-xs uppercase tracking-wide">Necessario</th>
                    <th className="text-right px-6 py-3 font-semibold text-[#6B7280] text-xs uppercase tracking-wide">Disponibile</th>
                    <th className="text-center px-6 py-3 font-semibold text-[#6B7280] text-xs uppercase tracking-wide">Stato</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F0EBE1]">
                  {/* Shortage items prima */}
                  {shortageItems.map((req) => (
                    <tr key={req.ingredientProductId} className="bg-[#C0392B]/[0.03]">
                      <td className="px-6 py-3 font-medium text-[#1A2B4A]">{req.ingredientName}</td>
                      <td className="px-6 py-3 text-right font-mono text-[#1A2B4A]">
                        {formatQty(req.totalRequired)}{' '}
                        <span className="text-xs text-[#6B7280] font-sans">{UNIT_LABELS[req.unit]}</span>
                      </td>
                      <td className="px-6 py-3 text-right font-mono text-[#C0392B]">
                        {formatQty(req.currentStock)}{' '}
                        <span className="text-xs font-sans">{UNIT_LABELS[req.unit]}</span>
                      </td>
                      <td className="px-6 py-3 text-center">
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#C0392B]/10 text-[#C0392B]">
                          −{formatQty(req.estimatedShortage)} {UNIT_LABELS[req.unit]}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {/* OK items */}
                  {okItems.map((req) => (
                    <tr key={req.ingredientProductId} className="hover:bg-[#FAF7F2] transition-colors">
                      <td className="px-6 py-3 font-medium text-[#1A2B4A]">{req.ingredientName}</td>
                      <td className="px-6 py-3 text-right font-mono text-[#1A2B4A]">
                        {formatQty(req.totalRequired)}{' '}
                        <span className="text-xs text-[#6B7280] font-sans">{UNIT_LABELS[req.unit]}</span>
                      </td>
                      <td className="px-6 py-3 text-right font-mono text-[#27AE60]">
                        {formatQty(req.currentStock)}{' '}
                        <span className="text-xs font-sans">{UNIT_LABELS[req.unit]}</span>
                      </td>
                      <td className="px-6 py-3 text-center">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#27AE60]/10 text-[#1E7E45]">
                          OK
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {shortageItems.length > 0 && (
                <div className="px-6 py-4 border-t border-[#F0EBE1] bg-[#FAF7F2] flex items-center justify-between">
                  <p className="text-xs text-[#6B7280]">
                    {shortageItems.length} ingrediente/i non sufficienti per completare il piano.
                    {shortageItems.some((s) => s.estimatedShortageCost !== null) && (
                      <> Costo riordino stimato:{' '}
                        <span className="font-mono font-semibold text-[#1A2B4A]">
                          €{shortageItems.reduce((sum, s) => sum + (s.estimatedShortageCost ?? 0), 0).toFixed(2)}
                        </span>
                      </>
                    )}
                  </p>
                  <Link
                    href={`/orders/new?plan=${plan.id}`}
                    className="text-xs font-semibold text-[#C9962A] hover:underline shrink-0 ml-3"
                  >
                    Genera bozza ordine →
                  </Link>
                </div>
              )}
            </div>
          )}

        </div>

        {/* ── Colonna azioni ─────────────────────────────────────────── */}
        <div className="space-y-4">

          {plan.notes && (
            <div className="bg-white rounded-2xl border border-[#E5DDD0] p-5">
              <h2 className="text-[11px] font-semibold text-[#6B7280] uppercase tracking-wide mb-2">Note</h2>
              <p className="text-sm text-[#1A1A2E] whitespace-pre-wrap">{plan.notes}</p>
            </div>
          )}

          {plan.status === 'completed' && plan.completedAt && (
            <div className="bg-[#27AE60]/[0.07] rounded-2xl border border-[#27AE60]/25 p-5 text-center">
              <div className="w-10 h-10 rounded-full bg-[#27AE60]/15 flex items-center justify-center mx-auto mb-2">
                <span className="text-[#27AE60] font-bold text-lg">✓</span>
              </div>
              <p className="text-sm text-[#1E7E45] font-semibold">Produzione completata</p>
              <p className="text-xs text-[#27AE60] font-mono mt-1">
                {new Date(plan.completedAt).toLocaleDateString('it-IT', {
                  day: '2-digit', month: 'short', year: 'numeric',
                })}
              </p>
              <p className="text-xs text-[#6B7280] mt-2">
                Stock magazzino aggiornato.
              </p>
            </div>
          )}

          {canComplete && (
            <form action={handleComplete}>
              <button
                type="submit"
                className="w-full py-3 bg-[#2A7D6B] text-white rounded-xl text-sm font-semibold hover:bg-[#236457] transition-colors"
              >
                ✓ Segna come completato
              </button>
            </form>
          )}

          {canCancel && (
            <form action={handleCancel}>
              <button
                type="submit"
                className="w-full py-3 border border-[#C0392B]/40 text-[#C0392B] rounded-xl text-sm font-semibold hover:bg-[#C0392B]/[0.06] transition-colors"
              >
                Annulla piano
              </button>
            </form>
          )}

        </div>
      </div>
    </div>
  );
}
