// =============================================================================
// app/(main)/inventory/page.tsx
// Magazzino: livelli scorte con progress bars + alert — Server Component.
// Usa getInventoryStockFull per dati arricchiti (status, stockValue).
// =============================================================================

import type { Metadata } from 'next';
import Link from 'next/link';
import { getInventoryStockFull } from '@/modules/reporting/service';
import { UNIT_LABELS, formatCurrency } from '@/lib/utils';
import { buildBulkOrderHref } from '@/lib/priority-tasks';
import type { InventoryStockFull } from '@/modules/reporting/types';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { Badge } from '@/components/ui/Badge';
import { StickyActionBar } from '@/components/ui/StickyActionBar';
import { STOCK_STATUS_BADGE } from '@/lib/status';
import { Warehouse, Factory, AlertTriangle, ShoppingCart } from 'lucide-react';

export const metadata: Metadata = { title: 'Magazzino' };

// ---------------------------------------------------------------------------
// Config badge/colori per status
// ---------------------------------------------------------------------------

// Badge → <Badge variant={STOCK_STATUS_BADGE[...]}> (canonico). Qui restano solo
// il colore della barra e l'eventuale tinta riga (non-badge) + la label.
const STATUS_CFG = {
  negative:     { bar: 'bg-danger',  label: 'Sotto zero', rowBg: 'bg-danger-light' },
  out_of_stock: { bar: 'bg-danger',  label: 'Esaurito', rowBg: 'bg-danger-light' },
  critical:     { bar: 'bg-warning', label: 'Critico',  rowBg: 'bg-warning-light/50' },
  low:          { bar: 'bg-primary', label: 'Basso',    rowBg: 'bg-primary-light' },
  ok:           { bar: 'bg-success', label: 'OK',       rowBg: '' },
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

// Riordino suggerito: riporta la scorta a 2× la soglia (stessa regola della
// dashboard; sempre editabile nel form ordine).
function suggestedReorderQty(lv: InventoryStockFull): number {
  return Math.max(0, Math.round((lv.minThreshold * 2 - lv.currentQuantity) * 1000) / 1000);
}

// ---------------------------------------------------------------------------
// Card mobile: eccezione → azione. Una sola primary action per stato:
// sotto zero → rettifica; sotto soglia → ordina; ok → aggiorna giacenza.
// ---------------------------------------------------------------------------

function MobileStockCard({ lv }: { lv: InventoryStockFull }) {
  const negative = lv.currentQuantity < 0;
  const cfg = STATUS_CFG[negative ? 'negative' : lv.stockStatus];
  const orderable = !negative && lv.stockStatus !== 'ok';
  const qty = suggestedReorderQty(lv);

  const action = negative
    ? { href: `/ingredients/${lv.ingredientProductId}#rettifica`, label: 'Conta e rettifica', primary: true }
    : orderable
    ? { href: `/orders/new?ingredient=${lv.ingredientProductId}${qty > 0 ? `&qty=${qty}` : ''}`, label: 'Ordina', primary: true }
    : { href: `/ingredients/${lv.ingredientProductId}#rettifica`, label: 'Aggiorna giacenza', primary: false };

  return (
    <div className={`rounded-2xl border p-4 space-y-2.5 ${negative ? 'border-danger-soft bg-danger-light/40' : 'border-border bg-surface-2'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-md font-semibold text-ink truncate">
            {lv.ingredientName}
            {!lv.isActive && (
              <Badge variant="neutral" size="sm" className="ml-2 align-middle">Disattivato</Badge>
            )}
          </p>
          {lv.supplierName && <p className="text-xs text-ink-muted mt-0.5 truncate">{lv.supplierName}</p>}
        </div>
        <Badge variant={negative ? 'danger' : STOCK_STATUS_BADGE[lv.stockStatus]} size="sm" className="shrink-0">
          {cfg.label}
        </Badge>
      </div>
      <p className="text-sm text-ink-muted">
        Scorta{' '}
        <span className={`font-mono font-semibold ${negative ? 'text-danger' : 'text-ink'}`}>
          {formatQty(lv.currentQuantity)} {UNIT_LABELS[lv.unit]}
        </span>
        {' · '}soglia <span className="font-mono">{formatQty(lv.minThreshold)} {UNIT_LABELS[lv.unit]}</span>
        {lv.unitPrice !== null && (
          <> · <span className="font-mono">{formatCurrency(lv.unitPrice)}/{UNIT_LABELS[lv.unit]}</span></>
        )}
      </p>
      <Link
        href={action.href}
        className={
          action.primary
            ? 'flex items-center justify-center h-11 w-full rounded-xl bg-primary text-primary-fg text-sm font-semibold hover:bg-primary-hover transition-colors'
            : 'flex items-center justify-center h-11 w-full rounded-xl border border-border text-sm font-semibold text-ink hover:bg-surface-offset transition-colors'
        }
      >
        {action.label}
      </Link>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: { vista?: string };
}) {
  // Errore DB → error boundary del route group: meglio un errore esplicito
  // che un magazzino mostrato (falsamente) vuoto.
  const levels: InventoryStockFull[] = await getInventoryStockFull();

  // Giacenza NEGATIVA (sotto zero) = eccezione operativa distinta da "esaurito" (=0):
  // una vendita/scarico ha superato il carico registrato. Va isolata e resa visibile
  // (audit R5), non confusa con un semplice esaurimento.
  const negativeItems = levels.filter((l) => l.currentQuantity < 0);
  const alertItems = levels.filter((l) => l.stockStatus !== 'ok' && l.currentQuantity >= 0);
  const okItems    = levels.filter((l) => l.stockStatus === 'ok');
  const stockValue = levels.reduce((sum, l) => sum + (l.stockValue ?? 0), 0);
  // Coerenza catalogo↔magazzino: il catalogo mostra solo gli attivi. Qui restano
  // visibili anche i disattivati con giacenza residua, ma marcati (non spariscono).
  const archivedCount = levels.filter((l) => !l.isActive).length;

  // ── Vista mobile: ECCEZIONI prima di tutto (default = Critici + Attenzione) ──
  const vista = searchParams.vista; // undefined | 'critici' | 'attenzione' | 'tutti'
  const criticiItems = [
    ...negativeItems,
    ...alertItems.filter((l) => l.stockStatus === 'out_of_stock' || l.stockStatus === 'critical'),
  ];
  const attenzioneItems = alertItems.filter((l) => l.stockStatus === 'low');
  const showCritici = vista === undefined || vista === 'critici' || vista === 'tutti';
  const showAttenzione = vista === undefined || vista === 'attenzione' || vista === 'tutti';
  const showOk = vista === 'tutti';
  // "Ordina tutti i mancanti": bozza prefillata con gli alert ordinabili (link
  // centralizzato in lib/priority-tasks, stesso della dashboard).
  const bulkOrderHref = buildBulkOrderHref(
    alertItems.map((l) => ({ ingredientProductId: l.ingredientProductId, suggestedQty: suggestedReorderQty(l) })),
  );

  const chips = [
    { key: 'critici',    label: 'Critici',    count: criticiItems.length,    active: showCritici && vista !== 'tutti' },
    { key: 'attenzione', label: 'Attenzione', count: attenzioneItems.length, active: showAttenzione && vista !== 'tutti' },
    { key: 'tutti',      label: 'Tutti',      count: levels.length,          active: vista === 'tutti' },
  ] as const;

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto space-y-6 lg:space-y-8">
      <PageHeader
        title="Magazzino"
        subtitle={
          archivedCount > 0
            ? `${levels.length} ingredienti tracciati · ${archivedCount} disattivat${archivedCount === 1 ? 'o' : 'i'} con giacenza`
            : `${levels.length} ingredienti tracciati`
        }
        action={
          // Mobile: i due CTA si impilano (il PageHeader tiene azioni e titolo
          // sulla stessa riga non-wrappabile → due bottoni larghi sforerebbero).
          // Da sm in su torna identico al layout desktop (riga affiancata).
          <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
            <Link
              href="/production/quick"
              className="px-4 py-2.5 bg-surface-2 text-ink border border-border rounded-xl text-sm font-semibold hover:bg-surface-offset transition-colors text-center whitespace-nowrap"
            >
              <Factory size={15} className="inline-block mr-1.5 -mt-0.5" aria-hidden="true" /> Scarica per ricetta
            </Link>
            <Link
              href="/inventory/movement"
              className="px-4 py-2.5 bg-primary text-primary-fg rounded-xl text-sm font-semibold hover:bg-primary-hover transition-colors text-center whitespace-nowrap"
            >
              + Registra movimento
            </Link>
          </div>
        }
      />

      {/* KPI strip (desktop: su mobile i conteggi vivono nei filtri qui sotto) */}
      <div className="hidden md:grid grid-cols-2 gap-5 md:grid-cols-4">
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
          // Quando c'è giacenza sotto zero la mostriamo qui (più urgente di "esaurito").
          negativeItems.length > 0
            ? { label: 'Sotto zero', value: negativeItems.length, color: 'text-danger' }
            : {
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

      {/* ── Banner giacenza sotto zero (eccezione operativa, audit R5) ──── */}
      {negativeItems.length > 0 && (
        <div className="rounded-2xl border border-danger-soft bg-danger-light p-4 flex items-start gap-3">
          <AlertTriangle className="size-5 text-danger shrink-0 mt-0.5" aria-hidden="true" />
          <div className="min-w-0">
            <p className="font-semibold text-danger">
              {negativeItems.length} ingredient{negativeItems.length === 1 ? 'e' : 'i'} sotto zero
            </p>
            <p className="text-sm text-ink-muted mt-0.5">
              Il magazzino mostra una giacenza <strong>negativa</strong>: una vendita o uno scarico ha superato il
              carico registrato. Conta la giacenza reale e <strong>rettifica</strong> per riallineare.
            </p>
          </div>
        </div>
      )}

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

      {/* ═══ MOBILE: eccezioni → azione (card, mai tabelle) ═══════════════ */}
      {levels.length > 0 && (
        <div className="md:hidden space-y-5">
          {/* Filtri grandi con conteggio (default: Critici + Attenzione) */}
          <div className="flex gap-2" role="group" aria-label="Filtra scorte">
            {chips.map((c) => (
              <Link
                key={c.key}
                href={c.key === 'tutti' ? '/inventory?vista=tutti' : vista === c.key ? '/inventory' : `/inventory?vista=${c.key}`}
                className={`flex-1 flex items-center justify-center gap-1.5 min-h-[44px] rounded-xl border text-sm font-semibold transition-colors ${
                  c.active
                    ? 'border-primary-soft bg-primary-light text-primary'
                    : 'border-border bg-surface-2 text-ink-muted'
                }`}
              >
                {c.label}
                <span className="font-mono text-xs">{c.count}</span>
              </Link>
            ))}
          </div>

          {showCritici && criticiItems.length > 0 && (
            <div className="space-y-3">
              <h2 className="font-semibold text-sm text-danger uppercase tracking-wide flex items-center gap-1.5">
                <AlertTriangle className="size-4" aria-hidden="true" /> Critici ({criticiItems.length})
              </h2>
              {criticiItems.map((lv) => <MobileStockCard key={lv.ingredientProductId} lv={lv} />)}
            </div>
          )}

          {showAttenzione && attenzioneItems.length > 0 && (
            <div className="space-y-3">
              <h2 className="font-semibold text-sm text-warning-strong uppercase tracking-wide">
                Attenzione ({attenzioneItems.length})
              </h2>
              {attenzioneItems.map((lv) => <MobileStockCard key={lv.ingredientProductId} lv={lv} />)}
            </div>
          )}

          {showCritici && showAttenzione && criticiItems.length === 0 && attenzioneItems.length === 0 && (
            <p className="rounded-2xl border border-border bg-surface-2 px-5 py-6 text-sm text-ink-muted text-center">
              Tutte le scorte sono sopra soglia. ✓
            </p>
          )}

          {showOk ? (
            okItems.length > 0 && (
              <div className="space-y-3">
                <h2 className="font-semibold text-sm text-ink-muted uppercase tracking-wide">
                  Scorte OK ({okItems.length})
                </h2>
                {okItems.map((lv) => <MobileStockCard key={lv.ingredientProductId} lv={lv} />)}
              </div>
            )
          ) : (
            okItems.length > 0 && (
              <Link
                href="/inventory?vista=tutti"
                className="flex items-center justify-center min-h-[44px] text-sm font-semibold text-primary hover:underline"
              >
                Mostra anche le {okItems.length} scorte OK →
              </Link>
            )
          )}

          {/* Quick action sticky: risolvi TUTTE le mancanze in un tap. */}
          {alertItems.length > 0 && (
            <StickyActionBar>
              <Link
                href={bulkOrderHref}
                className="flex items-center justify-center gap-2 h-12 w-full rounded-xl bg-primary text-primary-fg text-sm font-semibold hover:bg-primary-hover transition-colors"
              >
                <ShoppingCart size={16} aria-hidden="true" />
                Ordina tutti i mancanti ({alertItems.length})
              </Link>
            </StickyActionBar>
          )}
        </div>
      )}

      {/* ── Sezione SOTTO ZERO (eccezione urgente, in cima) ─────────────── */}
      {negativeItems.length > 0 && (
        <div className="hidden md:block">
          <h2 className="font-semibold text-sm text-danger uppercase tracking-wide mb-3 flex items-center gap-1.5">
            <AlertTriangle className="size-4" aria-hidden="true" /> Sotto zero ({negativeItems.length})
          </h2>
          <div className="bg-surface-2 rounded-2xl border border-danger-soft overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-bg border-b border-border">
                <tr>
                  <th className="text-left px-6 py-3 font-semibold text-ink-muted text-xs uppercase tracking-wide">Ingrediente</th>
                  <th className="text-right px-6 py-3 font-semibold text-ink-muted text-xs uppercase tracking-wide">Scorta</th>
                  <th className="text-right px-6 py-3 font-semibold text-ink-muted text-xs uppercase tracking-wide">Soglia</th>
                  <th className="text-center px-6 py-3 font-semibold text-ink-muted text-xs uppercase tracking-wide">Stato</th>
                  <th className="px-6 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-divider">
                {negativeItems.map((lv) => (
                  <tr key={lv.ingredientProductId} className="bg-danger-light">
                    <td className="px-6 py-3.5">
                      <p className="font-medium text-ink">
                        {lv.ingredientName}
                        {!lv.isActive && (
                          <Badge variant="neutral" size="sm" className="ml-2 align-middle">Disattivato</Badge>
                        )}
                      </p>
                      {lv.supplierName && <p className="text-xs text-ink-muted mt-0.5">{lv.supplierName}</p>}
                    </td>
                    <td className="px-6 py-3.5 text-right font-mono font-semibold text-danger">
                      {formatQty(lv.currentQuantity)}{' '}
                      <span className="text-xs font-sans">{UNIT_LABELS[lv.unit]}</span>
                    </td>
                    <td className="px-6 py-3.5 text-right font-mono text-ink-muted">
                      {formatQty(lv.minThreshold)}{' '}
                      <span className="text-xs font-sans">{UNIT_LABELS[lv.unit]}</span>
                    </td>
                    <td className="px-6 py-3.5 text-center">
                      <Badge variant="danger" size="sm">Sotto zero</Badge>
                    </td>
                    <td className="px-6 py-3.5 text-right">
                      {/* Alert → correzione contestuale: porta dritto al pannello rettifica del prodotto. */}
                      <Link
                        href={`/ingredients/${lv.ingredientProductId}#rettifica`}
                        className="text-xs font-semibold text-primary hover:underline whitespace-nowrap"
                      >
                        Conta e rettifica
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Sezione alert ─────────────────────────────────────────────── */}
      {alertItems.length > 0 && (
        <div className="hidden md:block">
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
                          <Badge variant="neutral" size="sm" className="ml-2 align-middle">
                            Disattivato
                          </Badge>
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
                        <Badge variant={STOCK_STATUS_BADGE[lv.stockStatus]} size="sm">
                          {cfg.label}
                        </Badge>
                      </td>
                      <td className="px-6 py-3.5 text-right">
                        {/* Prefill ingrediente + quantità suggerita (stessa regola della dashboard). */}
                        <Link
                          href={`/orders/new?ingredient=${lv.ingredientProductId}${suggestedReorderQty(lv) > 0 ? `&qty=${suggestedReorderQty(lv)}` : ''}`}
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
        <div className="hidden md:block">
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
                          <Badge variant="neutral" size="sm" className="ml-2 align-middle">
                            Disattivato
                          </Badge>
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
