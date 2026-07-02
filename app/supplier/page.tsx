// =============================================================================
// app/supplier/page.tsx
// Dashboard FORNITORE — Server Component.
// KPI reali da marketplace_orders/lines (viste 022): ordini ricevuti/in attesa/
// in lavorazione/evasi, clienti attivi, valore totale e medio, top clienti,
// top prodotti, ordini recenti. Empty state onesti, zero numeri finti.
// =============================================================================

import type { Metadata } from 'next';
import Link from 'next/link';
import { requireSupplierSession } from '@/modules/identity/workspace';
import {
  getSupplierDashboardSummary,
  getSupplierOrderFacts,
  getSupplierCustomerStats,
  getSupplierProductSales,
} from '@/modules/reporting/service';
import { StatusBadge } from '@/components/marketplace/StatusBadge';
import { MobileTaskCard } from '@/components/mobile/MobileTaskCard';
import { MobileSectionHeader } from '@/components/mobile/MobileSectionHeader';
import { Inbox } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';

export const metadata: Metadata = { title: 'Dashboard fornitore' };

function KpiCard({
  label,
  value,
  sub,
  href,
  accent,
}: {
  label: string;
  value: string | number;
  sub?: string;
  href?: string;
  accent?: string;
}) {
  const inner = (
    <div className="relative rounded-2xl border border-border bg-surface-2 px-5 py-4 overflow-hidden transition-all hover:shadow-[0_4px_24px_rgba(15,25,35,0.10)] hover:-translate-y-px">
      {accent && <span className={`absolute top-0 left-0 h-full w-1 rounded-l-2xl ${accent}`} />}
      <p className="text-xs font-semibold text-ink-muted uppercase tracking-wide">{label}</p>
      <p className="text-[30px] font-bold text-ink mt-1 leading-none">{value}</p>
      {sub && <p className="text-xs text-ink-muted mt-1.5">{sub}</p>}
    </div>
  );
  return href ? <Link href={href} className="block">{inner}</Link> : inner;
}

function timeAgo(iso: string | null): string {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86_400_000);
  if (days === 0) return 'oggi';
  if (days === 1) return 'ieri';
  if (days < 30) return `${days} gg fa`;
  return new Date(iso).toLocaleDateString('it-IT', { day: '2-digit', month: 'short' });
}

