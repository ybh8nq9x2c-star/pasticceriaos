// =============================================================================
// app/(main)/orders/page.tsx
// Lista ordini d'acquisto — Server Component.
// =============================================================================

import type { Metadata } from 'next';
import Link from 'next/link';
import { listOrders } from '@/modules/ordering/service';
import { orderStatusBadge } from '@/modules/ordering/status-display';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { OrdersMobileList } from '@/components/orders/OrdersMobileList';
import { ShoppingCart } from 'lucide-react';

export const metadata: Metadata = { title: 'Ordini' };

function formatDate(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('it-IT', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

function formatCurrency(n: number | null) {
  if (n === null) return '—';
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(n);
}

export default async function OrdersPage() {
  const orders = await listOrders();

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto">
      <PageHeader
        title="Ordini d'acquisto"
        subtitle={`${orders.length} ordine/i`}
        action={
          <Link
            href="/orders/new"
            className="px-4 py-2.5 bg-primary text-primary-fg rounded-xl text-sm font-semibold hover:bg-primary-hover transition-colors"
          >
            + Nuovo ordine
          </Link>
        }
      />

      {orders.length === 0 ? (
        <EmptyState
          icon={ShoppingCart}
          title="Nessun ordine d'acquisto"
          description="Crea ordini per rifornire il magazzino dagli ingredienti."
          ctaHref="/orders/new"
          ctaLabel="Crea ordine"
        />
      ) : (
        <>
          {/* Mobile: card azionabili, default "da gestire", storico collassato. */}
          <div className="md:hidden">
            <OrdersMobileList orders={orders} />
          </div>

          {/* Desktop: tabella invariata. */}
          <div className="hidden md:block bg-surface-2 rounded-2xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-bg border-b border-border">
              <tr>
                <th className="text-left px-6 py-3.5 font-semibold text-ink-muted text-xs uppercase tracking-wide">Fornitore</th>
                <th className="text-left px-6 py-3.5 font-semibold text-ink-muted text-xs uppercase tracking-wide">Data ordine</th>
                <th className="text-left px-6 py-3.5 font-semibold text-ink-muted text-xs uppercase tracking-wide">Consegna prevista</th>
                <th className="text-center px-6 py-3.5 font-semibold text-ink-muted text-xs uppercase tracking-wide">Stato</th>
                <th className="text-right px-6 py-3.5 font-semibold text-ink-muted text-xs uppercase tracking-wide">Righe</th>
                <th className="text-right px-6 py-3.5 font-semibold text-ink-muted text-xs uppercase tracking-wide">Totale</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-divider">
              {orders.map((order) => (
                <tr key={order.id} className="hover:bg-surface-offset transition-colors">
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
                    {(() => {
                      const badge = orderStatusBadge(order.status, order.dispatchOutcome);
                      return <StatusBadge label={badge.label} variant={badge.variant} />;
                    })()}
                  </td>
                  <td className="px-6 py-4 text-right text-ink-muted font-mono">{order.lineItemsCount}</td>
                  <td className="px-6 py-4 text-right font-mono font-medium text-ink">
                    {formatCurrency(order.totalAmount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </>
      )}
    </div>
  );
}
