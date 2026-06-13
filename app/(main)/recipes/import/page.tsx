// =============================================================================
// app/(main)/recipes/import/page.tsx
// Import massivo ricette — shell server. Carica il catalogo ingredienti per i
// dropdown di associazione e monta il wizard client. force-dynamic perché il
// flusso accetta upload file e usa server actions.
// =============================================================================

import type { Metadata } from 'next';
import { listIngredients } from '@/modules/catalog/service';
import { RecipeImportWizard } from '@/components/recipes/RecipeImportWizard';

export const metadata: Metadata = { title: 'Importa ricette' };
export const dynamic = 'force-dynamic';

export default async function RecipeImportPage() {
  const ingredients = await listIngredients(true);
  const catalog = ingredients.map((i) => ({ id: i.id, name: i.name, unit: i.unit }));
  return <RecipeImportWizard catalog={catalog} />;
}
