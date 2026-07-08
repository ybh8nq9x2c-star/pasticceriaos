// =============================================================================
// app/(main)/production/new/page.tsx — Server Component (P0-1).
// Ricette, suggerimenti e ordini clienti di oggi si caricano QUI, lato server:
// se una sorgente fallisce, il form lo dichiara (loadErrors) invece di mostrare
// dropdown vuoti. Le letture dinamiche passano da server action tipizzate.
// =============================================================================

import type { Metadata } from 'next';
import Link from 'next/link';
import { listRecipes } from '@/modules/catalog/service';
import { getPlanSuggestions } from '@/modules/production/service';
import { getCustomerOrdersForDate } from '@/modules/customers/service';
import { todayISODate } from '@/lib/utils';
import type { PlanDateOrder } from '@/modules/production/actions';
import { NewPlanForm, type PlanSuggestionOption, type RecipeOption } from './NewPlanForm';

export const metadata: Metadata = { title: 'Nuovo piano di produzione' };

export default async function NewProductionPage() {
  const today = todayISODate();

  const [recipesRes, suggestionsRes, ordersRes] = await Promise.allSettled([
    listRecipes(true),
    getPlanSuggestions(),
    getCustomerOrdersForDate(today),
  ]);

  const loadErrors: string[] = [];

  let recipes: RecipeOption[] = [];
  if (recipesRes.status === 'fulfilled') {
    recipes = recipesRes.value.map((r) => ({
      id: r.id, name: r.name, emoji: r.emoji, basePortions: r.basePortions,
    }));
  } else {
    loadErrors.push('Le ricette non si sono caricate.');
  }

  let suggestions: PlanSuggestionOption[] = [];
  if (suggestionsRes.status === 'fulfilled') {
    suggestions = suggestionsRes.value as PlanSuggestionOption[];
  } // i suggerimenti sono un aiuto, non un requisito: niente warning se mancano

  let initialOrders: PlanDateOrder[] = [];
  if (ordersRes.status === 'fulfilled') {
    initialOrders = ordersRes.value.map((o) => ({
      id: o.id,
      customerName: o.customerName,
      pickupTime: o.pickupTime,
      items: o.items.map((i) => ({
        recipeId: i.recipeId, recipeName: i.recipeName, description: i.description, quantity: i.quantity,
      })),
    }));
  } else {
    loadErrors.push('Gli ordini clienti di oggi non si sono caricati.');
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-2xl mx-auto">
      <div className="mb-6">
        <Link href="/production" className="text-sm text-ink-muted hover:text-ink transition-colors">
          ← Produzione
        </Link>
        <h1 className="text-2xl sm:text-3xl font-bold text-ink mt-3">Nuovo piano di produzione</h1>
      </div>

      <NewPlanForm
        recipes={recipes}
        suggestions={suggestions}
        initialOrders={initialOrders}
        initialDate={today}
        loadErrors={loadErrors}
      />
    </div>
  );
}
