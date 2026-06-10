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
    <div className="relative rounded-2xl border border-[#E5DDD0] bg-white px-5 py-4 overflow-hidden transition-all hover:shadow-[0_4px_24px_rgba(15,25,35,0.10)] hover:-translate-y-px">
      {accent && <span className={`absolute top-0 left-0 h-full w-1 rounded-l-2xl ${accent}`} />}
      <p className="text-[11px] font-semibold text-[#6B7280] uppercase tracking-wide">{label}</p>
      <p className="font-playfair text-[30px] font-bold text-[#1A2B4A] mt-1 leading-none">{value}</p>
      {sub && <p className="text-xs text-[#6B7280] mt-1.5">{sub}</p>}
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
        <h1 className="font-playfair text-2xl sm:text-3xl font-bold text-[#1A2B4A] leading-tight">
          Buongiorno — <span className="text-[#14B8A6]">{session.organizationName}</span>
        </h1>
        <p className="text-sm text-[#6B7280] mt-1 capitalize">
          {new Date().toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        </p>
      </div>

      {/* KPI riga 1: pipeline ordini */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard
          label="Ordini ricevuti"
          value={summary.ordersReceived}
          sub="totale storico"
          href="/supplier/orders"
          accent={hasAnyOrder ? 'bg-[#14B8A6]' : undefined}
        />
        <KpiCard
          label="In attesa"
          value={summary.ordersPending}
          sub={summary.ordersPending > 0 ? 'da confermare' : 'nessuno da confermare'}
          href="/supplier/orders?stato=in_attesa"
          accent={summary.ordersPending > 0 ? 'bg-[#C9962A]' : undefined}
        />
        <KpiCard
          label="In lavorazione"
          value={summary.ordersInProgress}
          sub="confermati · in preparazione · spediti"
          href="/supplier/orders?stato=in_corso"
          accent={summary.ordersInProgress > 0 ? 'bg-[#1A2B4A]' : undefined}
        />
        <KpiCard
          label="Evasi"
          value={summary.ordersDelivered}
          sub="consegnati"
          href="/supplier/orders?stato=evasi"
          accent={summary.ordersDelivered > 0 ? 'bg-[#27AE60]' : undefined}
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
        <div className="bg-white rounded-2xl border border-[#E5DDD0] p-8 sm:p-10 text-center">
          <p className="text-4xl mb-3">📥</p>
          <p className="font-playfair text-lg font-bold text-[#1A2B4A]">Nessun ordine ricevuto</p>
          <p className="text-sm text-[#6B7280] mt-1 max-w-md mx-auto">
            Per ricevere ordini: pubblica il tuo <Link href="/supplier/catalog" className="text-[#14B8A6] underline">catalogo</Link>,
            genera una <Link href="/supplier/keys" className="text-[#14B8A6] underline">chiave di accesso</Link> e
            condividila con le pasticcerie clienti.
          </p>
        </div>
      )}

      {hasAnyOrder && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Ordini recenti */}
          <div className="bg-white rounded-2xl border border-[#E5DDD0] overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#F0EBE1]">
              <h2 className="font-semibold text-[15px] text-[#1A2B4A]">Ordini recenti</h2>
              <Link href="/supplier/orders" className="text-xs font-semibold text-[#14B8A6] hover:underline">
                Tutti →
              </Link>
            </div>
            <div className="divide-y divide-[#F0EBE1]">
              {recentOrders.map((o) => (
                <Link
                  key={o.orderId}
                  href={`/supplier/orders/${o.orderId}`}
                  className="flex items-center gap-3 px-5 py-3 hover:bg-[#FAF7F2] transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-[#1A2B4A] truncate">{o.customerName ?? '—'}</p>
                    <p className="text-xs text-[#6B7280] font-mono mt-0.5">
                      {timeAgo(o.submittedAt ?? o.createdAt)} · {o.lineCount} righe
                    </p>
                  </div>
                  <span className="text-xs font-mono font-semibold text-[#1A2B4A]">€{formatCurrency(o.totalValue)}</span>
                  <StatusBadge status={o.status} />
                </Link>
              ))}
            </div>
          </div>

          {/* Top clienti */}
          <div className="bg-white rounded-2xl border border-[#E5DDD0] overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#F0EBE1]">
              <h2 className="font-semibold text-[15px] text-[#1A2B4A]">Top clienti</h2>
              <Link href="/supplier/analytics" className="text-xs font-semibold text-[#14B8A6] hover:underline">
                Analisi →
              </Link>
            </div>
            {topCustomers.length === 0 ? (
              <p className="px-5 py-8 text-sm text-[#6B7280] text-center">Nessun cliente con ordini.</p>
            ) : (
              <div className="divide-y divide-[#F0EBE1]">
                {topCustomers.map((c, idx) => {
                  const max = topCustomers[0]?.totalValue || 1;
                  return (
                    <div key={c.customerOrgId} className="flex items-center gap-3 px-5 py-3">
                      <span className="text-xs font-mono text-[#6B7280] w-4">{idx + 1}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-[#1A2B4A] truncate">{c.customerName ?? '—'}</p>
                        <div className="mt-1 h-1.5 bg-[#F0EBE1] rounded-full overflow-hidden">
                          <div
                            className="h-full bg-[#14B8A6] rounded-full"
                            style={{ width: `${Math.max(5, Math.round((c.totalValue / max) * 100))}%` }}
                          />
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-xs font-mono font-semibold text-[#1A2B4A]">€{formatCurrency(c.totalValue)}</p>
                        <p className="text-[10px] text-[#6B7280]">{c.ordersCount} ordini · {timeAgo(c.lastOrderAt)}</p>
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
        <div className="bg-white rounded-2xl border border-[#E5DDD0] overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-[#F0EBE1]">
            <h2 className="font-semibold text-[15px] text-[#1A2B4A]">Top prodotti venduti</h2>
            <Link href="/supplier/analytics" className="text-xs font-semibold text-[#14B8A6] hover:underline">
              Analisi →
            </Link>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-[#FAF7F2] text-[#6B7280] text-xs uppercase">
              <tr>
                <th className="text-left px-5 py-2.5">Prodotto</th>
                <th className="text-right px-5 py-2.5">Qtà</th>
                <th className="text-right px-5 py-2.5">Ordini</th>
                <th className="text-right px-5 py-2.5">Ricavo</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={`${p.catalogItemId ?? p.name}-${p.unit}`} className="border-t border-[#F0EAE0]">
                  <td className="px-5 py-3 font-medium text-[#1A2B4A]">{p.name}</td>
                  <td className="px-5 py-3 text-right font-mono text-[#6B7280] text-xs">{p.totalQuantity} {p.unit}</td>
                  <td className="px-5 py-3 text-right font-mono text-[#6B7280] text-xs">{p.ordersCount}</td>
                  <td className="px-5 py-3 text-right font-mono font-semibold text-[#1A2B4A]">€{formatCurrency(p.totalRevenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
