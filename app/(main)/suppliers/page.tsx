// =============================================================================
// app/(main)/suppliers/page.tsx
// Lista fornitori — Server Component.
// =============================================================================

import type { Metadata } from 'next';
import Link from 'next/link';
import { listSuppliers } from '@/modules/catalog/service';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { StatusBadge } from '@/components/ui/StatusBadge';

export const metadata: Metadata = { title: 'Fornitori' };

export default async function SuppliersPage() {
  const suppliers = await listSuppliers();

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <PageHeader
        title="Fornitori"
        subtitle={`${suppliers.length} fornitore/i attivi`}
        action={
          <Link
            href="/suppliers/new"
            className="px-4 py-2.5 bg-[#1A2B4A] text-white rounded-xl text-sm font-semibold hover:bg-[#243660] transition-colors"
          >
            + Nuovo fornitore
          </Link>
        }
      />

      {suppliers.length === 0 ? (
        <EmptyState
          emoji="🤝"
          title="Nessun fornitore ancora"
          description="Aggiungi i tuoi fornitori per gestire gli ordini."
          ctaHref="/suppliers/new"
          ctaLabel="Aggiungi fornitore"
        />
      ) : (
        <div className="bg-white rounded-2xl border border-[#E5DDD0] overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-[#FAF7F2] border-b border-[#E5DDD0]">
              <tr>
                <th className="text-left px-6 py-3.5 font-semibold text-[#6B7280] text-xs uppercase tracking-wide">Nome</th>
                <th className="text-left px-6 py-3.5 font-semibold text-[#6B7280] text-xs uppercase tracking-wide">Email</th>
                <th className="text-left px-6 py-3.5 font-semibold text-[#6B7280] text-xs uppercase tracking-wide">Telefono</th>
                <th className="text-left px-6 py-3.5 font-semibold text-[#6B7280] text-xs uppercase tracking-wide">Stato</th>
                <th className="px-6 py-3.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F0EBE1]">
              {suppliers.map((s) => (
                <tr key={s.id} className="hover:bg-[#FAF7F2] transition-colors">
                  <td className="px-6 py-4 font-medium text-[#1A2B4A]">{s.name}</td>
                  <td className="px-6 py-4 text-[#6B7280]">{s.email}</td>
                  <td className="px-6 py-4 text-[#6B7280] font-mono text-xs">{s.phone ?? '—'}</td>
                  <td className="px-6 py-4">
                    <StatusBadge
                      label={s.isActive ? 'Attivo' : 'Disattivo'}
                      variant={s.isActive ? 'green' : 'gray'}
                    />
                  </td>
                  <td className="px-6 py-4 text-right">
                    <Link
                      href={`/suppliers/${s.id}`}
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
