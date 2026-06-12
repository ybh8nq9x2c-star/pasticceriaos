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
import { Wheat } from 'lucide-react';

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
            className="px-4 py-2.5 bg-primary text-primary-fg rounded-xl text-sm font-semibold hover:bg-primary-hover transition-colors"
          >
            + Nuovo ingrediente
          </Link>
        }
      />

      {ingredients.length === 0 ? (
        <EmptyState
          icon={Wheat}
          title="Nessun ingrediente ancora"
          description="Aggiungi gli ingredienti per costruire le tue ricette."
          ctaHref="/ingredients/new"
          ctaLabel="Aggiungi ingrediente"
        />
      ) : (
        <div className="bg-surface-2 rounded-2xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-bg border-b border-border">
              <tr>
                <th className="text-left px-6 py-3.5 font-semibold text-ink-muted text-xs uppercase tracking-wide">Nome</th>
                <th className="text-left px-6 py-3.5 font-semibold text-ink-muted text-xs uppercase tracking-wide">SKU</th>
                <th className="text-left px-6 py-3.5 font-semibold text-ink-muted text-xs uppercase tracking-wide">Unità</th>
                <th className="text-left px-6 py-3.5 font-semibold text-ink-muted text-xs uppercase tracking-wide">Prezzo/unità</th>
                <th className="text-left px-6 py-3.5 font-semibold text-ink-muted text-xs uppercase tracking-wide">Fornitore</th>
                <th className="px-6 py-3.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-divider">
              {ingredients.map((ing) => (
                <tr key={ing.id} className="hover:bg-surface-offset transition-colors">
                  <td className="px-6 py-4 font-medium text-ink">{ing.name}</td>
                  <td className="px-6 py-4 text-ink-muted font-mono text-xs">{ing.sku ?? '—'}</td>
                  <td className="px-6 py-4 text-ink-muted">{UNIT_LABELS[ing.unit]}</td>
                  <td className="px-6 py-4 text-ink-muted font-mono">
                    {ing.unitPrice !== null ? formatCurrency(ing.unitPrice) : '—'}
                  </td>
                  <td className="px-6 py-4 text-ink-muted">{ing.supplierName ?? '—'}</td>
                  <td className="px-6 py-4 text-right">
                    <Link
                      href={`/ingredients/${ing.id}`}
                      className="text-primary text-xs font-semibold hover:underline"
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