export default async function SupplierDashboardPage() {
  const session = await requireSupplierSession();

  const [summary, facts, customers, products] = await Promise.all([
    getSupplierDashboardSummary(),
    getSupplierOrderFacts(),
    getSupplierCustomerStats(),
    getSupplierProductSales(5),
  ]);

  const recentOrders = facts.filter((f) => f.status !== 'draft').slice(0, 5);
  const topCustomers = customers.filter((c) => c.ordersCount > 0).slice(0, 5);
  const hasAnyOrder = summary.ordersReceived > 0;

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto space-y-6 lg:space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-ink leading-tight">
          Buongiorno — <span className="text-primary">{session.organizationName}</span>
        </h1>
        <p className="text-sm text-ink-muted mt-1 capitalize">
          {new Date().toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        </p>
      </div>

      {/* ── DA FARE ADESSO (mobile): specchio del lato bakery — un tap sull'unica
          azione che conta al mattino: confermare gli ordini in attesa. ───────── */}
      {summary.ordersPending > 0 && (
        <div className="lg:hidden">
          <MobileSectionHeader>Da fare adesso</MobileSectionHeader>
          <MobileTaskCard
            href="/supplier/orders?stato=in_attesa"
            icon={Inbox}
            tone="warning"
            title={`${summary.ordersPending} ordin${summary.ordersPending === 1 ? 'e' : 'i'} da confermare`}
            cta="Apri la coda"
          />
        </div>
      )}

      {/* KPI riga 1: pipeline ordini */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard
          label="Ordini ricevuti"
          value={summary.ordersReceived}
          sub="totale storico"
          href="/supplier/orders"
          accent={hasAnyOrder ? 'bg-primary' : undefined}
        />
        <KpiCard
          label="In attesa"
          value={summary.ordersPending}
          sub={summary.ordersPending > 0 ? 'da confermare' : 'nessuno da confermare'}
          href="/supplier/orders?stato=in_attesa"
          accent={summary.ordersPending > 0 ? 'bg-primary' : undefined}
        />
        <KpiCard
          label="In lavorazione"
          value={summary.ordersInProgress}
          sub="confermati · in preparazione · spediti"
          href="/supplier/orders?stato=in_corso"
          accent={summary.ordersInProgress > 0 ? 'bg-primary' : undefined}
        />
        <KpiCard
          label="Evasi"
          value={summary.ordersDelivered}
          sub="consegnati"
          href="/supplier/orders?stato=evasi"
          accent={summary.ordersDelivered > 0 ? 'bg-success' : undefined}
        />
      </div>

      {/* KPI riga 2: valore */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <KpiCard
          label="Valore totale ordini"
          value={hasAnyOrder ? `€${formatCurrency(summary.totalValue)}` : '—'}
          sub="da snapshot prezzi righe"
        />
        <KpiCard
          label="Valore medio ordine"
          value={summary.avgOrderValue !== null ? `€${formatCurrency(summary.avgOrderValue)}` : '—'}
          sub={hasAnyOrder ? `su ${summary.ordersReceived} ordini` : 'nessun ordine'}
        />
        <KpiCard
          label="Clienti attivi"
          value={summary.activeCustomers}
          sub="con almeno un ordine"
          href="/supplier/customers"
        />
      </div>

      {!hasAnyOrder && (
        <div className="bg-surface-2 rounded-2xl border border-border p-8 sm:p-10 text-center">
          <p className="text-4xl mb-3">📥</p>
          <p className="text-lg font-bold text-ink">Nessun ordine ricevuto</p>
          <p className="text-sm text-ink-muted mt-1 max-w-md mx-auto">
            Per ricevere ordini: pubblica il tuo <Link href="/supplier/catalog" className="text-primary underline">catalogo</Link>,
            genera una <Link href="/supplier/keys" className="text-primary underline">chiave di accesso</Link> e
            condividila con le pasticcerie clienti.
          </p>
        </div>
      )}

      {hasAnyOrder && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Ordini recenti */}
          <div className="bg-surface-2 rounded-2xl border border-border overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-divider">
              <h2 className="font-semibold text-[15px] text-ink">Ordini recenti</h2>
              <Link href="/supplier/orders" className="text-xs font-semibold text-primary hover:underline">
                Tutti →
              </Link>
            </div>
            <div className="divide-y divide-divider">
              {recentOrders.map((o) => (
                <Link
                  key={o.orderId}
                  href={`/supplier/orders/${o.orderId}`}
                  className="flex items-center gap-3 px-5 py-3 hover:bg-surface-offset transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-ink truncate">{o.customerName ?? '—'}</p>
                    <p className="text-xs text-ink-muted font-mono mt-0.5">
                      {timeAgo(o.submittedAt ?? o.createdAt)} · {o.lineCount} righe
                    </p>
                  </div>
                  <span className="text-xs font-mono font-semibold text-ink">€{formatCurrency(o.totalValue)}</span>
                  <StatusBadge status={o.status} />
                </Link>
              ))}
            </div>
          </div>

          {/* Top clienti */}
          <div className="bg-surface-2 rounded-2xl border border-border overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-divider">
              <h2 className="font-semibold text-[15px] text-ink">Top clienti</h2>
              <Link href="/supplier/analytics" className="text-xs font-semibold text-primary hover:underline">
                Analisi →
              </Link>
            </div>
            {topCustomers.length === 0 ? (
              <p className="px-5 py-8 text-sm text-ink-muted text-center">Nessun cliente con ordini.</p>
            ) : (
              <div className="divide-y divide-divider">
                {topCustomers.map((c, idx) => {
                  const max = topCustomers[0]?.totalValue || 1;
                  return (
                    <div key={c.customerOrgId} className="flex items-center gap-3 px-5 py-3">
                      <span className="text-xs font-mono text-ink-muted w-4">{idx + 1}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-ink truncate">{c.customerName ?? '—'}</p>
                        <div className="mt-1 h-1.5 bg-surface-offset rounded-full overflow-hidden">
                          <div
                            className="h-full bg-primary rounded-full"
                            style={{ width: `${Math.max(5, Math.round((c.totalValue / max) * 100))}%` }}
                          />
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-xs font-mono font-semibold text-ink">€{formatCurrency(c.totalValue)}</p>
                        <p className="text-xs text-ink-muted">{c.ordersCount} ordini · {timeAgo(c.lastOrderAt)}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Top prodotti */}
      {products.length > 0 && (
        <div className="bg-surface-2 rounded-2xl border border-border overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-divider">
            <h2 className="font-semibold text-[15px] text-ink">Top prodotti venduti</h2>
            <Link href="/supplier/analytics" className="text-xs font-semibold text-primary hover:underline">
              Analisi →
            </Link>
          </div>
          {/* Guardia 375px: la tabella scorre nel wrapper, mai la pagina. */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-bg text-ink-muted text-xs uppercase">
                <tr>
                  <th className="text-left px-5 py-2.5">Prodotto</th>
                  <th className="text-right px-5 py-2.5">Qtà</th>
                  <th className="text-right px-5 py-2.5">Ordini</th>
                  <th className="text-right px-5 py-2.5">Ricavo</th>
                </tr>
              </thead>
              <tbody>
                {products.map((p) => (
                  <tr key={`${p.catalogItemId ?? p.name}-${p.unit}`} className="border-t border-divider">
                    <td className="px-5 py-3 font-medium text-ink">{p.name}</td>
                    <td className="px-5 py-3 text-right font-mono text-ink-muted text-xs whitespace-nowrap">{p.totalQuantity} {p.unit}</td>
                    <td className="px-5 py-3 text-right font-mono text-ink-muted text-xs">{p.ordersCount}</td>
                    <td className="px-5 py-3 text-right font-mono font-semibold text-ink whitespace-nowrap">€{formatCurrency(p.totalRevenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
