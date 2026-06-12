// =============================================================================
// app/portal/[token]/orders/page.tsx
// Lista ordini del fornitore: card touch-first, zero tabelle.
// =============================================================================

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { listPortalOrders } from '@/modules/portal/service';
import { formatCurrency } from '@/lib/utils';
import type { OrderStatus } from '@/lib/database.types';

export const dynamic = 'force-dynamic';

const STATUS_CFG: Record<OrderStatus, { label: string; cls: string }> = {
  draft:     { label: 'Bozza',           cls: 'bg-neutral-light text-ink-muted' },
  sent:      { label: 'Da confermare',   cls: 'bg-primary-light text-primary-hover' },
  confirmed: { label: 'Confermato',      cls: 'bg-neutral-light text-ink' },
  received:  { label: 'Consegnato',      cls: 'bg-success-light text-success-strong' },
  cancelled: { label: 'Annullato',       cls: 'bg-danger-light text-danger' },
};

function fmtDate(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default async function PortalOrdersPage({ params }: { params: { token: string } }) {
  let result;
  try {
    result = await listPortalOrders(params.token);
  } catch {
    redirect('/portal/expired');
  }
  const { ctx, orders } = result;

  const pending = orders.filter((o) => o.status === 'sent');
  const others = orders.filter((o) => o.status !== 'sent');

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-ink">Ciao, {ctx.supplierName}</h1>
        <p className="text-sm text-ink-muted mt-0.5">
          {pending.length > 0
            ? `${pending.length} ${pending.length === 1 ? 'ordine attende' : 'ordini attendono'} la tua conferma`
            : 'Nessun ordine in attesa di conferma'}
        </p>
      </div>

      {orders.length === 0 ? (
        <div className="bg-surface-2 rounded-2xl border border-border p-8 text-center text-sm text-ink-muted">
          Nessun ordine da {ctx.organizationName} al momento.
        </div>
      ) : (
        <>
          {pending.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-xs font-semibold text-primary-hover uppercase tracking-wide">Da confermare</h2>
              {pending.map((o) => <OrderCard key={o.id} token={params.token} order={o} />)}
            </section>
          )}
          {others.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-xs font-semibold text-ink-muted uppercase tracking-wide">In corso e storico</h2>
              {others.map((o) => <OrderCard key={o.id} token={params.token} order={o} />)}
            </section>
          )}
        </>
      )}
    </div>
  );
}

function OrderCard({
  token,
  order,
}: {
  token: string;
  order: { id: string; status: OrderStatus; orderDate: string; expectedDate: string | null; lineCount: number; totalAmount: number | null };
}) {
  const cfg = STATUS_CFG[order.status];
  return (
    <Link
      href={`/portal/${token}/orders/${order.id}`}
      className="block bg-surface-2 rounded-2xl border border-border p-4 active:bg-surface-offset transition-colors"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold text-ink">Ordine del {fmtDate(order.orderDate)}</p>
          <p className="text-xs text-ink-muted mt-0.5">
            {order.lineCount} {order.lineCount === 1 ? 'riga' : 'righe'}
            {order.expectedDate && ` · consegna ${fmtDate(order.expectedDate)}`}
          </p>
        </div>
        <span className={`shrink-0 inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${cfg.cls}`}>
          {cfg.label}
        </span>
      </div>
      <div className="mt-3 flex items-center justify-between">
        <span className="text-sm font-mono font-semibold text-ink">
          {order.totalAmount !== null ? `€${formatCurrency(order.totalAmount)}` : 'totale da definire'}
        </span>
        <span className="text-xs font-semibold text-primary">Vedi dettaglio →</span>
      </div>
    </Link>
  );
}
