// =============================================================================
// app/(main)/recipes/new/page.tsx — Server Component (P0-1).
// Gli ingredienti si caricano lato server: se mancano davvero, l'empty state
// dice "aggiungine uno" — non è mai un errore travestito da lista vuota.
// =============================================================================

import type { Metadata } from 'next';
import Link from 'next/link';
import { listIngredients } from '@/modules/catalog/service';
import { NewRecipeForm } from './NewRecipeForm';

export const metadata: Metadata = { title: 'Nuova ricetta' };

export default async function NewRecipePage() {
  const ingredients = await listIngredients();

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-2xl mx-auto">
      <div className="mb-6">
        <Link href="/recipes" className="text-sm text-ink-muted hover:text-ink transition-colors">
          ← Ricette
        </Link>
        <h1 className="text-3xl font-bold text-ink mt-3">Nuova ricetta</h1>
      </div>

      <NewRecipeForm
        ingredientOptions={ingredients.map((i) => ({ id: i.id, name: i.name, unit: i.unit }))}
      />
    </div>
  );
}
