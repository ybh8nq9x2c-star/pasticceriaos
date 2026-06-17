// =============================================================================
// app/(main)/recipes/[id]/page.tsx
// Dettaglio ricetta con FOOD COST REALE — Server Component.
// Costi da v_recipe_cost_breakdown / v_recipe_costs (prezzi ingredienti reali,
// aggiornati a ogni ricezione ordine). Nessun numero statico.
// =============================================================================

import type { Metadata } from 'next';
import Link from 'next/link';
import { Factory, Pencil } from 'lucide-react';
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
        <Link href="/recipes" className="text-sm text-ink-muted hover:text-ink transition-colors">
          ← Ricette
        </Link>
        <div className="flex items-start gap-3 mt-3">
          <span className="text-4xl leading-none">{recipe.emoji ?? '📖'}</span>
          <div>
            <h1 className="text-3xl font-bold text-ink">{recipe.name}</h1>
            {recipe.category && (
              <p className="text-sm text-ink-muted mt-0.5">{recipe.category}</p>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Colonna principale: ingredienti + costi */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-surface-2 rounded-2xl border border-border p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-bold text-ink">
                Ingredienti e costi
                <span className="ml-2 text-xs font-sans font-normal text-ink-muted">
                  per {recipe.basePortions} {recipe.basePortions === 1 ? 'porzione' : 'porzioni'}
                </span>
              </h2>
            </div>

            {breakdown.length === 0 ? (
              <p className="text-sm text-ink-muted">Nessun ingrediente aggiunto.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-ink-muted border-b border-divider">
                    <th className="text-left pb-2 font-semibold uppercase tracking-wide">Ingrediente</th>
                    <th className="text-right pb-2 font-semibold pr-2 uppercase tracking-wide">Quantità</th>
                    <th className="text-right pb-2 font-semibold pr-2 uppercase tracking-wide">Costo</th>
                    <th className="text-right pb-2 font-semibold uppercase tracking-wide">Incidenza</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-divider">
                  {breakdown.map((line) => (
                    <tr key={line.recipeIngredientId}>
                      <td className="py-3 text-ink">
                        {line.ingredientName}
                        {line.lineCost === null && (
                          <Link
                            href={`/ingredients/${line.ingredientProductId}`}
                            className="block text-xs text-warning-strong hover:underline"
                          >
                            prezzo mancante — impostalo →
                          </Link>
                        )}
                      </td>
                      <td className="py-3 text-right pr-2 font-mono text-ink whitespace-nowrap">
                        {line.quantity % 1 === 0 ? line.quantity : line.quantity.toFixed(2)}{' '}
                        <span className="text-xs text-ink-muted font-sans">{UNIT_SHORT[line.unit]}</span>
                      </td>
                      <td className="py-3 text-right pr-2 font-mono text-ink whitespace-nowrap">
                        {line.lineCost !== null ? `€${formatCurrency(line.lineCost)}` : '—'}
                      </td>
                      <td className="py-3 text-right">
                        {line.lineCost !== null && pricedTotal > 0 ? (
                          <div className="flex items-center justify-end gap-2">
                            <div className="w-14 h-1.5 bg-surface-offset rounded-full overflow-hidden">
                              <div
                                className="h-full bg-primary rounded-full"
                                style={{ width: `${Math.round((line.lineCost / pricedTotal) * 100)}%` }}
                              />
                            </div>
                            <span className="font-mono text-xs text-ink-muted w-9 text-right">
                              {Math.round((line.lineCost / pricedTotal) * 100)}%
                            </span>
                          </div>
                        ) : (
                          <span className="text-xs text-ink-muted">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                {pricedTotal > 0 && (
                  <tfoot>
                    <tr className="border-t border-border">
                      <td className="pt-3 text-sm font-semibold text-ink-muted">
                        Totale batch{unpricedLines.length > 0 ? ' (parziale)' : ''}
                      </td>
                      <td />
                      <td className="pt-3 text-right pr-2 font-mono font-bold text-ink">
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
            <div className="bg-surface-2 rounded-2xl border border-border p-6">
              <h2 className="text-base font-bold text-ink mb-2">Note</h2>
              <p className="text-sm text-ink whitespace-pre-wrap">{recipe.notes}</p>
            </div>
          )}
        </div>

        {/* Colonna laterale: food cost + info */}
        <div className="space-y-4">
          {/* Food cost card */}
          <div className="bg-surface-2 rounded-2xl border border-border p-5 text-ink">
            <h2 className="text-xs font-semibold text-ink-muted uppercase tracking-wide mb-3">
              Food cost
            </h2>
            {cost?.costPerPortion !== null && cost?.costPerPortion !== undefined ? (
              <>
                <p className="text-3xl font-bold leading-none">
                  €{formatCurrency(cost.costPerPortion)}
                  <span className="text-sm font-sans font-normal text-ink-muted"> /porzione</span>
                </p>
                <dl className="mt-4 space-y-2 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-ink-muted">Costo batch</dt>
                    <dd className="font-mono">€{formatCurrency(cost.batchCost ?? 0)}</dd>
                  </div>
                  {cost.sellPricePerPortion !== null ? (
                    <>
                      <div className="flex justify-between">
                        <dt className="text-ink-muted">Prezzo vendita</dt>
                        <dd className="font-mono">€{formatCurrency(cost.sellPricePerPortion)}/porz.</dd>
                      </div>
                      <div className="flex justify-between items-center pt-2 border-t border-divider">
                        <dt className="text-ink-muted">Margine</dt>
                        <dd className={`font-bold ${
                          (cost.marginPct ?? 0) >= 60 ? 'text-success-strong' :
                          (cost.marginPct ?? 0) >= 30 ? 'text-warning-strong' : 'text-danger'
                        }`}>
                          {cost.marginPct}%
                        </dd>
                      </div>
                      <div className="flex justify-between">
                        <dt className="text-ink-muted">Utile/porzione</dt>
                        <dd className="font-mono">
                          €{formatCurrency(cost.sellPricePerPortion - cost.costPerPortion)}
                        </dd>
                      </div>
                    </>
                  ) : (
                    <p className="text-xs text-ink-faint pt-2 border-t border-divider">
                      Imposta il prezzo di vendita (Modifica ricetta) per vedere il margine.
                    </p>
                  )}
                </dl>
              </>
            ) : (
              <div>
                <p className="text-2xl font-bold leading-none text-ink-muted">—</p>
                <p className="text-xs text-ink-muted mt-3">
                  {breakdown.length === 0
                    ? 'Aggiungi ingredienti per calcolare il food cost.'
                    : `${unpricedLines.length} ingredienti senza prezzo (o con unità non convertibile): il costo per porzione sarà calcolato quando tutti i prezzi sono disponibili.`}
                </p>
                {pricedTotal > 0 && (
                  <p className="text-xs text-ink-muted mt-2">
                    Costo parziale batch: <span className="font-mono">€{formatCurrency(pricedTotal)}</span>
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="bg-surface-2 rounded-2xl border border-border p-5">
            <h2 className="text-xs font-semibold text-ink-muted uppercase tracking-wide mb-3">
              Info ricetta
            </h2>
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="text-ink-muted text-xs">Porzioni base</dt>
                <dd className="font-mono font-medium text-ink">{recipe.basePortions}</dd>
              </div>
              <div>
                <dt className="text-ink-muted text-xs">Ingredienti</dt>
                <dd className="font-mono font-medium text-ink">{recipe.ingredients.length}</dd>
              </div>
              <div>
                <dt className="text-ink-muted text-xs">Stato</dt>
                <dd className="mt-1">
                  <StatusBadge
                    label={recipe.isActive ? 'Attiva' : 'Inattiva'}
                    variant={recipe.isActive ? 'green' : 'gray'}
                  />
                </dd>
              </div>
            </dl>
          </div>

          {recipe.ingredients.length > 0 && (
            <Link
              href={`/production/quick?recipe=${recipe.id}`}
              className="block w-full py-3 text-center bg-primary text-primary-fg rounded-xl text-sm font-semibold hover:bg-primary-hover transition-colors"
            >
              <Factory size={16} className="inline-block mr-1.5 -mt-0.5" aria-hidden="true" /> Segna prodotto (scarica magazzino)
            </Link>
          )}

          <Link
            href={`/recipes/${recipe.id}/edit`}
            className="block w-full py-3 text-center bg-surface-2 text-ink border border-border rounded-xl text-sm font-semibold hover:bg-surface-offset transition-colors"
          >
            <Pencil size={15} className="inline-block mr-1.5 -mt-0.5" aria-hidden="true" /> Modifica ricetta
          </Link>
        </div>
      </div>
    </div>
  );
}
