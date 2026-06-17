// =============================================================================
// app/(main)/orders/new/page.tsx
// Server Component: carica fornitori/ingredienti reali e, se ?plan=<id>,
// genera la bozza d'ordine dal fabbisogno REALE del piano (solo shortage > 0).
// Il form vero e proprio è il Client Component NewOrderForm.
// =============================================================================

import type { Metadata } from 'next';
import { listSuppliers, listIngredients } from '@/modules/catalog/service';
import { getIngredientRequirements } from '@/modules/reporting/service';
import { NewOrderForm, type PrefillRow } from './NewOrderForm';

export const metadata: Metadata = { title: 'Nuovo ordine' };

function formatQty(n: number): string {
  // Mantiene i decimali reali senza rumore binario (max 3 come da DB).
  return String(Math.round(n * 1000) / 1000);
}

export default async function NewOrderPage({
  searchParams,
}: {
  searchParams: { plan?: string };
}) {
  const [suppliers, ingredients] = await Promise.all([
    listSuppliers(),
    listIngredients(),
  ]);

  let initialRows: PrefillRow[] | undefined;
  let initialSupplierId: string | undefined;
  let prefillNote: string | undefined;

  if (searchParams.plan) {
    const requirements = await getIngredientRequirements(searchParams.plan);
    const shortages = requirements.filter((r) => r.estimatedShortage > 0);

    if (shortages.length > 0) {
      initialRows = shortages.map((r) => ({
        ingredientProductId: r.ingredientProductId,
        quantity:            formatQty(r.estimatedShortage),
        unitSnapshot:        r.unit,
        unitPriceSnapshot:   r.currentUnitPrice !== null ? String(r.currentUnitPrice) : '',
      }));

      // Preseleziona il fornitore più ricorrente tra gli ingredienti in shortage.
      const counts = new Map<string, number>();
      for (const s of shortages) {
        if (s.supplierId) counts.set(s.supplierId, (counts.get(s.supplierId) ?? 0) + 1);
      }
      initialSupplierId = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];

      const estCost = shortages.reduce((sum, s) => sum + (s.estimatedShortageCost ?? 0), 0);
      prefillNote =
        `${shortages.length} ingredienti sotto fabbisogno per il piano del ${shortages[0].planDate}. ` +
        (estCost > 0
          ? `Costo stimato del riordino: ${new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(estCost)}. `
          : '') +
        'Quantità precompilate con lo shortage reale: verifica e correggi prima di creare.';
    } else {
      prefillNote = 'Il piano selezionato non ha shortage: tutte le scorte coprono il fabbisogno.';
    }
  }

  return (
    <NewOrderForm
      suppliers={suppliers.map((s) => ({ id: s.id, name: s.name, email: s.email }))}
      ingredients={ingredients.map((i) => ({
        id: i.id, name: i.name, unit: i.unit, unitPrice: i.unitPrice,
      }))}
      initialSupplierId={initialSupplierId}
      initialRows={initialRows}
      prefillNote={prefillNote}
    />
  );
}
