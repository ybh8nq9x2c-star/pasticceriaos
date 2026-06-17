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
import { Warehouse } from 'lucide-react';

export const metadata: Metadata = { title: 'Magazzino' };

// ---------------------------------------------------------------------------
// Config badge/colori per status
// ---------------------------------------------------------------------------

const STATUS_CFG = {
  out_of_stock: {
    bar:   'bg-danger',
    badge: 'bg-danger-light text-danger',
    label: 'Esaurito',
    rowBg: 'bg-danger-light',
  },
  critical: {
    bar:   'bg-warning',
    badge: 'bg-amber-100 text-amber-700',
    label: 'Critico',
    rowBg: 'bg-amber-50/50',
  },
  low: {
    bar:   'bg-primary',
    badge: 'bg-primary-light text-primary-hover',
    label: 'Basso',
    rowBg: 'bg-primary-light',
  },
  ok: {
    bar:   'bg-success',
    badge: 'bg-success-light text-success-strong',
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
      <div className="w-20 h-1.5 bg-surface-offset rounded-full overflow-hidden shrink-0">
        <div
          className={`h-full rounded-full transition-all ${cfg.bar}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs font-mono text-ink-muted">{pct.toFixed(0)}%</span>
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
  // Errore DB → error boundary del route group: meglio un errore esplicito
  // che un magazzino mostrato (falsamente) vuoto.
  const levels: InventoryStockFull[] = await getInventoryStockFull();

  const alertItems = levels.filter((l) => l.stockStatus !== 'ok');
  const okItems    = levels.filter((l) => l.stockStatus === 'ok');
  const stockValue = levels.reduce((sum, l) => sum + (l.stockValue ?? 0), 0);
  // Coerenza catalogo↔magazzino: il catalogo mostra solo gli attivi. Qui restano
  // visibili anche i disattivati con giacenza residua, ma marcati (non spariscono).
  const archivedCount = levels.filter((l) => !l.isActive).length;

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-8">
      <PageHeader
        title="Magazzino"
        subtitle={
          archivedCount > 0
            ? `${levels.length} ingredienti tracciati · ${archivedCount} disattivat${archivedCount === 1 ? 'o' : 'i'} con giacenza`
            : `${levels.length} ingredienti tracciati`
        }
        action={
          <div className="flex items-center gap-2">
            <Link
              href="/production/quick"
              className="px-4 py-2.5 bg-surface-2 text-ink border border-border rounded-xl text-sm font-semibold hover:bg-surface-offset transition-colors"
            >
              🏭 Scarica per ricetta
            </Link>
            <Link
              href="/inventory/movement"
              className="px-4 py-2.5 bg-primary text-primary-fg rounded-xl text-sm font-semibold hover:bg-primary-hover transition-colors"
            >
              + Registra movimento
            </Link>
          </div>
        }
      />

      {/* KPI strip */}
      <div className="grid grid-cols-2 gap-5 sm:grid-cols-4">
        {[
          {
            label: 'Ingredienti',
            value: levels.length,
            color: 'text-ink',
          },
          {
            label: 'Alert attivi',
            value: alertItems.length,
            color: alertItems.length > 0 ? 'text-danger' : 'text-success-strong',
          },
          {
            label: 'Esauriti',
            value: levels.filter((l) => l.stockStatus === 'out_of_stock').length,
            color: levels.some((l) => l.stockStatus === 'out_of_stock') ? 'text-danger' : 'text-ink',
          },
          {
            label: 'Valore stimato',
            value: stockValue > 0 ? formatCurrency(stockValue) : '—',
            color: 'text-ink',
          },
        ].map(({ label, value, color }) => (
          <div key={label} className="rounded-2xl border border-border bg-surface-2 px-5 py-4">
            <p className="text-xs font-semibold text-ink-muted uppercase tracking-wide">{label}</p>
            <p className={`text-2xl font-mono font-semibold mt-1.5 ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* Empty state globale */}
      {levels.length === 0 && (
        <EmptyState
          icon={Warehouse}
          title="Nessun livello scorta"
          description="I livelli vengono creati automaticamente aggiungendo un ingrediente."
          ctaHref="/ingredients/new"
          ctaLabel="Aggiungi ingrediente"
        />
      )}

      {/* ── Sezione alert ─────────────────────────────────────────────── */}
      {alertItems.length > 0 && (
        <div>
          <h2 className="font-semibold text-sm text-ink-muted uppercase tracking-wide mb-3">
            Sotto soglia ({alertItems.length})
          </h2>
          <div className="bg-surface-2 rounded-2xl border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-bg border-b border-border">
                <tr>
                  <th className="text-left px-6 py-3 font-semibold text-ink-muted text-xs uppercase tracking-wide">Ingrediente</th>
                  <th className="text-right px-6 py-3 font-semibold text-ink-muted text-xs uppercase tracking-wide">Scorta</th>
                  <th className="text-right px-6 py-3 font-semibold text-ink-muted text-xs uppercase tracking-wide">Soglia</th>
                  <th className="px-6 py-3 font-semibold text-ink-muted text-xs uppercase tracking-wide">Livello</th>
                  <th className="text-center px-6 py-3 font-semibold text-ink-muted text-xs uppercase tracking-wide">Stato</th>
                  <th className="px-6 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-divider">
                {alertItems.map((lv) => {
                  const cfg = STATUS_CFG[lv.stockStatus];
                  return (
                    <tr key={lv.ingredientProductId} className={cfg.rowBg}>
                      <td className="px-6 py-3.5">
                        <p className="font-medium text-ink">
                        {lv.ingredientName}
                        {!lv.isActive && (
                          <span className="ml-2 inline-flex items-center rounded-full bg-neutral-light px-2 py-0.5 text-[11px] font-semibold text-ink-muted align-middle">
                            Disattivato
                          </span>
                        )}
                      </p>
                        {lv.supplierName && (
                          <p className="text-xs text-ink-muted mt-0.5">{lv.supplierName}</p>
                        )}
                      </td>
                      <td className="px-6 py-3.5 text-right font-mono text-ink font-medium">
                        {formatQty(lv.currentQuantity)}{' '}
                        <span className="text-xs text-ink-muted font-sans">{UNIT_LABELS[lv.unit]}</span>
                      </td>
                      <td className="px-6 py-3.5 text-right font-mono text-ink-muted">
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
                          className="text-xs font-semibold text-primary hover:underline"
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
          <h2 className="font-semibold text-sm text-ink-muted uppercase tracking-wide mb-3">
            Scorte OK ({okItems.length})
          </h2>
          <div className="bg-surface-2 rounded-2xl border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-bg border-b border-border">
                <tr>
                  <th className="text-left px-6 py-3 font-semibold text-ink-muted text-xs uppercase tracking-wide">Ingrediente</th>
                  <th className="text-right px-6 py-3 font-semibold text-ink-muted text-xs uppercase tracking-wide">Scorta</th>
                  <th className="text-right px-6 py-3 font-semibold text-ink-muted text-xs uppercase tracking-wide">Soglia</th>
                  <th className="px-6 py-3 font-semibold text-ink-muted text-xs uppercase tracking-wide">Livello</th>
                  <th className="text-right px-6 py-3 font-semibold text-ink-muted text-xs uppercase tracking-wide">Valore</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-divider">
                {okItems.map((lv) => (
                  <tr key={lv.ingredientProductId} className="hover:bg-surface-offset transition-colors">
                    <td className="px-6 py-3.5">
                      <p className="font-medium text-ink">
                        {lv.ingredientName}
                        {!lv.isActive && (
                          <span className="ml-2 inline-flex items-center rounded-full bg-neutral-light px-2 py-0.5 text-[11px] font-semibold text-ink-muted align-middle">
                            Disattivato
                          </span>
                        )}
                      </p>
                      {lv.supplierName && (
                        <p className="text-xs text-ink-muted mt-0.5">{lv.supplierName}</p>
                      )}
                    </td>
                    <td className="px-6 py-3.5 text-right font-mono text-ink font-medium">
                      {formatQty(lv.currentQuantity)}{' '}
                      <span className="text-xs text-ink-muted font-sans">{UNIT_LABELS[lv.unit]}</span>
                    </td>
                    <td className="px-6 py-3.5 text-right font-mono text-ink-muted">
                      {formatQty(lv.minThreshold)}{' '}
                      <span className="text-xs font-sans">{UNIT_LABELS[lv.unit]}</span>
                    </td>
                    <td className="px-6 py-3.5">
                      <StockBar current={lv.currentQuantity} threshold={lv.minThreshold} status="ok" />
                    </td>
                    <td className="px-6 py-3.5 text-right font-mono text-ink-muted text-xs">
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
            className="text-sm font-medium text-primary hover:underline"
          >
            Storico movimenti →
          </Link>
        </div>
      )}
    </div>
  );
}
