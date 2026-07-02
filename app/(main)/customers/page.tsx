// =============================================================================
// app/(main)/customers/page.tsx
// Ordini clienti: prenotazioni con data ritiro, integrate nel piano produzione.
// =============================================================================

import type { Metadata } from 'next';
import Link from 'next/link';
import { listCustomerOrders } from '@/modules/customers/service';
import { CUSTOMER_ORDER_STATUS_LABELS, CUSTOMER_ORDER_TRANSITIONS } from '@/modules/customers/types';
import { changeCustomerOrderStatusAction } from '@/modules/customers/actions';
import { formatCurrency, IDLE_STATE } from '@/lib/utils';
import { PageHeader } from '@/components/ui/PageHeader';
import type { CustomerOrderStatus } from '@/lib/database.types';

export const metadata: Metadata = { title: 'Ordini clienti' };

const STATUS_BADGE: Record<CustomerOrderStatus, string> = {
  pending:       'bg-primary-light text-primary-hover',
  confirmed:     'bg-neutral-light text-ink',
  in_production: 'bg-primary-light text-primary',
  ready:         'bg-success-light text-success-strong',
  delivered:     'bg-neutral-light text-ink-muted',
  cancelled:     'bg-danger-light text-danger',
};

function fmtDate(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('it-IT', {
    weekday: 'short', day: '2-digit', month: 'short',
  });
}

function AdvanceButton({ orderId, status }: { orderId: string; status: CustomerOrderStatus }) {
  const next = CUSTOMER_ORDER_TRANSITIONS[status].find((s) => s !== 'cancelled');
  if (!next) return null;

  async function handleAdvance(formData: FormData): Promise<void> {
    'use server';
    await changeCustomerOrderStatusAction(orderId, IDLE_STATE, formData);
  }

  return (
    <form action={handleAdvance}>
      <input type="hidden" name="status" value={next} />
      <button
        type="submit"
        className="px-3 py-1.5 bg-primary text-primary-fg rounded-lg text-xs font-semibold hover:bg-primary-hover whitespace-nowrap"
      >
        → {CUSTOMER_ORDER_STATUS_LABELS[next]}
      </button>
    </form>
  );
}

export default async function CustomerOrdersPage({
  searchParams,
}: {
  searchParams: { storico?: string };
}) {
  const showClosed = searchParams.storico === '1';
  const orders = await listCustomerOrders(showClosed);
  const visible = showClosed
    ? orders.filter((o) => o.status === 'delivered' || o.status === 'cancelled')
    : orders;

  // Raggruppa per data ritiro
  const byDate = new Map<string, typeof visible>();
  for (const o of visible) {
    const arr = byDate.get(o.pickupDate) ?? [];
    arr.push(o);
    byDate.set(o.pickupDate, arr);
  }
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-4xl mx-auto space-y-6">
      <PageHeader
        title="Ordini clienti"
        subtitle="Prenotazioni e ritiri — alimentano il fabbisogno del piano produzione"
        action={
          <Link
            href="/customers/new"
            className="px-4 py-2.5 bg-primary text-primary-fg rounded-xl text-sm font-semibold hover:bg-primary-hover transition-colors"
          >
            + Nuovo ordine cliente
          </Link>
        }
      />

      <div className="flex gap-2">
        <Link
          href="/customers"
          className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${!showClosed ? 'bg-primary text-primary-fg border-primary' : 'bg-surface-2 text-ink-muted border-border'}`}
        >
          In corso
        </Link>
        <Link
          href="/customers?storico=1"
          className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${showClosed ? 'bg-primary text-primary-fg border-primary' : 'bg-surface-2 text-ink-muted border-border'}`}
        >
          Storico
        </Link>
      </div>

      {visible.length === 0 ? (
        <div className="bg-surface-2 rounded-2xl border border-border p-10 text-center">
          <p className="text-4xl mb-3">🎂</p>
          <p className="text-lg font-bold text-ink">
            {showClosed ? 'Nessun ordine nello storico' : 'Nessun ordine cliente in corso'}
          </p>
          <p className="text-sm text-ink-muted mt-1 max-w-md mx-auto">
            Registra le prenotazioni (torte, ritiri): compariranno nel piano di
            produzione del giorno giusto.
          </p>
          {!showClosed && (
            <Link href="/customers/new" className="inline-block mt-4 text-sm font-semibold text-primary hover:underline">
              Registra il primo ordine →
            </Link>
          )}
        </div>
      ) : (
        [...byDate.entries()].map(([date, dateOrders]) => (
          <div key={date}>
            <h2 className={`font-semibold text-sm uppercase tracking-wide mb-3 capitalize ${date === today ? 'text-primary' : 'text-ink-muted'}`}>
              {date === today ? '★ Oggi — ' : ''}{fmtDate(date)}
              <span className="ml-2 font-normal normal-case">
                ({dateOrders.reduce((s, o) => s + o.piecesCount, 0)} pezzi)
              </span>
            </h2>
            <div className="bg-surface-2 rounded-2xl border border-border divide-y divide-divider overflow-hidden">
              {dateOrders.map((o) => (
                <div key={o.id} className="flex items-center gap-4 px-6 py-3.5">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-ink truncate">{o.customerName}</p>
                    <p className="text-xs text-ink-muted mt-0.5">
                      {o.piecesCount} {o.piecesCount === 1 ? 'pezzo' : 'pezzi'} · {o.itemsCount} {o.itemsCount === 1 ? 'articolo' : 'articoli'}
                      {o.pickupTime && ` · ritiro ${o.pickupTime.slice(0, 5)}`}
                    </p>
                  </div>
                  {o.totalAmount !== null && (
                    <span className="text-sm font-mono font-medium text-ink">€{formatCurrency(o.totalAmount)}</span>
                  )}
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${STATUS_BADGE[o.status]}`}>
                    {CUSTOMER_ORDER_STATUS_LABELS[o.status]}
                  </span>
                  {!showClosed && <AdvanceButton orderId={o.id} status={o.status} />}
                </div>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
