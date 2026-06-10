// =============================================================================
// app/supplier/settings/page.tsx
// Impostazioni workspace fornitore — Server Component.
// Stato reale del workspace: catalogo, chiavi, connessioni (query reali).
// =============================================================================

import type { Metadata } from 'next';
import Link from 'next/link';
import { requireSupplierSession } from '@/modules/identity/workspace';
import {
  listOwnCatalog,
  listSupplierKeys,
  listConnectedCustomers,
} from '@/modules/marketplace/service';

export const metadata: Metadata = { title: 'Impostazioni fornitore' };

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-[#E5DDD0] overflow-hidden">
      <div className="px-6 py-4 border-b border-[#F0EBE1] bg-[#FAF7F2]">
        <h2 className="font-playfair text-base font-bold text-[#1A2B4A]">{title}</h2>
      </div>
      <div className="px-6 py-1 divide-y divide-[#F0EBE1]">{children}</div>
    </div>
  );
}

function Row({
  label,
  value,
  href,
  hrefLabel,
}: {
  label: string;
  value: string;
  href?: string;
  hrefLabel?: string;
}) {
  return (
    <div className="flex items-center justify-between py-3.5 gap-3">
      <span className="text-sm text-[#6B7280]">{label}</span>
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium text-[#1A2B4A]">{value}</span>
        {href && (
          <Link href={href} className="text-xs font-semibold text-[#14B8A6] hover:underline shrink-0">
            {hrefLabel ?? 'Gestisci →'}
          </Link>
        )}
      </div>
    </div>
  );
}

export default async function SupplierSettingsPage() {
  const session = await requireSupplierSession();

  const [catalog, keys, customers] = await Promise.all([
    listOwnCatalog(),
    listSupplierKeys(),
    listConnectedCustomers(),
  ]);

  const activeCatalog = catalog.filter((c) => c.isActive);
  const pricedCatalog = activeCatalog.filter((c) => c.unitPrice !== null);
  const activeKeys = keys.filter((k) => k.isActive);

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="font-playfair text-2xl sm:text-3xl font-bold text-[#1A2B4A]">Impostazioni</h1>
        <p className="text-sm text-[#6B7280] mt-1">Account e workspace fornitore</p>
      </div>

      <SectionCard title="Account">
        <Row label="Email" value={session.email} />
        <Row label="Tipo workspace" value="Fornitore" />
      </SectionCard>

      <SectionCard title="Organizzazione">
        <Row label="Nome" value={session.organizationName} />
        <Row label="ID organizzazione" value={session.orgId.slice(0, 8) + '…'} />
      </SectionCard>

      <SectionCard title="Stato marketplace">
        <Row
          label="Prodotti a catalogo attivi"
          value={String(activeCatalog.length)}
          href="/supplier/catalog"
        />
        <Row
          label="Prodotti con prezzo"
          value={`${pricedCatalog.length} di ${activeCatalog.length}`}
          href={pricedCatalog.length < activeCatalog.length ? '/supplier/catalog' : undefined}
          hrefLabel="Completa prezzi →"
        />
        <Row
          label="Chiavi di accesso attive"
          value={String(activeKeys.length)}
          href="/supplier/keys"
        />
        <Row
          label="Clienti collegati"
          value={String(customers.length)}
          href="/supplier/customers"
        />
      </SectionCard>

      {activeCatalog.length === 0 && (
        <div className="rounded-2xl border border-[#C9962A]/30 bg-[#C9962A]/[0.06] p-5 text-sm text-[#8A6418]">
          Il catalogo è vuoto: i clienti collegati non possono ancora ordinare.{' '}
          <Link href="/supplier/catalog" className="underline font-semibold">
            Aggiungi i tuoi prodotti
          </Link>{' '}
          con prezzo e unità per iniziare a ricevere ordini.
        </div>
      )}
    </div>
  );
}
