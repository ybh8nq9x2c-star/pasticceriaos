// =============================================================================
// app/(main)/customers/new/page.tsx
// Server wrapper: carica il ricettario reale per gli articoli da ricetta.
// =============================================================================

import type { Metadata } from 'next';
import { listRecipes } from '@/modules/catalog/service';
import { NewCustomerOrderForm } from './NewCustomerOrderForm';

export const metadata: Metadata = { title: 'Nuovo ordine cliente' };

export default async function NewCustomerOrderPage() {
  const recipes = await listRecipes();
  return (
    <NewCustomerOrderForm
      recipes={recipes.map((r) => ({ id: r.id, name: r.name }))}
    />
  );
}
