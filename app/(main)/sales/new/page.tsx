// =============================================================================
// app/(main)/sales/new/page.tsx
// Registrazione manuale di una vendita (seam di ingestione V1 = adapter 'manual').
// =============================================================================

import type { Metadata } from 'next';
import { listLinkableRecipes } from '@/modules/sales/service';
import { RecordSaleForm } from './RecordSaleForm';

export const metadata: Metadata = { title: 'Registra vendita' };

export default async function NewSalePage() {
  const recipes = await listLinkableRecipes();
  return <RecordSaleForm recipes={recipes} />;
}
