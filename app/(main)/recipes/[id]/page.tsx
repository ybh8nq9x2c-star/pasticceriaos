// =============================================================================
// app/(main)/recipes/[id]/page.tsx
// Dettaglio ricetta con scaling porzioni — Server Component.
// =============================================================================

import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getRecipe } from '@/modules/catalog/service';
import { UNIT_LABELS } from '@/lib/utils';
import { StatusBadge } from '@/components/ui/StatusBadge';

export const metadata: Metadata = { title: 'Ricetta' };

export default async function RecipeDetailPage({ params }: { params: { id: string } }) {
  let recipe;
  try {
    recipe = await getRecipe(params.id);
  } catch {
    notFound();
  }

  return (
    <div className="p-8 max-w-3xl mx-auto">
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
        {/* Colonna principale: ingredienti */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-2xl border border-[#E5DDD0] p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-playfair text-base font-bold text-[#1A2B4A]">
                Ingredienti
                <span className="ml-2 text-xs font-sans font-normal text-[#6B7280]">
                  per {recipe.basePortions} {recipe.basePortions === 1 ? 'porzione' : 'porzioni'}
                </span>
              </h2>
            </div>

            {recipe.ingredients.length === 0 ? (
              <p className="text-sm text-[#6B7280]">Nessun ingrediente aggiunto.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-[#6B7280] border-b border-[#F0EBE1]">
                    <th className="text-left pb-2 font-semibold uppercase tracking-wide">Ingrediente</th>
                    <th className="text-right pb-2 font-semibold pr-2 uppercase tracking-wide">Quantità</th>
                    <th className="text-left pb-2 font-semibold uppercase tracking-wide">Unità</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F0EBE1]">
                  {recipe.ingredients.map((ing) => (
                    <tr key={ing.id}>
                      <td className="py-3 text-[#1A1A2E]">{ing.ingredientName}</td>
                      <td className="py-3 text-right pr-2 font-mono text-[#1A2B4A]">
                        {ing.quantity % 1 === 0 ? ing.quantity : ing.quantity.toFixed(2)}
                      </td>
                      <td className="py-3 text-[#6B7280]">{UNIT_LABELS[ing.unit]}</td>
                    </tr>
                  ))}
                </tbody>
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

        {/* Colonna laterale: info */}
        <div className="space-y-4">
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
