// =============================================================================
// app/(main)/recipes/[id]/page.tsx
// Dettaglio ricetta con FOOD COST REALE — Server Component.
// Costi da v_recipe_cost_breakdown / v_recipe_costs (prezzi ingredienti reali,
// aggiornati a ogni ricezione ordine). Nessun numero statico.
// =============================================================================

import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getRecipe } from '@/modules/catalog/service';
import { getRecipeCost, getRecipeCostBreakdown } from '@/modules/reporting/service';
import { formatCurrency, UNIT_SHORT } from '@/lib/utils';
import { StatusBadge } from '@/components/ui/StatusBadge';
import type { Recipe } from '@/modules/catalog/types';

export const metadata: Metadata = { title: 'Ricetta' };

export default async function RecipeDetailPage({ params }: { params: { id: string } }) {
  let recipe: Recipe;
  try {
    recipe = await getRecipe(params.id);
  } catch {
    notFound();
  }

  const [cost, breakdown] = await Promise.all([
    getRecipeCost(recipe.id),
    getRecipeCostBreakdown(recipe.id),
  ]);

  const pricedTotal = breakdown.reduce((sum, l) => sum + (l.lineCost ?? 0), 0);
  const unpricedLines = breakdown.filter((l) => l.lineCost === null);

  return (
    <div className="p-8 max-w-4xl mx-auto">
      {/* Breadcrumb */}
      <div className="mb-6">
        <Link href="/recipes" className="text-sm text-[#6B7280] hover:text-[#1A2B4A] transition-colors">
          ← Ricette
        </Link>
        <div className="flex items-start gap-3 mt-3">
          <span className="text-4xl leading-none">{recipe.emoji ?? '📖'}</span>
          <div>
            <h1 className="font-playfair text-3xl font-bold text-[#1A2B4A]">{recipe.name}</h1>
            {recipe.category && (
              <p className="text-sm text-[#6B7280] mt-0.5">{recipe.category}</p>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Colonna principale: ingredienti + costi */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-2xl border border-[#E5DDD0] p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-playfair text-base font-bold text-[#1A2B4A]">
                Ingredienti e costi
                <span className="ml-2 text-xs font-sans font-normal text-[#6B7280]">
                  per {recipe.basePortions} {recipe.basePortions === 1 ? 'porzione' : 'porzioni'}
                </span>
              </h2>
            </div>

            {breakdown.length === 0 ? (
              <p className="text-sm text-[#6B7280]">Nessun ingrediente aggiunto.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-[#6B7280] border-b border-[#F0EBE1]">
                    <th className="text-left pb-2 font-semibold uppercase tracking-wide">Ingrediente</th>
                    <th className="text-right pb-2 font-semibold pr-2 uppercase tracking-wide">Quantità</th>
                    <th className="text-right pb-2 font-semibold pr-2 uppercase tracking-wide">Costo</th>
                    <th className="text-right pb-2 font-semibold uppercase tracking-wide">Incidenza</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F0EBE1]">
                  {breakdown.map((line) => (
                    <tr key={line.recipeIngredientId}>
                      <td className="py-3 text-[#1A1A2E]">
                        {line.ingredientName}
                        {line.lineCost === null && (
                          <Link
                            href={`/ingredients/${line.ingredientProductId}`}
                            className="block text-[10px] text-[#E67E22] hover:underline"
                          >
                            prezzo mancante — impostalo →
                          </Link>
                        )}
                      </td>
                      <td className="py-3 text-right pr-2 font-mono text-[#1A2B4A] whitespace-nowrap">
                        {line.quantity % 1 === 0 ? line.quantity : line.quantity.toFixed(2)}{' '}
                        <span className="text-xs text-[#6B7280] font-sans">{UNIT_SHORT[line.unit]}</span>
                      </td>
                      <td className="py-3 text-right pr-2 font-mono text-[#1A2B4A] whitespace-nowrap">
                        {line.lineCost !== null ? `€${formatCurrency(line.lineCost)}` : '—'}
                      </td>
                      <td className="py-3 text-right">
                        {line.lineCost !== null && pricedTotal > 0 ? (
                          <div className="flex items-center justify-end gap-2">
                            <div className="w-14 h-1.5 bg-[#F0EBE1] rounded-full overflow-hidden">
                              <div
                                className="h-full bg-[#C9962A] rounded-full"
                                style={{ width: `${Math.round((line.lineCost / pricedTotal) * 100)}%` }}
                              />
                            </div>
                            <span className="font-mono text-xs text-[#6B7280] w-9 text-right">
                              {Math.round((line.lineCost / pricedTotal) * 100)}%
                            </span>
                          </div>
                        ) : (
                          <span className="text-xs text-[#6B7280]">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                {pricedTotal > 0 && (
                  <tfoot>
                    <tr className="border-t border-[#E5DDD0]">
                      <td className="pt-3 text-sm font-semibold text-[#6B7280]">
                        Totale batch{unpricedLines.length > 0 ? ' (parziale)' : ''}
                      </td>
                      <td />
                      <td className="pt-3 text-right pr-2 font-mono font-bold text-[#1A2B4A]">
                        €{formatCurrency(pricedTotal)}
                      </td>
                      <td />
                    </tr>
                  </tfoot>
                )}
              </table>
            )}
          </div>

          {recipe.notes && (
            <div className="bg-white rounded-2xl border border-[#E5DDD0] p-6">
              <h2 className="font-playfair text-base font-bold text-[#1A2B4A] mb-2">Note</h2>
              <p className="text-sm text-[#1A1A2E] whitespace-pre-wrap">{recipe.notes}</p>
            </div>
          )}
        </div>

        {/* Colonna laterale: food cost + info */}
        <div className="space-y-4">
          {/* Food cost card */}
          <div className="bg-[#1A2B4A] rounded-2xl p-5 text-white">
            <h2 className="text-[11px] font-semibold text-white/60 uppercase tracking-wide mb-3">
              Food cost
            </h2>
            {cost?.costPerPortion !== null && cost?.costPerPortion !== undefined ? (
              <>
                <p className="font-playfair text-3xl font-bold leading-none">
                  €{formatCurrency(cost.costPerPortion)}
                  <span className="text-sm font-sans font-normal text-white/60"> /porzione</span>
                </p>
                <dl className="mt-4 space-y-2 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-white/60">Costo batch</dt>
                    <dd className="font-mono">€{formatCurrency(cost.batchCost ?? 0)}</dd>
                  </div>
                  {cost.sellPricePerPortion !== null ? (
                    <>
                      <div className="flex justify-between">
                        <dt className="text-white/60">Prezzo vendita</dt>
                        <dd className="font-mono">€{formatCurrency(cost.sellPricePerPortion)}/porz.</dd>
                      </div>
                      <div className="flex justify-between items-center pt-2 border-t border-white/15">
                        <dt className="text-white/60">Margine</dt>
                        <dd className={`font-bold ${
                          (cost.marginPct ?? 0) >= 60 ? 'text-[#5EDB94]' :
                          (cost.marginPct ?? 0) >= 30 ? 'text-[#E8C36A]' : 'text-[#F08A7B]'
                        }`}>
                          {cost.marginPct}%
                        </dd>
                      </div>
                      <div className="flex justify-between">
                        <dt className="text-white/60">Utile/porzione</dt>
                        <dd className="font-mono">
                          €{formatCurrency(cost.sellPricePerPortion - cost.costPerPortion)}
                        </dd>
                      </div>
                    </>
                  ) : (
                    <p className="text-xs text-white/50 pt-2 border-t border-white/15">
                      Imposta il prezzo di vendita (Modifica ricetta) per vedere il margine.
                    </p>
                  )}
                </dl>
              </>
            ) : (
              <div>
                <p className="font-playfair text-2xl font-bold leading-none text-white/70">—</p>
                <p className="text-xs text-white/60 mt-3">
                  {breakdown.length === 0
                    ? 'Aggiungi ingredienti per calcolare il food cost.'
                    : `${unpricedLines.length} ingredienti senza prezzo (o con unità non convertibile): il costo per porzione sarà calcolato quando tutti i prezzi sono disponibili.`}
                </p>
                {pricedTotal > 0 && (
                  <p className="text-xs text-white/60 mt-2">
                    Costo parziale batch: <span className="font-mono">€{formatCurrency(pricedTotal)}</span>
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="bg-white rounded-2xl border border-[#E5DDD0] p-5">
            <h2 className="text-[11px] font-semibold text-[#6B7280] uppercase tracking-wide mb-3">
              Info ricetta
            </h2>
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="text-[#6B7280] text-xs">Porzioni base</dt>
                <dd className="font-mono font-medium text-[#1A2B4A]">{recipe.basePortions}</dd>
              </div>
              <div>
                <dt className="text-[#6B7280] text-xs">Ingredienti</dt>
                <dd className="font-mono font-medium text-[#1A2B4A]">{recipe.ingredients.length}</dd>
              </div>
              <div>
                <dt className="text-[#6B7280] text-xs">Stato</dt>
                <dd className="mt-1">
                  <StatusBadge
                    label={recipe.isActive ? 'Attiva' : 'Inattiva'}
                    variant={recipe.isActive ? 'green' : 'gray'}
                  />
                </dd>
              </div>
            </dl>
          </div>

          <Link
            href={`/recipes/${recipe.id}/edit`}
            className="block w-full py-3 text-center bg-[#1A2B4A] text-white rounded-xl text-sm font-semibold hover:bg-[#243660] transition-colors"
          >
            ✏️ Modifica ricetta
          </Link>
        </div>
      </div>
    </div>
  );
}
