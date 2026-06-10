// =============================================================================
// app/(main)/recipes/[id]/edit/page.tsx
// Server Component: carica ricetta + ingredienti reali e delega al form client.
// (Questa rotta era linkata dal dettaglio ricetta ma non esisteva: 404.)
// =============================================================================

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getRecipe, listIngredients } from '@/modules/catalog/service';
import { EditRecipeForm } from './EditRecipeForm';
import type { Recipe } from '@/modules/catalog/types';

export const metadata: Metadata = { title: 'Modifica ricetta' };

export default async function EditRecipePage({ params }: { params: { id: string } }) {
  let recipe: Recipe;
  try {
    recipe = await getRecipe(params.id);
  } catch {
    notFound();
  }

  const ingredients = await listIngredients();

  return (
    <EditRecipeForm
      recipe={{
        id:                  recipe.id,
        name:                recipe.name,
        category:            recipe.category,
        emoji:               recipe.emoji,
        basePortions:        recipe.basePortions,
        sellPricePerPortion: recipe.sellPricePerPortion,
        notes:               recipe.notes,
        isActive:            recipe.isActive,
        ingredients: recipe.ingredients.map((i) => ({
          ingredientProductId: i.ingredientProductId,
          quantity:            String(i.quantity),
          unit:                i.unit,
        })),
      }}
      ingredientOptions={ingredients.map((i) => ({ id: i.id, name: i.name, unit: i.unit }))}
    />
  );
}
