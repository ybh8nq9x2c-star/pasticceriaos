'use client';

// =============================================================================
// <OrdersDesktopTable> — tabella ordini desktop TASK-FIRST (stessa verità del
// mobile): "Da gestire" (bozze/inviati/parziali) in evidenza, storico
// (ricevuti/annullati) collassato di default. Selezione multipla solo sulle
// bozze email (grammatica bulk unica); le bozze verso fornitori collegati si
// convertono dal dettaglio, non si inviano.
// =============================================================================

import Link from 'next/link';
import { ChevronDown } from 'lucide-react';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { SupplierChannelBadge } from '@/components/suppliers/SupplierChannelBadge';
import { orderChannel } from '@/lib/supplier-channel';
import { orderStatusBadge } from '@/modules/ordering/status-display';
import { useRowSelection, type RowSelection } from '@/lib/hooks/useRowSelection';
import { OrdersBulkSend } from './OrdersBulkSend';
import type { PurchaseOrderListItem, OrderStatus } from '@/modules/ordering/types';

const OPEN_STATUSES: OrderStatus[] = ['draft', 'sent', 'confirmed', 'partial'];

function formatDate(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('it-IT', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

function formatCurrency(n: number | null) {
  if (n === null) return '—';
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(n);
}

function OrdersTable({
  orders,
  sel,
  sendableDraft,
  draftIds,
  withSelection,
}: {
  orders: PurchaseOrderListItem[];
  sel: RowSelection;
  sendableDraft: (o: PurchaseOrderListItem) => boolean;
  draftIds: string[];
  /** Colonna checkbox solo dove serve (sezione "da gestire"). */
  withSelection: boolean;
}) {
  return (
    <table className="w-full text-sm">
      <thead className="bg-bg border-b border-border">
        <tr>
          {withSelection && (
            <th className="w-10 px-4 py-3.5">
              {draftIds.length > 0 && (
                <input
                  type="checkbox"
                  checked={sel.allSelected(draftIds)}
                  onChange={() => sel.toggleMany(draftIds)}
                  aria-label="Seleziona tutte le bozze"
                  className="h-4 w-4 rounded border-border accent-primary"
                />
              )}
            </th>
          )}
          <th className="text-left px-6 py-3.5 font-semibold text-ink-muted text-xs uppercase tracking-wide">Fornitore</th>
          <th className="text-left px-6 py-3.5 font-semibold text-ink-muted text-xs uppercase tracking-wide">Data ordine</th>
          <th className="text-left px-6 py-3.5 font-semibold text-ink-muted text-xs uppercase tracking-wide">Consegna prevista</th>
          <th className="text-center px-6 py-3.5 font-semibold text-ink-muted text-xs uppercase tracking-wide">Stato</th>
          <th className="text-right px-6 py-3.5 font-semibold text-ink-muted text-xs uppercase tracking-wide">Righe</th>
          <th className="text-right px-6 py-3.5 font-semibold text-ink-muted text-xs uppercase tracking-wide">Totale</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-divider">
        {orders.map((order) => {
          const isSendableDraft = withSelection && sendableDraft(order);
          const badge = orderStatusBadge(order.status, order.dispatchOutcome);
          return (
            <tr
              key={order.id}
              className={sel.has(order.id) ? 'bg-primary-light/40' : 'hover:bg-surface-offset transition-colors'}
            >
              {withSelection && (
                <td className="px-4 py-4">
                  {isSendableDraft && (
                    <input
                      type="checkbox"
                      checked={sel.has(order.id)}
                      onChange={() => sel.toggle(order.id)}
                      aria-label={`Seleziona bozza ${order.supplierName}`}
                      className="h-4 w-4 rounded border-border accent-primary"
                    />
                  )}
                </td>
              )}
              <td className="px-6 py-4">
                <Link href={`/orders/${order.id}`} className="font-semibold text-ink hover:text-primary">
                  {order.supplierName}
                </Link>
                <div className="mt-1">
                  <SupplierChannelBadge channel={orderChannel(order.marketplaceOrderId)} />
                </div>
              </td>
              <td className="px-6 py-4 text-ink-muted font-mono text-xs">{formatDate(order.orderDate)}</td>
              <td className="px-6 py-4 text-ink-muted font-mono text-xs">
                {order.expectedDate ? formatDate(order.expectedDate) : '—'}
              </td>
              <td className="px-6 py-4 text-center">
                <StatusBadge label={badge.label} variant={badge.variant} />
              </td>
              <td className="px-6 py-4 text-right text-ink-muted font-mono">{order.lineItemsCount}</td>
              <td className="px-6 py-4 text-right font-mono font-medium text-ink">
                {formatCurrency(order.totalAmount)}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export function OrdersDesktopTable({
  orders,
  connectedSupplierIds = [],
}: {
  orders: PurchaseOrderListItem[];
  /** Fornitori collegati a BakeryOS: le loro bozze si CONVERTONO, non si inviano via email. */
  connectedSupplierIds?: string[];
}) {
  const sel = useRowSelection();
  const connected = new Set(connectedSupplierIds);
  // Selezionabili per invio email massivo: SOLO bozze di fornitori non collegati.
  const sendableDraft = (o: PurchaseOrderListItem) => o.status === 'draft' && !connected.has(o.supplierId);

  const open = orders.filter((o) => OPEN_STATUSES.includes(o.status));
  const closed = orders.filter((o) => !OPEN_STATUSES.includes(o.status));

  const draftIds = open.filter(sendableDraft).map((o) => o.id);
  const selectedDrafts = open.filter((o) => sendableDraft(o) && sel.has(o.id));

  return (
    <div className="hidden md:block space-y-4">
      {/* ── Da gestire: le uniche righe che richiedono un'azione ─────────────── */}
      {open.length === 0 ? (
        <p className="rounded-2xl border border-border bg-surface-2 px-6 py-8 text-sm text-ink-muted text-center">
          Nessun ordine da gestire. ✓
        </p>
      ) : (
        <div className="bg-surface-2 rounded-2xl border border-border overflow-hidden">
          <OrdersTable orders={open} sel={sel} sendableDraft={sendableDraft} draftIds={draftIds} withSelection />
        </div>
      )}

      {/* ── Storico: collassato, stessa convenzione del mobile ───────────────── */}
      {closed.length > 0 && (
        <details className="group rounded-2xl border border-border bg-surface-2 overflow-hidden">
          <summary className="flex items-center justify-between min-h-[48px] px-6 cursor-pointer list-none select-none [&::-webkit-details-marker]:hidden">
            <span className="text-sm font-semibold text-ink-muted uppercase tracking-wide">
              Storico ({closed.length})
            </span>
            <ChevronDown size={16} aria-hidden="true" className="text-ink-faint transition-transform group-open:rotate-180" />
          </summary>
          <div className="border-t border-divider">
            <OrdersTable orders={closed} sel={sel} sendableDraft={sendableDraft} draftIds={[]} withSelection={false} />
          </div>
        </details>
      )}

      <OrdersBulkSend
        selected={selectedDrafts.map((o) => ({ id: o.id, supplierName: o.supplierName }))}
        onClear={sel.clear}
      />
    </div>
  );
}
