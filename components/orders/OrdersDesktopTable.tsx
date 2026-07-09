'use client';

// =============================================================================
// <OrdersDesktopTable> — tabella ordini desktop con selezione multipla delle
// BOZZE (grammatica bulk unica: checkbox per riga, "seleziona tutte" sui soli
// visibili, BulkActionBar). Solo le bozze sono selezionabili: sono le uniche
// inviabili. Gli altri stati restano righe di sola lettura.
// =============================================================================

import Link from 'next/link';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { orderStatusBadge } from '@/modules/ordering/status-display';
import { useRowSelection } from '@/lib/hooks/useRowSelection';
import { OrdersBulkSend } from './OrdersBulkSend';
import type { PurchaseOrderListItem } from '@/modules/ordering/types';

function formatDate(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('it-IT', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

function formatCurrency(n: number | null) {
  if (n === null) return '—';
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(n);
}

export function OrdersDesktopTable({ orders }: { orders: PurchaseOrderListItem[] }) {
  const sel = useRowSelection();
  const draftIds = orders.filter((o) => o.status === 'draft').map((o) => o.id);
  const hasDrafts = draftIds.length > 0;
  const selectedDrafts = orders.filter((o) => o.status === 'draft' && sel.has(o.id));

  return (
    <>
      <div className="hidden md:block bg-surface-2 rounded-2xl border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-bg border-b border-border">
            <tr>
              <th className="w-10 px-4 py-3.5">
                {hasDrafts && (
                  <input
                    type="checkbox"
                    checked={sel.allSelected(draftIds)}
                    onChange={() => sel.toggleMany(draftIds)}
                    aria-label="Seleziona tutte le bozze"
                    className="h-4 w-4 rounded border-border accent-primary"
                  />
                )}
              </th>
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
              const isDraft = order.status === 'draft';
              const badge = orderStatusBadge(order.status, order.dispatchOutcome);
              return (
                <tr
                  key={order.id}
                  className={sel.has(order.id) ? 'bg-primary-light/40' : 'hover:bg-surface-offset transition-colors'}
                >
                  <td className="px-4 py-4">
                    {isDraft && (
                      <input
                        type="checkbox"
                        checked={sel.has(order.id)}
                        onChange={() => sel.toggle(order.id)}
                        aria-label={`Seleziona bozza ${order.supplierName}`}
                        className="h-4 w-4 rounded border-border accent-primary"
                      />
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <Link href={`/orders/${order.id}`} className="font-semibold text-ink hover:text-primary">
                      {order.supplierName}
                    </Link>
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
      </div>

      <OrdersBulkSend
        selected={selectedDrafts.map((o) => ({ id: o.id, supplierName: o.supplierName }))}
        onClear={sel.clear}
      />
    </>
  );
}
