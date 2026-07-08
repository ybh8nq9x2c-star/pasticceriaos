// =============================================================================
// app/(main)/suppliers/[id]/page.tsx — Server Component (P0-1).
// Scheda fornitore caricata lato server: id inesistente = 404 vero, mai una
// scheda vuota dopo uno spinner.
// =============================================================================

import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getSupplier } from '@/modules/catalog/service';
import { NotFoundError } from '@/lib/errors';
import { Badge } from '@/components/ui/Badge';
import { PortalLinkPanel } from '@/components/suppliers/PortalLinkPanel';
import { SupplierEditForm } from './SupplierEditForm';

export const metadata: Metadata = { title: 'Fornitore' };

export default async function SupplierDetailPage({ params }: { params: { id: string } }) {
  let supplier;
  try {
    supplier = await getSupplier(params.id);
  } catch (err) {
    if (err instanceof NotFoundError) notFound();
    throw err;
  }
  if (!supplier) notFound();

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-2xl mx-auto">
      <div className="mb-6">
        <Link href="/suppliers" className="text-sm text-ink-muted hover:text-ink transition-colors">
          ← Fornitori
        </Link>
        <div className="flex items-center justify-between mt-3">
          <h1 className="text-3xl font-bold text-ink">{supplier.name}</h1>
          {supplier.isActive && <Badge variant="success">Attivo</Badge>}
        </div>
      </div>

      {/* Portale fornitore + listino (prima del form: la danger zone resta in fondo) */}
      <div className="mb-8 grid grid-cols-1 sm:grid-cols-2 gap-4">
        <PortalLinkPanel supplierId={supplier.id} />
        <Link
          href={`/suppliers/${supplier.id}/price-list`}
          className="bg-surface-2 rounded-2xl border border-border p-5 hover:border-primary-soft transition-colors flex flex-col justify-between"
        >
          <div>
            <h2 className="text-xs font-semibold text-ink-muted uppercase tracking-wide mb-2">
              Listino prezzi
            </h2>
            <p className="text-xs text-ink-muted">
              Prezzi concordati per ingrediente: alimentano le bozze d&apos;ordine e
              il livello di connessione L3.
            </p>
          </div>
          <span className="mt-3 text-sm font-semibold text-primary">Gestisci listino →</span>
        </Link>
      </div>

      <SupplierEditForm supplier={supplier} />
    </div>
  );
}
