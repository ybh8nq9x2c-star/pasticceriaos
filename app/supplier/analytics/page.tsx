// =============================================================================
// app/supplier/analytics/page.tsx
// Analisi FORNITORE — Server Component.
// Andamento domanda (mensile), trend per cliente, vendite per prodotto,
// distribuzione stati. Tutto da viste reali su marketplace_orders.
// =============================================================================

import type { Metadata } from 'next';
import Link from 'next/link';
import {
  getSupplierDashboardSummary,
  getSupplierMonthlySales,
  getSupplierProductSales,
  getSupplierCustomerStats,
} from '@/modules/reporting/service';
import { formatCurrency } from '@/lib/utils';

export const metadata: Metadata = { title: 'Analisi fornitore' };

function monthLabel(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('it-IT', { month: 'short', year: '2-digit' });
}

function formatDateShort(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default async function SupplierAnalyticsPage() {
  const [summary, monthly, products, customers] = await Promise.all([
    getSupplierDashboardSummary(),
    getSupplierMonthlySales(6),
    getSupplierProductSales(10),
    getSupplierCustomerStats(),
  ]);

  const maxMonthValue = Math.max(...monthly.map((m) => m.totalValue), 0);
  const activeCustomers = customers.filter((c) => c.ordersCount > 0);
  const hasData = summary.ordersReceived > 0;

  const pipeline = [
    { label: 'In attesa',      count: summary.ordersPending,    color: 'bg-[#C9962A]' },
    { label: 'In lavorazione', count: summary.ordersInProgress, color: 'bg-[#1A2B4A]' },
    { label: 'Evasi',          count: summary.ordersDelivered,  color: 'bg-[#27AE60]' },
    { label: 'Annullati',      count: summary.ordersCancelled,  color: 'bg-[#C0392B]' },
  ];
  const pipelineTotal = pipeline.reduce((s, p) => s + p.count, 0);

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto space-y-6 lg:space-y-8">
      <div>
        <h1 className="font-playfair text-2xl sm:text-3xl font-bold text-[#1A2B4A]">Analisi</h1>
        <p className="text-sm text-[#6B7280] mt-1">
          Domanda, clienti e prodotti — calcolati dagli ordini reali ricevuti
        </p>
      </div>

      {!hasData ? (
        <div className="bg-white rounded-2xl border border-[#E5DDD0] p-10 text-center">
          <p className="text-4xl mb-3">📊</p>
          <p className="font-playfair text-lg font-bold text-[#1A2B4A]">Nessun dato disponibile</p>
          <p className="text-sm text-[#6B7280] mt-1 max-w-md mx-auto">
            Le analisi si popolano automaticamente quando i clienti collegati inviano ordini.
            Condividi una <Link href="/supplier/keys" className="text-[#14B8A6] underline">chiave di accesso</Link> per iniziare.
          </p>
        </div>
      ) : (
        <>
          {/* KPI sintetici */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {[
              { label: 'Ordini ricevuti', value: String(summary.ordersReceived) },
              { label: 'Valore totale', value: `€${formatCurrency(summary.totalValue)}` },
              { label: 'Valore medio', value: summary.avgOrderValue !== null ? `€${formatCurrency(summary.avgOrderValue)}` : '—' },
              { label: 'Clienti attivi', value: String(summary.activeCustomers) },
            ].map((k) => (
              <div key={k.label} className="bg-white rounded-2xl border border-[#E5DDD0] px-5 py-4">
                <p className="text-[11px] font-semibold text-[#6B7280] uppercase tracking-wide">{k.label}</p>
                <p className="font-playfair text-2xl font-bold text-[#1A2B4A] mt-1.5 leading-none">{k.value}</p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Andamento domanda mensile */}
            <div className="bg-white rounded-2xl border border-[#E5DDD0] p-6">
              <h2 className="font-playfair text-base font-bold text-[#1A2B4A] mb-1">Andamento domanda</h2>
              <p className="text-xs text-[#6B7280] mb-4">Valore ordini sottomessi per mese (ultimi 6 mesi)</p>

              {monthly.length === 0 ? (
                <p className="text-sm text-[#6B7280] py-6 text-center">Nessun ordine negli ultimi 6 mesi.</p>
              ) : (
                <div className="space-y-2.5">
                  {monthly.map((m) => (
                    <div key={m.month} className="flex items-center gap-3">
                      <span className="text-xs font-mono text-[#6B7280] w-14 capitalize">{monthLabel(m.month)}</span>
                      <div className="flex-1 h-5 bg-[#F0EBE1] rounded-md overflow-hidden">
                        <div
                          className="h-full bg-[#14B8A6] rounded-md"
                          style={{ width: `${maxMonthValue > 0 ? Math.max(3, Math.round((m.totalValue / maxMonthValue) * 100)) : 0}%` }}
                        />
                      </div>
                      <span className="text-xs font-mono font-semibold text-[#1A2B4A] w-24 text-right">
                        €{formatCurrency(m.totalValue)}
                      </span>
                      <span className="text-[10px] text-[#6B7280] w-20 text-right">
                        {m.ordersCount} ord. · {m.customersCount} cli.
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Distribuzione stati */}
            <div className="bg-white rounded-2xl border border-[#E5DDD0] p-6">
              <h2 className="font-playfair text-base font-bold text-[#1A2B4A] mb-1">Stato evasione</h2>
              <p className="text-xs text-[#6B7280] mb-4">Distribuzione degli ordini ricevuti per stato</p>

              {pipelineTotal === 0 ? (
                <div className="h-3 rounded-full bg-[#F0EBE1]" />
              ) : (
                <div className="flex h-3 rounded-full overflow-hidden gap-px">
                  {pipeline.filter((p) => p.count > 0).map((p) => (
                    <div
                      key={p.label}
                      className={`h-full ${p.color}`}
                      style={{ width: `${Math.round((p.count / pipelineTotal) * 100)}%` }}
                      title={`${p.label}: ${p.count}`}
                    />
                  ))}
                </div>
              )}
              <div className="mt-4 space-y-2.5">
                {pipeline.map((p) => (
                  <div key={p.label} className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2 text-[#6B7280]">
                      <span className={`w-2 h-2 rounded-full ${p.color}`} />
                      {p.label}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-semibold text-[#1A2B4A]">{p.count}</span>
                      <span className="text-xs text-[#6B7280] font-mono w-9 text-right">
                        {pipelineTotal > 0 ? Math.round((p.count / pipelineTotal) * 100) : 0}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Trend per cliente */}
          <div>
            <h2 className="font-semibold text-sm text-[#6B7280] uppercase tracking-wide mb-3">
              Clienti — valore e frequenza
            </h2>
            <div className="bg-white rounded-2xl border border-[#E5DDD0] overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-[#FAF7F2] text-[#6B7280] text-xs uppercase">
                  <tr>
                    <th className="text-left px-5 py-3">Cliente</th>
                    <th className="text-right px-5 py-3">Ordini</th>
                    <th className="text-right px-5 py-3">Evasi</th>
                    <th className="text-right px-5 py-3">Valore totale</th>
                    <th className="text-right px-5 py-3">Ultimo ordine</th>
                  </tr>
                </thead>
                <tbody>
                  {activeCustomers.map((c) => (
                    <tr key={c.customerOrgId} className="border-t border-[#F0EAE0]">
                      <td className="px-5 py-3 font-medium text-[#1A2B4A]">{c.customerName ?? '—'}</td>
                      <td className="px-5 py-3 text-right font-mono">{c.ordersCount}</td>
                      <td className="px-5 py-3 text-right font-mono text-[#6B7280]">{c.deliveredCount}</td>
                      <td className="px-5 py-3 text-right font-mono font-semibold">€{formatCurrency(c.totalValue)}</td>
                      <td className="px-5 py-3 text-right text-xs font-mono text-[#6B7280]">{formatDateShort(c.lastOrderAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Vendite per prodotto */}
          {products.length > 0 && (
            <div>
              <h2 className="font-semibold text-sm text-[#6B7280] uppercase tracking-wide mb-3">
                Prodotti — quantità e ricavo
              </h2>
              <div className="bg-white rounded-2xl border border-[#E5DDD0] overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-[#FAF7F2] text-[#6B7280] text-xs uppercase">
                    <tr>
                      <th className="text-left px-5 py-3">Prodotto</th>
                      <th className="text-right px-5 py-3">Qtà venduta</th>
                      <th className="text-right px-5 py-3">Ordini</th>
                      <th className="text-right px-5 py-3">Clienti</th>
                      <th className="text-right px-5 py-3">Ricavo</th>
                      <th className="text-right px-5 py-3">Ultimo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {products.map((p) => (
                      <tr key={`${p.catalogItemId ?? p.name}-${p.unit}`} className="border-t border-[#F0EAE0]">
                        <td className="px-5 py-3 font-medium text-[#1A2B4A]">{p.name}</td>
                        <td className="px-5 py-3 text-right font-mono text-[#6B7280]">{p.totalQuantity} {p.unit}</td>
                        <td className="px-5 py-3 text-right font-mono text-[#6B7280]">{p.ordersCount}</td>
                        <td className="px-5 py-3 text-right font-mono text-[#6B7280]">{p.customersCount}</td>
                        <td className="px-5 py-3 text-right font-mono font-semibold text-[#1A2B4A]">€{formatCurrency(p.totalRevenue)}</td>
                        <td className="px-5 py-3 text-right text-xs font-mono text-[#6B7280]">{formatDateShort(p.lastOrderedAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
