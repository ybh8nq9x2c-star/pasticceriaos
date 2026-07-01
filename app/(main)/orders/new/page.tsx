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
  searchParams: { plan?: string; ingredient?: string; qty?: string; ingredients?: string };
}) {
  const [suppliers, ingredients] = await Promise.all([
    listSuppliers(),
    listIngredients(),
  ]);

  let initialRows: PrefillRow[] | undefined;
  let initialSupplierId: string | undefined;
  let prefillNote: string | undefined;

  // Riordino MULTIPLO ("Ordina tutti i mancanti" / task dashboard):
  // ?ingredients=id:qty,id:qty — quantità già suggerite a monte (2×soglia − scorta).
  if (searchParams.ingredients && !searchParams.plan && !searchParams.ingredient) {
    const entries = searchParams.ingredients
      .split(',')
      .slice(0, 20)
      .map((pair) => {
        const [id, rawQty] = pair.split(':');
        const ing = ingredients.find((i) => i.id === id);
        if (!ing) return null;
        const qty = Number(rawQty);
        return {
          ingredientProductId: ing.id,
          quantity:            Number.isFinite(qty) && qty > 0 ? formatQty(qty) : '',
          unitSnapshot:        ing.unit,
          unitPriceSnapshot:   ing.unitPrice !== null ? String(ing.unitPrice) : '',
          supplierId:          ing.supplierId ?? null,
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);

    if (entries.length > 0) {
      initialRows = entries.map(({ supplierId: _s, ...row }) => row);
      // Preseleziona il fornitore più ricorrente tra i mancanti (come per i piani).
      const counts = new Map<string, number>();
      for (const e of entries) {
        if (e.supplierId) counts.set(e.supplierId, (counts.get(e.supplierId) ?? 0) + 1);
      }
      initialSupplierId = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
      prefillNote =
        `${entries.length} ingredienti sotto soglia precompilati con la quantità suggerita ` +
        '(riporta la scorta a 2× la soglia): verifica e correggi prima di creare.';
    }
  }

  // Riordino rapido di UN ingrediente (da "Ordina subito" sugli alert scorte).
  if (searchParams.ingredient && !searchParams.plan) {
    const ing = ingredients.find((i) => i.id === searchParams.ingredient);
    if (ing) {
      const qty = searchParams.qty && Number(searchParams.qty) > 0 ? formatQty(Number(searchParams.qty)) : '';
      initialRows = [{
        ingredientProductId: ing.id,
        quantity:            qty,
        unitSnapshot:        ing.unit,
        unitPriceSnapshot:   ing.unitPrice !== null ? String(ing.unitPrice) : '',
      }];
      initialSupplierId = ing.supplierId ?? undefined; // preseleziona il fornitore dell'ingrediente
      prefillNote = `Riordino rapido: ${ing.name}.${qty ? ' Quantità suggerita per coprire la soglia — verifica e correggi.' : ' Inserisci la quantità da ordinare.'}`;
    }
  }

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
