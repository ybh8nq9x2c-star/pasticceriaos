// =============================================================================
// app/(main)/suppliers/[id]/price-list/page.tsx
// Listino prezzi concordato cliente-fornitore (Livello 3).
// Server Component: dati reali; l'editing inline è nel client child.
// =============================================================================

import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getSupplier, getSupplierPriceList, listIngredients } from '@/modules/catalog/service';
import { PriceListEditor } from './PriceListEditor';

export const metadata: Metadata = { title: 'Listino fornitore' };

export default async function PriceListPage({ params }: { params: { id: string } }) {
  let supplier;
  try {
    supplier = await getSupplier(params.id);
  } catch {
    notFound();
  }

  const [entries, ingredients] = await Promise.all([
    getSupplierPriceList(params.id),
    listIngredients(),
  ]);

  const pricedIds = new Set(entries.map((e) => e.ingredientProductId));
  const unpriced = ingredients.filter((i) => !pricedIds.has(i.id));

  return (
    <div className="p-8 max-w-3xl mx-auto space-y-6">
      <div>
        <Link href={`/suppliers/${params.id}`} className="text-sm text-[#6B7280] hover:text-[#1A2B4A] transition-colors">
          ← {supplier.name}
        </Link>
        <h1 className="font-playfair text-3xl font-bold text-[#1A2B4A] mt-3">Listino prezzi</h1>
        <p className="text-sm text-[#6B7280] mt-1">
          Prezzi concordati con {supplier.name} — {entries.length} {entries.length === 1 ? 'voce attiva' : 'voci attive'}
          {entries.length >= 5 && (
            <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-[#1A2B4A]/10 text-[#1A2B4A]">
              L3 · Listino attivo
            </span>
          )}
        </p>
      </div>

      <PriceListEditor
        supplierId={params.id}
        entries={entries}
        unpricedIngredients={unpriced.map((i) => ({
          id: i.id, name: i.name, unit: i.unit, currentPrice: i.unitPrice,
        }))}
      />
    </div>
  );
}
