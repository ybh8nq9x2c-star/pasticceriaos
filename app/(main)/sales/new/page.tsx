// =============================================================================
// app/(main)/sales/new/page.tsx
// Registrazione manuale di una vendita (seam di ingestione V1 = adapter 'manual').
// P0-C: con ?ordine=<id> il form arriva PRECOMPILATO dalle righe di un ordine
// cliente appena consegnato — il banco scala solo alla conferma esplicita.
// =============================================================================

import type { Metadata } from 'next';
import { listLinkableRecipes } from '@/modules/sales/service';
import { getCustomerOrder } from '@/modules/customers/service';
import { RecordSaleForm, type InitialSaleLine } from './RecordSaleForm';

export const metadata: Metadata = { title: 'Registra vendita' };

export default async function NewSalePage({
  searchParams,
}: {
  searchParams: { ordine?: string };
}) {
  const recipes = await listLinkableRecipes();

  // Prefill dal ritiro (P0-C): best-effort — se l'ordine non è leggibile il
  // form resta usabile vuoto, mai un errore che blocca la vendita.
  let initialLines: InitialSaleLine[] | undefined;
  let contextBanner: string | undefined;
  if (searchParams.ordine) {
    try {
      const order = await getCustomerOrder(searchParams.ordine);
      if (order) {
        initialLines = order.items.map((i) => ({
          externalProductRef: i.recipeName ?? i.description,
          recipeId: i.recipeId ?? '',
          quantity: String(i.quantity),
          unitPrice: '',
        }));
        contextBanner = `Ritiro di ${order.customerName}: confermando, questi pezzi vengono scalati dal banco. Se non devi registrare la vendita, premi Annulla (il "consegnato" resta).`;
      }
    } catch {
      // ordine non trovato/leggibile → form vuoto, nessun blocco
    }
  }

  return (
    <RecordSaleForm
      recipes={recipes}
      initialLines={initialLines}
      contextBanner={contextBanner}
    />
  );
}
