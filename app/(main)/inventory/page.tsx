// =============================================================================
// app/(main)/inventory/page.tsx
// Magazzino: livelli scorte con progress bars + alert — Server Component.
// Usa getInventoryStockFull per dati arricchiti (status, stockValue).
// =============================================================================

import type { Metadata } from 'next';
import Link from 'next/link';
import { getInventoryStockFull } from '@/modules/reporting/service';
import { UNIT_LABELS, formatCurrency } from '@/lib/utils';
import type { InventoryStockFull } from '@/modules/reporting/types';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';

export const metadata: Metadata = { title: 'Magazzino' };

// ---------------------------------------------------------------------------
// Config badge/colori per status
// ---------------------------------------------------------------------------

const STATUS_CFG = {
  out_of_stock: {
    bar:   'bg-[#C0392B]',
    badge: 'bg-[#C0392B]/10 text-[#C0392B]',
    label: 'Esaurito',
    rowBg: 'bg-[#C0392B]/[0.03]',
  },
  critical: {
    bar:   'bg-[#E67E22]',
    badge: 'bg-amber-100 text-amber-700',
    label: 'Critico',
    rowBg: 'bg-amber-50/50',
  },
  low: {
    bar:   'bg-[#C9962A]',
    badge: 'bg-[#C9962A]/15 text-[#8A6418]',
    label: 'Basso',
    rowBg: 'bg-[#C9962A]/[0.03]',
  },
  ok: {
    bar:   'bg-[#27AE60]',
    badge: 'bg-[#27AE60]/10 text-[#1E7E45]',
    label: 'OK',
    rowBg: '',
  },
} as const;

// ---------------------------------------------------------------------------
// Stock bar component (inline)
// ---------------------------------------------------------------------------

