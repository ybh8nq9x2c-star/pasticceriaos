// =============================================================================
// app/(main)/orders/page.tsx
// Lista ordini d'acquisto — Server Component.
// =============================================================================

import type { Metadata } from 'next';
import Link from 'next/link';
import { listOrders } from '@/modules/ordering/service';
import type { OrderStatus } from '@/modules/ordering/types';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { StatusBadge } from '@/components/ui/StatusBadge';

export const metadata: Metadata = { title: 'Ordini' };

const STATUS_VARIANT: Record<OrderStatus, 'gray' | 'blue' | 'indigo' | 'green' | 'red'> = {
  draft:     'gray',
  sent:      'blue',
  confirmed: 'indigo',
  received:  'green',
  cancelled: 'red',
};

const STATUS_LABELS: Record<OrderStatus, string> = {
  draft:     'Bozza',
  sent:      'Inviato',
  confirmed: 'Confermato',
  received:  'Ricevuto',
  cancelled: 'Annullato',
};

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
    <div className="p-8 max-w-5xl mx-auto">
      <PageHeader
        title="Ordini d'acquisto"
        subtitle={`${orders.length} ordine/i`}
        action={
          <Link
            href="/orders/new"
            className="px-4 py-2.5 bg-[#1A2B4A] text-white rounded-xl text-sm font-semibold hover:bg-[#243660] transition-colors"
          >
            + Nuovo ordine
          </Link>
        }
      />

      {orders.length === 0 ? (
        <EmptyState
          emoji="🛒"
          title="Nessun ordine d'acquisto"
          description="Crea ordini per rifornire il magazzino dagli ingredienti."
          ctaHref="/orders/new"
          ctaLabel="Crea ordine"
        />
      ) : (
        <div className="bg-white rounded-2xl border border-[#E5DDD0] overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-[#FAF7F2] border-b border-[#E5DDD0]">
              <tr>
                <th className="text-left px-6 py-3.5 font-semibold text-[#6B7280] text-xs uppercase tracking-wide">Fornitore</th>
                <th className="text-left px-6 py-3.5 font-semibold text-[#6B7280] text-xs uppercase tracking-wide">Data ordine</th>
                <th className="text-left px-6 py-3.5 font-semibold text-[#6B7280] text-xs uppercase tracking-wide">Consegna prevista</th>
                <th className="text-center px-6 py-3.5 font-semibold text-[#6B7280] text-xs uppercase tracking-wide">Stato</th>
                <th className="text-right px-6 py-3.5 font-semibold text-[#6B7280] text-xs uppercase tracking-wide">Righe</th>
                <th className="text-right px-6 py-3.5 font-semibold text-[#6B7280] text-xs uppercase tracking-wide">Totale</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F0EBE1]">
              {orders.map((order) => (
                <tr key={order.id} className="hover:bg-[#FAF7F2] transition-colors">
                  <td className="px-6 py-4">
                    <Link href={`/orders/${order.id}`} className="font-semibold text-[#1A2B4A] hover:text-[#C9962A]">
                      {order.supplierName}
                    </Link>
                  </td>
                  <td className="px-6 py-4 text-[#6B7280] font-mono text-xs">{formatDate(order.orderDate)}</td>
                  <td className="px-6 py-4 text-[#6B7280] font-mono text-xs">
                    {order.expectedDate ? formatDate(order.expectedDate) : '—'}
                  </td>
                  <td className="px-6 py-4 text-center">
                    <StatusBadge label={STATUS_LABELS[order.status]} variant={STATUS_VARIANT[order.status]} />
                  </td>
                  <td className="px-6 py-4 text-right text-[#6B7280] font-mono">{order.lineItemsCount}</td>
                  <td className="px-6 py-4 text-right font-mono font-medium text-[#1A2B4A]">
                    {formatCurrency(order.totalAmount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
