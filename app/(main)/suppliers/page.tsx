// =============================================================================
// app/(main)/suppliers/page.tsx
// HUB FORNITORI — anagrafica + livelli di connessione + marketplace assorbito.
//   L1 = solo email (anagrafica)        L2 = workspace collegato (chiave)
//   L3 = collegato + listino dedicato
// Da qui: collega fornitore via chiave, ordini marketplace, documenti.
// =============================================================================

import type { Metadata } from 'next';
import Link from 'next/link';
import { listSuppliers } from '@/modules/catalog/service';
import { listConnectedSuppliers } from '@/modules/marketplace/service';
import { withSupplierChannel } from '@/lib/supplier-channel';
import { createClient } from '@/lib/supabase/server';
import { requireOrgId } from '@/modules/identity/service';
import { ConnectSupplierForm } from '@/components/marketplace/ConnectSupplierForm';
import { SuppliersDirectory } from '@/components/suppliers/SuppliersDirectory';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { Truck, ShoppingCart, Link2, ReceiptText, ChartColumn } from 'lucide-react';

export const metadata: Metadata = { title: 'Fornitori' };

export default async function SuppliersPage() {
  const orgId = await requireOrgId();
  const [suppliers, connections] = await Promise.all([
    listSuppliers(),
    listConnectedSuppliers().catch(() => []),
  ]);
  const enriched = withSupplierChannel(suppliers, connections);

  // Listini attivi per fornitore (L3): conteggio reale da supplier_price_list.
  const supabase = await createClient();
  const { data: plRows } = await supabase
    .from('supplier_price_list')
    .select('supplier_id')
    .eq('organization_id', orgId)
    .eq('is_active', true);
  const priceListCounts = new Map<string, number>();
  for (const r of plRows ?? []) {
    priceListCounts.set(r.supplier_id, (priceListCounts.get(r.supplier_id) ?? 0) + 1);
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto space-y-6">
      <PageHeader
        title="Fornitori"
        subtitle="Anagrafica, ordini, documenti e connessioni — tutto in un posto"
        action={
          <Link
            href="/suppliers/new"
            className="px-4 py-2.5 bg-primary text-primary-fg rounded-xl text-sm font-semibold hover:bg-primary-hover transition-colors"
          >
            + Nuovo fornitore
          </Link>
        }
      />

      {/* Scorciatoie operative del dominio fornitori */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { href: '/orders',              label: 'Ordini interni',     icon: ShoppingCart },
          { href: '/marketplace/orders',  label: 'Ordini marketplace', icon: Link2 },
          { href: '/documents',           label: 'Documenti e fatture', icon: ReceiptText },
          { href: '/analytics',           label: 'Spesa e prezzi',     icon: ChartColumn },
        ].map((s) => (
          <Link
            key={s.href}
            href={s.href}
            className="flex items-center gap-2.5 px-4 py-3 bg-surface-2 rounded-xl border border-border hover:border-primary-soft transition-colors"
          >
            <s.icon size={18} className="text-ink-muted shrink-0" aria-hidden="true" />
            <span className="text-xs font-semibold text-ink">{s.label}</span>
          </Link>
        ))}
      </div>

      {/* Collegamento via chiave (ex-marketplace, assorbito qui) */}
      <div className="bg-surface-2 rounded-2xl border border-border p-6">
        <h2 className="text-base font-bold text-ink mb-1">
          Collega un fornitore con il workspace
        </h2>
        <p className="text-xs text-ink-muted mb-4">
          Se il tuo fornitore usa BakeryOs, inserisci la chiave che ti ha
          fornito: vedrà i tuoi ordini nel suo workspace, li confermerà e potrà
          inviarti DDT e fatture direttamente.
        </p>
        <ConnectSupplierForm />
      </div>

      {/* Anagrafica con CANALE in primo piano + filtri rapidi */}
      {suppliers.length === 0 ? (
        <EmptyState
          icon={Truck}
          title="Nessun fornitore ancora"
          description="Aggiungi i tuoi fornitori per gestire ordini, documenti e prezzi."
          ctaHref="/suppliers/new"
          ctaLabel="Aggiungi fornitore"
        />
      ) : (
        <SuppliersDirectory
          suppliers={enriched.map((s) => ({
            id: s.id,
            name: s.name,
            email: s.email,
            phone: s.phone,
            isActive: s.isActive,
            channel: s.channel,
            hasPriceList: (priceListCounts.get(s.id) ?? 0) >= 5,
          }))}
        />
      )}
    </div>
  );
}
