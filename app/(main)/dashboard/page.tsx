// =============================================================================
// app/(main)/dashboard/page.tsx
// Dashboard principale — Server Component.
// Aggrega: KPI, ordini aperti, alert scorte, piano di oggi.
// =============================================================================

import type { Metadata } from 'next';
import Link from 'next/link';
import { getDashboardSummary, getOpenOrders } from '@/modules/reporting/service';
import { getLowStockAlerts } from '@/modules/inventory/service';
import { requireSession } from '@/modules/identity/service';
import { formatCurrency } from '@/lib/utils';

export const metadata: Metadata = { title: 'Dashboard' };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ORDER_STATUS_LABELS: Record<string, string> = {
  draft:     'Bozza',
  sent:      'Inviato',
  confirmed: 'Confermato',
  received:  'Ricevuto',
  cancelled: 'Annullato',
};

const ORDER_STATUS_COLOR: Record<string, string> = {
  draft:     'bg-[#6B7280]/10 text-[#6B7280]',
  sent:      'bg-[#C9962A]/15 text-[#8A6418]',
  confirmed: 'bg-[#1A2B4A]/10 text-[#1A2B4A]',
  received:  'bg-[#27AE60]/10 text-[#1E7E45]',
  cancelled: 'bg-[#C0392B]/10 text-[#C0392B]',
};

const ALERT_CFG = {
  out_of_stock: { dot: 'bg-[#C0392B]', badge: 'bg-[#C0392B]/10 text-[#C0392B]', label: 'Esaurito' },
  critical:     { dot: 'bg-[#E67E22]', badge: 'bg-amber-100 text-amber-700',     label: 'Critico'  },
  low:          { dot: 'bg-[#C9962A]', badge: 'bg-[#C9962A]/15 text-[#8A6418]',  label: 'Basso'    },
} as const;

