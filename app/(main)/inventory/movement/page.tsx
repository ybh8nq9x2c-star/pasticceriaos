// =============================================================================
// app/(main)/inventory/movement/page.tsx — Server Component (P0-1).
// Gli ingredienti si caricano lato server: mai una tendina muta.
// =============================================================================

import type { Metadata } from 'next';
import Link from 'next/link';
import { listIngredients } from '@/modules/catalog/service';
import { MovementForm } from './MovementForm';

export const metadata: Metadata = { title: 'Registra movimento' };

export default async function MovementPage() {
  const ingredients = await listIngredients();

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-xl mx-auto">
      <div className="mb-6">
        <Link href="/inventory" className="text-sm text-ink-muted hover:text-ink transition-colors">
          ← Magazzino
        </Link>
        <h1 className="text-3xl font-bold text-ink mt-3">Registra movimento</h1>
      </div>
      <MovementForm
        ingredients={ingredients.map((i) => ({ id: i.id, name: i.name, unit: i.unit }))}
      />
    </div>
  );
}