function StockBar({
  current,
  threshold,
  status,
}: {
  current: number;
  threshold: number;
  status: keyof typeof STATUS_CFG;
}) {
  // Calcola percentuale rispetto a 2x la soglia minima (soglia = 50%)
  const refMax = Math.max(threshold * 2, current);
  const pct    = refMax > 0 ? Math.min(100, (current / refMax) * 100) : 0;
  const cfg    = STATUS_CFG[status];

  return (
    <div className="flex items-center gap-2.5">
      <div className="w-20 h-1.5 bg-[#F0EBE1] rounded-full overflow-hidden shrink-0">
        <div
          className={`h-full rounded-full transition-all ${cfg.bar}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs font-mono text-[#6B7280]">{pct.toFixed(0)}%</span>
    </div>
  );
}

function formatQty(n: number) {
  return n % 1 === 0 ? String(n) : n.toFixed(2);
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function InventoryPage() {
  let levels: InventoryStockFull[];
  try {
    levels = await getInventoryStockFull();
  } catch {
    levels = [];
  }

  const alertItems = levels.filter((l) => l.stockStatus !== 'ok');
  const okItems    = levels.filter((l) => l.stockStatus === 'ok');
  const stockValue = levels.reduce((sum, l) => sum + (l.stockValue ?? 0), 0);

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-8">
      <PageHeader
        title="Magazzino"
        subtitle={`${levels.length} ingredienti tracciati`}
        action={
          <Link
            href="/inventory/movement"
            className="px-4 py-2.5 bg-[#1A2B4A] text-white rounded-xl text-sm font-semibold hover:bg-[#243660] transition-colors"
          >
            + Registra movimento
          </Link>
        }
      />

      {/* KPI strip */}
      <div className="grid grid-cols-2 gap-5 sm:grid-cols-4">
        {[
          {
            label: 'Ingredienti',
            value: levels.length,
            color: 'text-[#1A2B4A]',
          },
          {
            label: 'Alert attivi',
            value: alertItems.length,
            color: alertItems.length > 0 ? 'text-[#C0392B]' : 'text-[#27AE60]',
          },
          {
            label: 'Esauriti',
            value: levels.filter((l) => l.stockStatus === 'out_of_stock').length,
            color: levels.some((l) => l.stockStatus === 'out_of_stock') ? 'text-[#C0392B]' : 'text-[#1A2B4A]',
          },
          {
            label: 'Valore stimato',
            value: stockValue > 0 ? formatCurrency(stockValue) : '—',
            color: 'text-[#1A2B4A]',
          },
        ].map(({ label, value, color }) => (
          <div key={label} className="rounded-2xl border border-[#E5DDD0] bg-white px-5 py-4">
            <p className="text-[11px] font-semibold text-[#6B7280] uppercase tracking-wide">{label}</p>
            <p className={`text-2xl font-mono font-semibold mt-1.5 ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* Empty state globale */}
      {levels.length === 0 && (
        <EmptyState
          emoji="📦"
          title="Nessun livello scorta"
          description="I livelli vengono creati automaticamente aggiungendo un ingrediente."
          ctaHref="/ingredients/new"
          ctaLabel="Aggiungi ingrediente"
        />
      )}

      {/* ── Sezione alert ─────────────────────────────────────────────── */}
      {alertItems.length > 0 && (
        <div>
          <h2 className="font-semibold text-sm text-[#6B7280] uppercase tracking-wide mb-3">
            Sotto soglia ({alertItems.length})
          </h2>
          <div className="bg-white rounded-2xl border border-[#E5DDD0] overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-[#FAF7F2] border-b border-[#E5DDD0]">
                <tr>
                  <th className="text-left px-6 py-3 font-semibold text-[#6B7280] text-xs uppercase tracking-wide">Ingrediente</th>
                  <th className="text-right px-6 py-3 font-semibold text-[#6B7280] text-xs uppercase tracking-wide">Scorta</th>
                  <th className="text-right px-6 py-3 font-semibold text-[#6B7280] text-xs uppercase tracking-wide">Soglia</th>
                  <th className="px-6 py-3 font-semibold text-[#6B7280] text-xs uppercase tracking-wide">Livello</th>
                  <th className="text-center px-6 py-3 font-semibold text-[#6B7280] text-xs uppercase tracking-wide">Stato</th>
                  <th className="px-6 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F0EBE1]">
                {alertItems.map((lv) => {
                  const cfg = STATUS_CFG[lv.stockStatus];
                  return (
                    <tr key={lv.ingredientProductId} className={cfg.rowBg}>
                      <td className="px-6 py-3.5">
                        <p className="font-medium text-[#1A2B4A]">{lv.ingredientName}</p>
                        {lv.supplierName && (
                          <p className="text-xs text-[#6B7280] mt-0.5">{lv.supplierName}</p>
                        )}
                      </td>
                      <td className="px-6 py-3.5 text-right font-mono text-[#1A2B4A] font-medium">
                        {formatQty(lv.currentQuantity)}{' '}
                        <span className="text-xs text-[#6B7280] font-sans">{UNIT_LABELS[lv.unit]}</span>
                      </td>
                      <td className="px-6 py-3.5 text-right font-mono text-[#6B7280]">
                        {formatQty(lv.minThreshold)}{' '}
                        <span className="text-xs font-sans">{UNIT_LABELS[lv.unit]}</span>
                      </td>
                      <td className="px-6 py-3.5">
                        <StockBar current={lv.currentQuantity} threshold={lv.minThreshold} status={lv.stockStatus} />
                      </td>
                      <td className="px-6 py-3.5 text-center">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${cfg.badge}`}>
                          {cfg.label}
                        </span>
                      </td>
                      <td className="px-6 py-3.5 text-right">
                        <Link
                          href="/orders/new"
                          className="text-xs font-semibold text-[#C9962A] hover:underline"
                        >
                          Ordina
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Sezione OK ────────────────────────────────────────────────── */}
      {okItems.length > 0 && (
        <div>
          <h2 className="font-semibold text-sm text-[#6B7280] uppercase tracking-wide mb-3">
            Scorte OK ({okItems.length})
          </h2>
          <div className="bg-white rounded-2xl border border-[#E5DDD0] overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-[#FAF7F2] border-b border-[#E5DDD0]">
                <tr>
                  <th className="text-left px-6 py-3 font-semibold text-[#6B7280] text-xs uppercase tracking-wide">Ingrediente</th>
                  <th className="text-right px-6 py-3 font-semibold text-[#6B7280] text-xs uppercase tracking-wide">Scorta</th>
                  <th className="text-right px-6 py-3 font-semibold text-[#6B7280] text-xs uppercase tracking-wide">Soglia</th>
                  <th className="px-6 py-3 font-semibold text-[#6B7280] text-xs uppercase tracking-wide">Livello</th>
                  <th className="text-right px-6 py-3 font-semibold text-[#6B7280] text-xs uppercase tracking-wide">Valore</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F0EBE1]">
                {okItems.map((lv) => (
                  <tr key={lv.ingredientProductId} className="hover:bg-[#FAF7F2] transition-colors">
                    <td className="px-6 py-3.5">
                      <p className="font-medium text-[#1A2B4A]">{lv.ingredientName}</p>
                      {lv.supplierName && (
                        <p className="text-xs text-[#6B7280] mt-0.5">{lv.supplierName}</p>
                      )}
                    </td>
                    <td className="px-6 py-3.5 text-right font-mono text-[#1A2B4A] font-medium">
                      {formatQty(lv.currentQuantity)}{' '}
                      <span className="text-xs text-[#6B7280] font-sans">{UNIT_LABELS[lv.unit]}</span>
                    </td>
                    <td className="px-6 py-3.5 text-right font-mono text-[#6B7280]">
                      {formatQty(lv.minThreshold)}{' '}
                      <span className="text-xs font-sans">{UNIT_LABELS[lv.unit]}</span>
                    </td>
                    <td className="px-6 py-3.5">
                      <StockBar current={lv.currentQuantity} threshold={lv.minThreshold} status="ok" />
                    </td>
                    <td className="px-6 py-3.5 text-right font-mono text-[#6B7280] text-xs">
                      {lv.stockValue !== null ? formatCurrency(lv.stockValue) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Link storico */}
      {levels.length > 0 && (
        <div className="flex justify-end">
          <Link
            href="/inventory/movements"
            className="text-sm font-medium text-[#C9962A] hover:underline"
          >
            Storico movimenti →
          </Link>
        </div>
      )}
    </div>
  );
}
