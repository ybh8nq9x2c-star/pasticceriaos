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
import { createClient } from '@/lib/supabase/server';
import { requireOrgId } from '@/modules/identity/service';
import { ConnectSupplierForm } from '@/components/marketplace/ConnectSupplierForm';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { Truck } from 'lucide-react';

export const metadata: Metadata = { title: 'Fornitori' };

function LevelBadge({ level }: { level: 1 | 2 | 3 }) {
  const cfg = {
    1: { label: 'L1 · Email', cls: 'bg-neutral-light text-ink-muted' },
    2: { label: 'L2 · Collegato', cls: 'bg-primary-light text-primary' },
    3: { label: 'L3 · Listino attivo', cls: 'bg-neutral-light text-ink' },
  }[level];
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${cfg.cls}`}>
      {cfg.label}
    </span>
  );
}

export default async function SuppliersPage() {
  const orgId = await requireOrgId();
  const [suppliers, connections] = await Promise.all([
    listSuppliers(),
    listConnectedSuppliers().catch(() => []),
  ]);

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

  // Connessioni marketplace non ancora legate a un'anagrafica (nessun ordine ricevuto).
  const linkedOrgIds = new Set(suppliers.map((s) => s.supplierOrgId).filter(Boolean));
  const unlinkedConnections = connections.filter((c) => !linkedOrgIds.has(c.supplierOrgId));

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-6">
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
          { href: '/orders',              label: 'Ordini interni',     emoji: '🛒' },
          { href: '/marketplace/orders',  label: 'Ordini marketplace', emoji: '🔗' },
          { href: '/documents',           label: 'Documenti e fatture', emoji: '🧾' },
          { href: '/analytics',           label: 'Spesa e prezzi',     emoji: '📊' },
        ].map((s) => (
          <Link
            key={s.href}
            href={s.href}
            className="flex items-center gap-2.5 px-4 py-3 bg-surface-2 rounded-xl border border-border hover:border-primary-soft transition-colors"
          >
            <span className="text-xl leading-none">{s.emoji}</span>
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
        {unlinkedConnections.length > 0 && (
          <div className="mt-4 pt-4 border-t border-divider">
            <p className="text-xs font-semibold text-ink-muted uppercase tracking-wide mb-2">
              Collegati (in attesa del primo ordine ricevuto)
            </p>
            <ul className="space-y-1">
              {unlinkedConnections.map((c) => (
                <li key={c.connectionId} className="text-sm text-ink flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                  {c.supplierName}
                  <Link href="/marketplace/orders/new" className="text-xs font-semibold text-primary hover:underline ml-1">
                    Ordina dal catalogo →
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Anagrafica con livelli */}
      {suppliers.length === 0 ? (
        <EmptyState
          icon={Truck}
          title="Nessun fornitore ancora"
          description="Aggiungi i tuoi fornitori per gestire ordini, documenti e prezzi."
          ctaHref="/suppliers/new"
          ctaLabel="Aggiungi fornitore"
        />
      ) : (
        <div className="bg-surface-2 rounded-2xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-bg border-b border-border">
              <tr>
                <th className="text-left px-6 py-3.5 font-semibold text-ink-muted text-xs uppercase tracking-wide">Nome</th>
                <th className="text-left px-6 py-3.5 font-semibold text-ink-muted text-xs uppercase tracking-wide">Contatti</th>
                <th className="text-left px-6 py-3.5 font-semibold text-ink-muted text-xs uppercase tracking-wide">Connessione</th>
                <th className="px-6 py-3.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-divider">
              {suppliers.map((s) => {
                // L3 = listino consolidato (>= 5 voci attive), a prescindere dal
                // canale: anche un fornitore solo-email con listino è "attivo".
                const hasPriceList = (priceListCounts.get(s.id) ?? 0) >= 5;
                const level: 1 | 2 | 3 = hasPriceList ? 3 : s.supplierOrgId ? 2 : 1;
                return (
                  <tr key={s.id} className="hover:bg-surface-offset transition-colors">
                    <td className="px-6 py-4">
                      <p className="font-medium text-ink">{s.name}</p>
                      {!s.isActive && <p className="text-xs text-danger">disattivato</p>}
                    </td>
                    <td className="px-6 py-4">
                      <p className="text-ink-muted">{s.email}</p>
                      {s.phone && <p className="text-xs font-mono text-ink-muted">{s.phone}</p>}
                    </td>
                    <td className="px-6 py-4"><LevelBadge level={level} /></td>
                    <td className="px-6 py-4 text-right">
                      <Link
                        href={`/suppliers/${s.id}`}
                        className="text-primary text-xs font-semibold hover:underline"
                      >
                        Scheda →
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
