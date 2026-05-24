// =============================================================================
// app/(main)/recipes/page.tsx
// Lista ricette — Server Component.
// =============================================================================

import type { Metadata } from 'next';
import Link from 'next/link';
import { listRecipes } from '@/modules/catalog/service';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';

export const metadata: Metadata = { title: 'Ricette' };

export default async function RecipesPage() {
  const recipes = await listRecipes();

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <PageHeader
        title="Ricette"
        subtitle={`${recipes.length} ricetta/e attive`}
        action={
          <Link
            href="/recipes/new"
            className="px-4 py-2.5 bg-[#1A2B4A] text-white rounded-xl text-sm font-semibold hover:bg-[#243660] transition-colors"
          >
            + Nuova ricetta
          </Link>
        }
      />

      {recipes.length === 0 ? (
        <EmptyState
          emoji="📖"
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
              className="bg-white rounded-2xl border border-[#E5DDD0] p-5 hover:border-[#C9962A]/50 hover:shadow-[0_4px_24px_rgba(26,43,74,0.08)] transition-all group"
            >
              <div className="flex items-start gap-3">
                <span className="text-3xl leading-none">{recipe.emoji ?? '📖'}</span>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-[#1A2B4A] group-hover:text-[#C9962A] truncate">
                    {recipe.name}
                  </p>
                  {recipe.category && (
                    <p className="text-xs text-[#6B7280] mt-0.5">{recipe.category}</p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-4 mt-4 text-xs text-[#6B7280]">
                <span className="font-mono">🥄 {recipe.ingredientsCount} ingredienti</span>
                <span className="font-mono">🍽️ {recipe.basePortions} porzioni</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