function todayLabel() {
  return new Date().toLocaleDateString('it-IT', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
}

function shortDate(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('it-IT', {
    day: '2-digit', month: 'short',
  });
}

// ---------------------------------------------------------------------------
// KPI Card sub-component
// ---------------------------------------------------------------------------

function KpiCard({
  label,
  value,
  sub,
  href,
  accentClass,
}: {
  label: string;
  value: string | number;
  sub?: string;
  href?: string;
  accentClass?: string;
}) {
  const inner = (
    <div className="relative rounded-2xl border border-[#E5DDD0] bg-white px-6 py-5 overflow-hidden transition-all hover:shadow-[0_4px_24px_rgba(26,43,74,0.10)] hover:-translate-y-px cursor-pointer">
      {accentClass && (
        <span className={`absolute top-0 left-0 h-full w-1 rounded-l-2xl ${accentClass}`} />
      )}
      <p className="text-[11px] font-semibold text-[#6B7280] uppercase tracking-wide">{label}</p>
      <p className="font-playfair text-[34px] font-bold text-[#1A2B4A] mt-1 leading-none">{value}</p>
      {sub && <p className="text-xs text-[#6B7280] mt-1.5">{sub}</p>}
    </div>
  );
  return href ? <Link href={href} className="block">{inner}</Link> : inner;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function DashboardPage() {
  const session = await requireSession();

  const [summary, openOrders, stockAlerts] = await Promise.all([
    getDashboardSummary().catch(() => ({
      lowStockCount: 0,
      outOfStockCount: 0,
      openOrdersCount: 0,
      openOrdersTotalValue: null as number | null,
      activePlansCount: 0,
      todayPlan: null as { id: string; status: string; itemsCount: number } | null,
    })),
    getOpenOrders().catch(() => []),
    getLowStockAlerts().catch(() => []),
  ]);

  const totalAlerts   = summary.lowStockCount + summary.outOfStockCount;
  const recentOrders  = openOrders.slice(0, 5);
  const criticalAlerts = stockAlerts.slice(0, 6);

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-8">

      {/* Header */}
      <div>
        <h1 className="font-playfair text-3xl font-bold text-[#1A2B4A] leading-tight">
          Buongiorno —{' '}
          <span className="text-[#C9962A]">{session.organizationName}</span>
        </h1>
        <p className="text-sm text-[#6B7280] mt-1 capitalize">{todayLabel()}</p>
      </div>

      {/* KPI grid */}
      <div className="grid grid-cols-2 gap-5 lg:grid-cols-4">
        <KpiCard
          label="Sotto soglia"
          value={totalAlerts}
          sub={
            summary.outOfStockCount > 0 ? `${summary.outOfStockCount} esauriti` :
            summary.lowStockCount   > 0 ? `${summary.lowStockCount} in alert`   :
            'Tutto OK'
          }
          href="/inventory"
          accentClass={
            summary.outOfStockCount > 0 ? 'bg-[#C0392B]' :
            summary.lowStockCount   > 0 ? 'bg-[#E67E22]' :
            'bg-[#27AE60]'
          }
        />
        <KpiCard
          label="Ordini aperti"
          value={summary.openOrdersCount}
          sub={
            summary.openOrdersTotalValue !== null
              ? `Valore: ${formatCurrency(summary.openOrdersTotalValue)}`
              : summary.openOrdersCount > 0 ? 'Valore non calcolabile' : 'Nessun ordine'
          }
          href="/orders"
          accentClass={summary.openOrdersCount > 0 ? 'bg-[#C9962A]' : undefined}
        />
        <KpiCard
          label="Piani attivi"
          value={summary.activePlansCount}
          sub={summary.activePlansCount > 0 ? 'Produzione in corso' : 'Nessun piano attivo'}
          href="/production"
          accentClass={summary.activePlansCount > 0 ? 'bg-[#1A2B4A]' : undefined}
        />
        <KpiCard
          label="Piano di oggi"
          value={
            summary.todayPlan
              ? summary.todayPlan.status === 'completed'
                ? 'Completato'
                : `${summary.todayPlan.itemsCount} ricette`
              : '—'
          }
          sub={
            summary.todayPlan
              ? `Stato: ${summary.todayPlan.status === 'completed' ? 'completato' : summary.todayPlan.status}`
              : 'Nessun piano oggi'
          }
          href={summary.todayPlan ? `/production/${summary.todayPlan.id}` : '/production/new'}
          accentClass={
            summary.todayPlan?.status === 'completed' ? 'bg-[#27AE60]' :
            summary.todayPlan          ? 'bg-[#2A7D6B]' :
            undefined
          }
        />
      </div>

      {/* 2-col panel: ordini recenti + alert scorte */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">

        {/* Ordini aperti (3/5) */}
        <div className="lg:col-span-3 bg-white rounded-2xl border border-[#E5DDD0] overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-[#F0EBE1]">
            <h2 className="font-semibold text-[15px] text-[#1A2B4A]">Ordini aperti</h2>
            <Link href="/orders" className="text-xs font-semibold text-[#C9962A] hover:underline">
              Vedi tutti →
            </Link>
          </div>

          {recentOrders.length === 0 ? (
            <div className="px-6 py-10 text-center">
              <p className="text-sm text-[#6B7280]">Nessun ordine aperto.</p>
              <Link
                href="/orders/new"
                className="inline-block mt-3 text-xs font-semibold text-[#C9962A] hover:underline"
              >
                Crea il primo ordine →
              </Link>
            </div>
          ) : (
            <div className="divide-y divide-[#F0EBE1]">
              {recentOrders.map((order) => (
                <Link
                  key={order.orderId}
                  href={`/orders/${order.orderId}`}
                  className="flex items-center gap-4 px-6 py-3.5 hover:bg-[#FAF7F2] transition-colors group"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-[#1A2B4A] group-hover:text-[#C9962A] truncate">
                      {order.supplierName}
                    </p>
                    <p className="text-xs text-[#6B7280] font-mono mt-0.5">
                      {shortDate(order.orderDate)}
                      {order.expectedDate && ` · consegna ${shortDate(order.expectedDate)}`}
                      {' · '}{order.lineItemsCount} righe
                    </p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    {order.totalAmount !== null && (
                      <span className="text-xs font-mono font-medium text-[#1A2B4A]">
                        {formatCurrency(order.totalAmount)}
                      </span>
                    )}
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${ORDER_STATUS_COLOR[order.status] ?? 'bg-[#6B7280]/10 text-[#6B7280]'}`}>
                      {ORDER_STATUS_LABELS[order.status] ?? order.status}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}

          <div className="px-6 py-3 border-t border-[#F0EBE1] flex justify-between items-center">
            <span className="text-xs text-[#6B7280]">
              {summary.openOrdersCount > 5 ? `+${summary.openOrdersCount - 5} altri` : ''}
            </span>
            <Link
              href="/orders/new"
              className="text-xs font-semibold text-[#1A2B4A] hover:text-[#C9962A]"
            >
              + Nuovo ordine
            </Link>
          </div>
        </div>

        {/* Alert scorte (2/5) */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-[#E5DDD0] overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-[#F0EBE1]">
            <h2 className="font-semibold text-[15px] text-[#1A2B4A]">Scorte critiche</h2>
            <Link href="/inventory" className="text-xs font-semibold text-[#C9962A] hover:underline">
              Magazzino →
            </Link>
          </div>

          {criticalAlerts.length === 0 ? (
            <div className="px-5 py-10 text-center space-y-1">
              <div className="w-8 h-8 rounded-full bg-[#27AE60]/15 flex items-center justify-center mx-auto">
                <span className="text-[#27AE60] text-sm font-bold">✓</span>
              </div>
              <p className="text-sm text-[#6B7280] mt-2">Tutte le scorte sono OK.</p>
            </div>
          ) : (
            <>
              <div className="divide-y divide-[#F0EBE1]">
                {criticalAlerts.map((alert) => {
                  const cfg = ALERT_CFG[alert.alertLevel] ?? ALERT_CFG.low;
                  return (
                    <div key={alert.ingredientProductId} className="flex items-center gap-3 px-5 py-3">
                      <span className={`w-2 h-2 rounded-full shrink-0 ${cfg.dot}`} />
                      <span className="flex-1 text-sm text-[#1A2B4A] truncate">
                        {alert.ingredientName}
                      </span>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${cfg.badge}`}>
                        {cfg.label}
                      </span>
                    </div>
                  );
                })}
              </div>
              <div className="px-5 py-3 border-t border-[#F0EBE1]">
                <Link
                  href="/orders/new"
                  className="block w-full py-2 text-center rounded-xl text-xs font-semibold bg-[#1A2B4A] text-white hover:bg-[#243660] transition-colors"
                >
                  Crea ordine di rifornimento
                </Link>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Azioni rapide */}
      <div className="bg-white rounded-2xl border border-[#E5DDD0] p-6">
        <h2 className="font-semibold text-[15px] text-[#1A2B4A] mb-4">Azioni rapide</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { href: '/recipes/new',     label: 'Nuova ricetta',     icon: '📖' },
            { href: '/production/new',  label: 'Nuovo piano',       icon: '🧮' },
            { href: '/orders/new',      label: 'Nuovo ordine',      icon: '🛒' },
            { href: '/ingredients/new', label: 'Nuovo ingrediente', icon: '🧂' },
          ].map(({ href, label, icon }) => (
            <Link
              key={href}
              href={href}
              className="flex flex-col items-center gap-2 p-4 rounded-xl border border-[#E5DDD0] hover:border-[#C9962A] hover:bg-[#C9962A]/[0.04] transition-colors text-center group"
            >
              <span className="text-2xl leading-none">{icon}</span>
              <span className="text-xs font-medium text-[#6B7280] group-hover:text-[#1A2B4A]">{label}</span>
            </Link>
          ))}
        </div>
      </div>

    </div>
  );
}
