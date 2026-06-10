// =============================================================================
// app/(main)/analytics/page.tsx
// Analisi — panoramica aggregata su magazzino + ordini — Server Component.
// =============================================================================

import type { Metadata } from 'next';
import Link from 'next/link';
import {
  getInventoryStockFull,
  getOpenOrders,
  getMonthlySpend,
  getIngredientPurchaseStats,
  getRecipeCosts,
} from '@/modules/reporting/service';
import { formatCurrency, UNIT_LABELS, UNIT_SHORT } from '@/lib/utils';
import { PageHeader } from '@/components/ui/PageHeader';

export const metadata: Metadata = { title: 'Analisi' };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function pct(value: number, total: number) {
  if (total === 0) return 0;
  return Math.round((value / total) * 100);
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('it-IT', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

// ---------------------------------------------------------------------------
// KpiCard
// ---------------------------------------------------------------------------

function KpiCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string | number;
  sub?: string;
  accent?: 'red' | 'green' | 'gold' | 'navy';
}) {
  const accentClass = {
    red:   'border-l-[#C0392B]',
    green: 'border-l-[#27AE60]',
    gold:  'border-l-[#C9962A]',
    navy:  'border-l-[#1A2B4A]',
  }[accent ?? 'navy'];

  return (
    <div className={`bg-white rounded-2xl border border-[#E5DDD0] border-l-4 ${accentClass} px-5 py-4`}>
      <p className="text-[11px] font-semibold text-[#6B7280] uppercase tracking-wide">{label}</p>
      <p className="font-playfair text-2xl font-bold text-[#1A2B4A] mt-1.5 leading-none">{value}</p>
      {sub && <p className="text-xs text-[#6B7280] mt-1">{sub}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// StatusBar — horizontal stacked bar chart
// ---------------------------------------------------------------------------

function StatusBar({ items }: { items: { label: string; count: number; color: string }[] }) {
  const total = items.reduce((s, i) => s + i.count, 0);
  if (total === 0) return <div className="h-3 rounded-full bg-[#F0EBE1]" />;

  return (
    <div className="flex h-3 rounded-full overflow-hidden gap-px">
      {items
        .filter((i) => i.count > 0)
        .map((item) => (
          <div
            key={item.label}
            className={`h-full ${item.color}`}
            style={{ width: `${pct(item.count, total)}%` }}
            title={`${item.label}: ${item.count}`}
          />
        ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

function monthLabel(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('it-IT', {
    month: 'short', year: '2-digit',
  });
}

export default async function AnalyticsPage() {
  // Tutto da query reali; errori → error boundary, non zeri fittizi.
  const [stock, orders, monthlySpend, ingredientStats, recipeCosts] = await Promise.all([
    getInventoryStockFull(),
    getOpenOrders(),
    getMonthlySpend(6),
    getIngredientPurchaseStats(10),
    getRecipeCosts(),
  ]);

  const activeRecipeCosts = recipeCosts.filter((r) => r.isActive);
  const maxMonthSpend = Math.max(...monthlySpend.map((m) => m.totalSpend), 0);

  // ── Stock aggregates ─────────────────────────────────────────────────────

  const total = stock.length;
  const outOfStock = stock.filter((s) => s.stockStatus === 'out_of_stock').length;
  const critical   = stock.filter((s) => s.stockStatus === 'critical').length;
  const low        = stock.filter((s) => s.stockStatus === 'low').length;
  const ok         = stock.filter((s) => s.stockStatus === 'ok').length;
  const alertCount = outOfStock + critical + low;

  const stockValue = stock.reduce((sum, s) => sum + (s.stockValue ?? 0), 0);

  // Top 5 ingredienti per valore
  const topByValue = [...stock]
    .filter((s) => (s.stockValue ?? 0) > 0)
    .sort((a, b) => (b.stockValue ?? 0) - (a.stockValue ?? 0))
    .slice(0, 5);

  // ── Order aggregates ─────────────────────────────────────────────────────

  const openCount     = orders.filter((o) => o.status === 'draft' || o.status === 'sent').length;
  const confirmedCount = orders.filter((o) => o.status === 'confirmed').length;
  const totalOrderValue = orders.reduce((sum, o) => sum + (o.totalAmount ?? 0), 0);

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-8">
      <PageHeader title="Analisi" subtitle="Panoramica aggregata su magazzino e ordini" />

      {/* ── KPI row ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-5 sm:grid-cols-4">
        <KpiCard
          label="Ingredienti totali"
          value={total}
          sub={`${ok} in norma`}
          accent="navy"
        />
        <KpiCard
          label="Alert attivi"
          value={alertCount}
          sub={outOfStock > 0 ? `${outOfStock} esauriti` : 'nessun esaurito'}
          accent={alertCount > 0 ? 'red' : 'green'}
        />
        <KpiCard
          label="Valore magazzino"
          value={stockValue > 0 ? formatCurrency(stockValue) : '—'}
          sub="stima a costo unitario"
          accent="gold"
        />
        <KpiCard
          label="Ordini in corso"
          value={openCount + confirmedCount}
          sub={totalOrderValue > 0 ? formatCurrency(totalOrderValue) : undefined}
          accent="navy"
        />
      </div>

      {/* ── Due-panel row ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">

        {/* Distribuzione scorte */}
        <div className="bg-white rounded-2xl border border-[#E5DDD0] p-6">
          <h2 className="font-playfair text-base font-bold text-[#1A2B4A] mb-4">
            Distribuzione scorte
          </h2>

          {total === 0 ? (
            <p className="text-sm text-[#6B7280]">Nessun ingrediente tracciato.</p>
          ) : (
            <>
              <StatusBar
                items={[
                  { label: 'Esaurito', count: outOfStock, color: 'bg-[#C0392B]' },
                  { label: 'Critico',  count: critical,   color: 'bg-[#E67E22]' },
                  { label: 'Basso',    count: low,        color: 'bg-[#C9962A]' },
                  { label: 'OK',       count: ok,         color: 'bg-[#27AE60]' },
                ]}
              />
              <div className="mt-4 space-y-2.5">
                {[
                  { label: 'Esauriti',  count: outOfStock, badge: 'bg-[#C0392B]/10 text-[#C0392B]' },
                  { label: 'Critici',   count: critical,   badge: 'bg-amber-100 text-amber-700' },
                  { label: 'Bassi',     count: low,        badge: 'bg-[#C9962A]/15 text-[#8A6418]' },
                  { label: 'In norma',  count: ok,         badge: 'bg-[#27AE60]/10 text-[#1E7E45]' },
                ].map(({ label, count, badge }) => (
                  <div key={label} className="flex items-center justify-between text-sm">
                    <span className="text-[#6B7280]">{label}</span>
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${badge}`}>
                        {count}
                      </span>
                      <span className="text-xs text-[#6B7280] font-mono w-8 text-right">
                        {pct(count, total)}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-4 pt-3 border-t border-[#F0EBE1]">
                <Link
                  href="/inventory"
                  className="text-xs font-semibold text-[#C9962A] hover:underline"
                >
                  Vai al magazzino →
                </Link>
              </div>
            </>
          )}
        </div>

        {/* Ordini aperti */}
        <div className="bg-white rounded-2xl border border-[#E5DDD0] p-6">
          <h2 className="font-playfair text-base font-bold text-[#1A2B4A] mb-4">
            Stato ordini aperti
          </h2>

          {orders.length === 0 ? (
            <p className="text-sm text-[#6B7280]">Nessun ordine aperto.</p>
          ) : (
            <>
              <StatusBar
                items={[
                  { label: 'Bozza',      count: orders.filter((o) => o.status === 'draft').length,     color: 'bg-[#6B7280]' },
                  { label: 'Inviato',    count: orders.filter((o) => o.status === 'sent').length,      color: 'bg-[#C9962A]' },
                  { label: 'Confermato', count: orders.filter((o) => o.status === 'confirmed').length, color: 'bg-[#1A2B4A]' },
                ]}
              />
              <div className="mt-4 space-y-2.5">
                {[
                  { label: 'Bozza',      count: orders.filter((o) => o.status === 'draft').length,     badge: 'bg-[#6B7280]/10 text-[#6B7280]' },
                  { label: 'Inviato',    count: orders.filter((o) => o.status === 'sent').length,      badge: 'bg-[#C9962A]/15 text-[#8A6418]' },
                  { label: 'Confermato', count: orders.filter((o) => o.status === 'confirmed').length, badge: 'bg-[#1A2B4A]/10 text-[#1A2B4A]' },
                ].map(({ label, count, badge }) => (
                  <div key={label} className="flex items-center justify-between text-sm">
                    <span className="text-[#6B7280]">{label}</span>
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${badge}`}>
                        {count}
                      </span>
                      <span className="text-xs text-[#6B7280] font-mono w-8 text-right">
                        {pct(count, orders.length)}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-4 pt-3 border-t border-[#F0EBE1]">
                <Link
                  href="/orders"
                  className="text-xs font-semibold text-[#C9962A] hover:underline"
                >
                  Vai agli ordini →
                </Link>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Spesa mensile reale (ordini ricevuti) ────────────────────────── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="bg-white rounded-2xl border border-[#E5DDD0] p-6">
          <h2 className="font-playfair text-base font-bold text-[#1A2B4A] mb-1">
            Spesa mensile
          </h2>
          <p className="text-xs text-[#6B7280] mb-4">
            Valore ordini ricevuti, da prezzi snapshot reali (ultimi 6 mesi)
          </p>

          {monthlySpend.length === 0 ? (
            <div className="py-8 text-center">
              <p className="text-sm text-[#6B7280]">Nessun ordine ricevuto finora.</p>
              <Link href="/orders" className="text-xs font-semibold text-[#C9962A] hover:underline mt-1 inline-block">
                Vai agli ordini →
              </Link>
            </div>
          ) : (
            <div className="space-y-2.5">
              {monthlySpend.map((m) => (
                <div key={m.month} className="flex items-center gap-3">
                  <span className="text-xs font-mono text-[#6B7280] w-14 capitalize">{monthLabel(m.month)}</span>
                  <div className="flex-1 h-5 bg-[#F0EBE1] rounded-md overflow-hidden">
                    <div
                      className="h-full bg-[#1A2B4A] rounded-md flex items-center"
                      style={{ width: `${maxMonthSpend > 0 ? Math.max(3, Math.round((m.totalSpend / maxMonthSpend) * 100)) : 0}%` }}
                    />
                  </div>
                  <span className="text-xs font-mono font-semibold text-[#1A2B4A] w-24 text-right">
                    €{formatCurrency(m.totalSpend)}
                  </span>
                  <span className="text-[10px] text-[#6B7280] w-12 text-right">{m.ordersReceived} ord.</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Food cost per ricetta */}
        <div className="bg-white rounded-2xl border border-[#E5DDD0] p-6">
          <h2 className="font-playfair text-base font-bold text-[#1A2B4A] mb-1">
            Food cost per ricetta
          </h2>
          <p className="text-xs text-[#6B7280] mb-4">
            Costo/porzione dai prezzi ingredienti correnti; margine se il prezzo di vendita è impostato
          </p>

          {activeRecipeCosts.length === 0 ? (
            <div className="py-8 text-center">
              <p className="text-sm text-[#6B7280]">Nessuna ricetta attiva.</p>
              <Link href="/recipes/new" className="text-xs font-semibold text-[#C9962A] hover:underline mt-1 inline-block">
                Crea la prima ricetta →
              </Link>
            </div>
          ) : (
            <div className="divide-y divide-[#F0EBE1]">
              {activeRecipeCosts.slice(0, 6).map((r) => (
                <Link
                  key={r.recipeId}
                  href={`/recipes/${r.recipeId}`}
                  className="flex items-center gap-3 py-2.5 group"
                >
                  <span className="text-lg leading-none">{r.emoji ?? '📖'}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-[#1A2B4A] group-hover:text-[#C9962A] truncate">{r.name}</p>
                    {r.costPerPortion === null && (
                      <p className="text-[10px] text-[#E67E22]">
                        {r.ingredientCount === 0
                          ? 'nessun ingrediente'
                          : `${r.ingredientCount - r.pricedIngredientCount} ingredienti senza prezzo`}
                      </p>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-mono font-semibold text-[#1A2B4A]">
                      {r.costPerPortion !== null ? `€${formatCurrency(r.costPerPortion)}/porz.` : '—'}
                    </p>
                    {r.marginPct !== null && (
                      <p className={`text-[10px] font-semibold ${r.marginPct >= 60 ? 'text-[#27AE60]' : r.marginPct >= 30 ? 'text-[#C9962A]' : 'text-[#C0392B]'}`}>
                        margine {r.marginPct}%
                      </p>
                    )}
                  </div>
                </Link>
              ))}
              {activeRecipeCosts.length > 6 && (
                <p className="text-xs text-[#6B7280] pt-2.5">+{activeRecipeCosts.length - 6} altre ricette</p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Spesa per ingrediente + variazione prezzo fornitore ──────────── */}
      {ingredientStats.length > 0 && (
        <div>
          <h2 className="font-semibold text-sm text-[#6B7280] uppercase tracking-wide mb-3">
            Top ingredienti per spesa (ordini ricevuti)
          </h2>
          <div className="bg-white rounded-2xl border border-[#E5DDD0] overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-[#FAF7F2] border-b border-[#E5DDD0]">
                <tr>
                  <th className="text-left px-6 py-3 font-semibold text-[#6B7280] text-xs uppercase tracking-wide">Ingrediente</th>
                  <th className="text-right px-6 py-3 font-semibold text-[#6B7280] text-xs uppercase tracking-wide">Qtà acquistata</th>
                  <th className="text-right px-6 py-3 font-semibold text-[#6B7280] text-xs uppercase tracking-wide">Spesa totale</th>
                  <th className="text-right px-6 py-3 font-semibold text-[#6B7280] text-xs uppercase tracking-wide">Ultimo prezzo</th>
                  <th className="text-right px-6 py-3 font-semibold text-[#6B7280] text-xs uppercase tracking-wide">Variazione</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F0EBE1]">
                {ingredientStats.map((item) => (
                  <tr key={item.ingredientProductId} className="hover:bg-[#FAF7F2] transition-colors">
                    <td className="px-6 py-3.5 font-medium text-[#1A2B4A]">{item.ingredientName}</td>
                    <td className="px-6 py-3.5 text-right font-mono text-[#6B7280] text-xs">
                      {item.totalQuantity} {UNIT_SHORT[item.unit]}
                    </td>
                    <td className="px-6 py-3.5 text-right font-mono font-semibold text-[#1A2B4A]">
                      €{formatCurrency(item.totalSpend)}
                    </td>
                    <td className="px-6 py-3.5 text-right font-mono text-[#6B7280] text-xs">
                      {item.lastPrice !== null ? `€${formatCurrency(item.lastPrice)}/${UNIT_SHORT[item.unit]}` : '—'}
                    </td>
                    <td className="px-6 py-3.5 text-right">
                      {item.priceChangePct === null ? (
                        <span className="text-xs text-[#6B7280]">—</span>
                      ) : item.priceChangePct === 0 ? (
                        <span className="text-xs font-semibold text-[#6B7280]">stabile</span>
                      ) : (
                        <span className={`text-xs font-semibold ${item.priceChangePct > 0 ? 'text-[#C0392B]' : 'text-[#27AE60]'}`}>
                          {item.priceChangePct > 0 ? '▲' : '▼'} {Math.abs(item.priceChangePct)}%
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Top ingredienti per valore ───────────────────────────────────── */}
      {topByValue.length > 0 && (
        <div>
          <h2 className="font-semibold text-sm text-[#6B7280] uppercase tracking-wide mb-3">
            Top ingredienti per valore in scorta
          </h2>
          <div className="bg-white rounded-2xl border border-[#E5DDD0] overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-[#FAF7F2] border-b border-[#E5DDD0]">
                <tr>
                  <th className="text-left px-6 py-3 font-semibold text-[#6B7280] text-xs uppercase tracking-wide">#</th>
                  <th className="text-left px-6 py-3 font-semibold text-[#6B7280] text-xs uppercase tracking-wide">Ingrediente</th>
                  <th className="text-right px-6 py-3 font-semibold text-[#6B7280] text-xs uppercase tracking-wide">Scorta</th>
                  <th className="text-right px-6 py-3 font-semibold text-[#6B7280] text-xs uppercase tracking-wide">Valore</th>
                  <th className="text-right px-6 py-3 font-semibold text-[#6B7280] text-xs uppercase tracking-wide">% totale</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F0EBE1]">
                {topByValue.map((item, idx) => (
                  <tr key={item.ingredientProductId} className="hover:bg-[#FAF7F2] transition-colors">
                    <td className="px-6 py-3.5 text-[#6B7280] font-mono text-xs">{idx + 1}</td>
                    <td className="px-6 py-3.5">
                      <p className="font-medium text-[#1A2B4A]">{item.ingredientName}</p>
                      {item.supplierName && (
                        <p className="text-xs text-[#6B7280] mt-0.5">{item.supplierName}</p>
                      )}
                    </td>
                    <td className="px-6 py-3.5 text-right font-mono text-[#6B7280] text-xs">
                      {item.currentQuantity} {UNIT_LABELS[item.unit]}
                    </td>
                    <td className="px-6 py-3.5 text-right font-mono font-semibold text-[#1A2B4A]">
                      {item.stockValue !== null ? formatCurrency(item.stockValue) : '—'}
                    </td>
                    <td className="px-6 py-3.5 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <div className="w-16 h-1.5 bg-[#F0EBE1] rounded-full overflow-hidden">
                          <div
                            className="h-full bg-[#C9962A] rounded-full"
                            style={{ width: `${pct(item.stockValue ?? 0, stockValue)}%` }}
                          />
                        </div>
                        <span className="font-mono text-xs text-[#6B7280]">
                          {pct(item.stockValue ?? 0, stockValue)}%
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Ordini recenti ──────────────────────────────────────────────── */}
      {orders.length > 0 && (
        <div>
          <h2 className="font-semibold text-sm text-[#6B7280] uppercase tracking-wide mb-3">
            Ordini aperti recenti
          </h2>
          <div className="bg-white rounded-2xl border border-[#E5DDD0] overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-[#FAF7F2] border-b border-[#E5DDD0]">
                <tr>
                  <th className="text-left px-6 py-3 font-semibold text-[#6B7280] text-xs uppercase tracking-wide">Fornitore</th>
                  <th className="text-left px-6 py-3 font-semibold text-[#6B7280] text-xs uppercase tracking-wide">Data</th>
                  <th className="text-left px-6 py-3 font-semibold text-[#6B7280] text-xs uppercase tracking-wide">Stato</th>
                  <th className="text-right px-6 py-3 font-semibold text-[#6B7280] text-xs uppercase tracking-wide">Articoli</th>
                  <th className="text-right px-6 py-3 font-semibold text-[#6B7280] text-xs uppercase tracking-wide">Importo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F0EBE1]">
                {orders.slice(0, 5).map((order) => {
                  const STATUS_BADGE: Record<string, string> = {
                    draft:     'bg-[#6B7280]/10 text-[#6B7280]',
                    sent:      'bg-[#C9962A]/15 text-[#8A6418]',
                    confirmed: 'bg-[#1A2B4A]/10 text-[#1A2B4A]',
                  };
                  const STATUS_LABEL: Record<string, string> = {
                    draft: 'Bozza', sent: 'Inviato', confirmed: 'Confermato',
                  };
                  return (
                    <tr key={order.orderId} className="hover:bg-[#FAF7F2] transition-colors">
                      <td className="px-6 py-3.5 font-medium text-[#1A2B4A]">{order.supplierName}</td>
                      <td className="px-6 py-3.5 text-[#6B7280] text-xs font-mono whitespace-nowrap">
                        {formatDate(order.orderDate)}
                      </td>
                      <td className="px-6 py-3.5">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${STATUS_BADGE[order.status] ?? 'bg-[#6B7280]/10 text-[#6B7280]'}`}>
                          {STATUS_LABEL[order.status] ?? order.status}
                        </span>
                      </td>
                      <td className="px-6 py-3.5 text-right font-mono text-[#6B7280] text-xs">
                        {order.lineItemsCount}
                      </td>
                      <td className="px-6 py-3.5 text-right font-mono font-medium text-[#1A2B4A]">
                        {order.totalAmount !== null ? formatCurrency(order.totalAmount) : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex justify-end mt-3">
            <Link href="/orders" className="text-sm font-medium text-[#C9962A] hover:underline">
              Vedi tutti gli ordini →
            </Link>
          </div>
        </div>
      )}

      {/* Empty state */}
      {total === 0 && orders.length === 0 && monthlySpend.length === 0 && activeRecipeCosts.length === 0 && (
        <div className="text-center py-20 bg-white rounded-2xl border border-[#E5DDD0]">
          <p className="text-4xl mb-3">📊</p>
          <p className="font-playfair text-lg font-bold text-[#1A2B4A]">Nessun dato disponibile</p>
          <p className="text-sm text-[#6B7280] mt-1">
            Aggiungi ingredienti e registra movimenti per vedere le analisi.
          </p>
        </div>
      )}
    </div>
  );
}
