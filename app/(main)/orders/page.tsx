// =============================================================================
// app/(main)/orders/page.tsx
// Lista ordini d'acquisto — Server Component.
// =============================================================================

import type { Metadata } from 'next';
import Link from 'next/link';
import { listOrders } from '@/modules/ordering/service';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { OrdersMobileList } from '@/components/orders/OrdersMobileList';
import { OrdersDesktopTable } from '@/components/orders/OrdersDesktopTable';
import { ShoppingCart } from 'lucide-react';

export const metadata: Metadata = { title: 'Ordini' };

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

          {/* Desktop: tabella con selezione multipla delle bozze per invio in blocco. */}
          <OrdersDesktopTable orders={orders} />
        </>
      )}
    </div>
  );
}
