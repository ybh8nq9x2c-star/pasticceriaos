// =============================================================================
// app/(main)/production/quick/page.tsx
// Scarico produzione rapido — Server Component.
// "Ho prodotto N infornate di questa ricetta" → scala il magazzino secondo la
// ricetta, riusando il path canonico piano→completamento (FEFO). Nessun secondo
// sistema di scarico stock.
// =============================================================================

import type { Metadata } from 'next';
import { listRecipes, getRecipe } from '@/modules/catalog/service';
import { QuickProduceForm, type SelectedRecipe } from '@/components/production/QuickProduceForm';

export const metadata: Metadata = { title: 'Scarico produzione' };
export const dynamic = 'force-dynamic';

export default async function QuickProducePage({
  searchParams,
}: {
  searchParams: { recipe?: string };
}) {
  const recipes = await listRecipes(); // solo ricette attive

  let selected: SelectedRecipe | null = null;
  if (searchParams.recipe) {
    try {
      const r = await getRecipe(searchParams.recipe);
      selected = {
        id: r.id,
        name: r.name,
        basePortions: r.basePortions,
        ingredients: r.ingredients.map((i) => ({
          name: i.ingredientName,
          quantity: i.quantity,
          unit: i.unit,
        })),
      };
    } catch {
      // ricetta inesistente o di un'altra org (RLS) → nessuna selezione
      selected = null;
    }
  }

  return (
    <QuickProduceForm
      recipes={recipes.map((r) => ({
        id: r.id,
        name: r.name,
        basePortions: r.basePortions,
      }))}
      selected={selected}
    />
  );
}
