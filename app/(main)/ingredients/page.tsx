// =============================================================================
// app/(main)/ingredients/page.tsx
// Lista ingredienti — Server Component.
// =============================================================================

import type { Metadata } from 'next';
import Link from 'next/link';
import { listIngredients } from '@/modules/catalog/service';
import { UNIT_LABELS, formatCurrency } from '@/lib/utils';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';

export const metadata: Metadata = { title: 'Ingredienti' };

export default async function IngredientsPage() {
  const ingredients = await listIngredients();

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <PageHeader
        title="Ingredienti"
        subtitle={`${ingredients.length} ingrediente/i attivi`}
        action={
          <Link
            href="/ingredients/new"
            className="px-4 py-2.5 bg-[#1A2B4A] text-white rounded-xl text-sm font-semibold hover:bg-[#243660] transition-colors"
          >
            + Nuovo ingrediente
          </Link>
        }
      />

      {ingredients.length === 0 ? (
        <EmptyState
          emoji="🧂"
          title="Nessun ingrediente ancora"
          description="Aggiungi gli ingredienti per costruire le tue ricette."
          ctaHref="/ingredients/new"
          ctaLabel="Aggiungi ingrediente"
        />
      ) : (
        <div className="bg-white rounded-2xl border border-[#E5DDD0] overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-[#FAF7F2] border-b border-[#E5DDD0]">
              <tr>
                <th className="text-left px-6 py-3.5 font-semibold text-[#6B7280] text-xs uppercase tracking-wide">Nome</th>
                <th className="text-left px-6 py-3.5 font-semibold text-[#6B7280] text-xs uppercase tracking-wide">SKU</th>
                <th className="text-left px-6 py-3.5 font-semibold text-[#6B7280] text-xs uppercase tracking-wide">Unità</th>
                <th className="text-left px-6 py-3.5 font-semibold text-[#6B7280] text-xs uppercase tracking-wide">Prezzo/unità</th>
                <th className="text-left px-6 py-3.5 font-semibold text-[#6B7280] text-xs uppercase tracking-wide">Fornitore</th>
                <th className="px-6 py-3.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F0EBE1]">
              {ingredients.map((ing) => (
                <tr key={ing.id} className="hover:bg-[#FAF7F2] transition-colors">
                  <td className="px-6 py-4 font-medium text-[#1A2B4A]">{ing.name}</td>
                  <td className="px-6 py-4 text-[#6B7280] font-mono text-xs">{ing.sku ?? '—'}</td>
                  <td className="px-6 py-4 text-[#6B7280]">{UNIT_LABELS[ing.unit]}</td>
                  <td className="px-6 py-4 text-[#6B7280] font-mono">
                    {ing.unitPrice !== null ? formatCurrency(ing.unitPrice) : '—'}
                  </td>
                  <td className="px-6 py-4 text-[#6B7280]">{ing.supplierName ?? '—'}</td>
                  <td className="px-6 py-4 text-right">
                    <Link
                      href={`/ingredients/${ing.id}`}
                      className="text-[#C9962A] text-xs font-semibold hover:underline"
                    >
                      Modifica
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
