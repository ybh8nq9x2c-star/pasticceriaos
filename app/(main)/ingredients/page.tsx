// =============================================================================
// app/(main)/ingredients/page.tsx
// Lista ingredienti — Server Component.
// =============================================================================

import type { Metadata } from 'next';
import Link from 'next/link';
import { listIngredients, listSuppliers } from '@/modules/catalog/service';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { IngredientsManager } from '@/components/ingredients/IngredientsManager';
import { Wheat } from 'lucide-react';

export const metadata: Metadata = { title: 'Ingredienti' };

export default async function IngredientsPage() {
  const [ingredients, suppliers] = await Promise.all([listIngredients(), listSuppliers()]);

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto">
      <PageHeader
        title="Ingredienti"
        subtitle={`${ingredients.length} ingrediente/i attivi`}
        action={
          <Link
            href="/ingredients/new"
            className="px-4 py-2.5 bg-primary text-primary-fg rounded-xl text-sm font-semibold hover:bg-primary-hover transition-colors"
          >
            + Nuovo ingrediente
          </Link>
        }
      />

      {ingredients.length === 0 ? (
        <EmptyState
          icon={Wheat}
          title="Nessun ingrediente ancora"
          description="Aggiungi gli ingredienti per costruire le tue ricette."
          ctaHref="/ingredients/new"
          ctaLabel="Aggiungi ingrediente"
        />
      ) : (
        <IngredientsManager
          ingredients={ingredients}
          suppliers={suppliers.map((s) => ({ id: s.id, name: s.name, email: s.email }))}
        />
      )}
    </div>
  );
}
