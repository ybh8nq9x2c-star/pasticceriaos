// =============================================================================
// app/(main)/ingredients/[id]/page.tsx — Server Component (P0-1).
// Ingrediente, fornitori, giacenza e permessi caricati lato server: un id
// inesistente è un vero 404, non una card "non trovato" dopo uno spinner.
// =============================================================================

import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getIngredient, listSuppliers } from '@/modules/catalog/service';
import { getLevelForIngredient } from '@/modules/inventory/service';
import { requireSession } from '@/modules/identity/service';
import { NotFoundError } from '@/lib/errors';
import { Badge } from '@/components/ui/Badge';
import { IngredientEditForm } from './IngredientEditForm';

export const metadata: Metadata = { title: 'Ingrediente' };

export default async function IngredientDetailPage({ params }: { params: { id: string } }) {
  const session = await requireSession();

  let ingredient;
  try {
    ingredient = await getIngredient(params.id);
  } catch (err) {
    if (err instanceof NotFoundError) notFound();
    throw err;
  }
  if (!ingredient) notFound();

  const [suppliers, level] = await Promise.all([
    listSuppliers(),
    getLevelForIngredient(params.id),
  ]);

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-2xl mx-auto">
      <div className="mb-6">
        <Link href="/ingredients" className="text-sm text-ink-muted hover:text-ink transition-colors">
          ← Ingredienti
        </Link>
        <div className="flex items-center justify-between mt-3">
          <h1 className="text-3xl font-bold text-ink">{ingredient.name}</h1>
          <Badge variant={ingredient.isActive ? 'success' : 'neutral'}>
            {ingredient.isActive ? 'Attivo' : 'Inattivo'}
          </Badge>
        </div>
      </div>

      <IngredientEditForm
        ingredient={ingredient}
        suppliers={suppliers.map((s) => ({ id: s.id, name: s.name, email: s.email }))}
        currentQuantity={level?.currentQuantity ?? 0}
        canAdjust={session.role !== 'viewer'}
      />
    </div>
  );
}
