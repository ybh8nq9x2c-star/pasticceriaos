// =============================================================================
// app/(main)/recipes/page.tsx
// Lista ricette — Server Component.
// =============================================================================

import type { Metadata } from 'next';
import Link from 'next/link';
import { listRecipes } from '@/modules/catalog/service';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { BookOpen, Utensils, UtensilsCrossed } from 'lucide-react';

export const metadata: Metadata = { title: 'Ricette' };

export default async function RecipesPage() {
  const recipes = await listRecipes();

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto">
      <PageHeader
        title="Ricette"
        subtitle={`${recipes.length} ricetta/e attive`}
        action={
          <div className="flex gap-2">
            <Link
              href="/recipes/import"
              className="px-4 py-2.5 border border-border text-ink rounded-xl text-sm font-semibold hover:bg-surface-offset transition-colors"
            >
              Importa
            </Link>
            <Link
              href="/recipes/new"
              className="px-4 py-2.5 bg-primary text-primary-fg rounded-xl text-sm font-semibold hover:bg-primary-hover transition-colors"
            >
              + Nuova ricetta
            </Link>
          </div>
        }
      />

      {recipes.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title="Nessuna ricetta ancora"
          description="Crea la tua prima ricetta con ingredienti e dosi."
          ctaHref="/recipes/new"
          ctaLabel="Crea ricetta"
        />
      ) : (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {recipes.map((recipe) => (
            <Link
              key={recipe.id}
              href={`/recipes/${recipe.id}`}
              className="bg-surface-2 rounded-2xl border border-border p-5 hover:border-primary-soft hover:shadow-[0_4px_24px_rgba(26,43,74,0.08)] transition-all group"
            >
              <div className="flex items-start gap-3">
                <span className="text-3xl leading-none">{recipe.emoji ?? '📖'}</span>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-ink group-hover:text-primary truncate">
                    {recipe.name}
                  </p>
                  {recipe.category && (
                    <p className="text-xs text-ink-muted mt-0.5">{recipe.category}</p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-4 mt-4 text-xs text-ink-muted">
                <span className="inline-flex items-center gap-1 font-mono">
                  <Utensils size={13} aria-hidden="true" /> {recipe.ingredientsCount} ingredienti
                </span>
                <span className="inline-flex items-center gap-1 font-mono">
                  <UtensilsCrossed size={13} aria-hidden="true" /> {recipe.basePortions} porzioni
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
