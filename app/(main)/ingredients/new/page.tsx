// =============================================================================
// app/(main)/ingredients/new/page.tsx — Server Component (P0-1).
// Fornitori e catalogo anti-doppione caricati lato server: se il caricamento
// fallisce, fallisce la pagina (error boundary), mai un form con tendine mute.
// =============================================================================

import type { Metadata } from 'next';
import Link from 'next/link';
import { listIngredients, listSuppliers } from '@/modules/catalog/service';
import type { CatalogProductRef } from '@/modules/goods-receipts/matching';
import { NewIngredientForm } from './NewIngredientForm';

export const metadata: Metadata = { title: 'Nuovo ingrediente' };

export default async function NewIngredientPage() {
  const [suppliers, ingredients] = await Promise.all([listSuppliers(), listIngredients()]);

  const catalog: CatalogProductRef[] = ingredients.map((i) => ({
    id: i.id, name: i.name, unit: i.unit, sku: null, barcode: null,
  }));

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-xl mx-auto">
      <div className="mb-6">
        <Link href="/ingredients" className="text-sm text-ink-muted hover:text-ink transition-colors">
          ← Ingredienti
        </Link>
        <h1 className="text-3xl font-bold text-ink mt-3">Nuovo ingrediente</h1>
      </div>
      <NewIngredientForm
        suppliers={suppliers.map((s) => ({ id: s.id, name: s.name, email: s.email }))}
        catalog={catalog}
      />
    </div>
  );
}
