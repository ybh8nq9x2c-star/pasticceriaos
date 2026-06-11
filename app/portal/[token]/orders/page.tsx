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
  draft:     { label: 'Bozza',           cls: 'bg-[#6B7280]/10 text-[#6B7280]' },
  sent:      { label: 'Da confermare',   cls: 'bg-[#C9962A]/15 text-[#8A6418]' },
  confirmed: { label: 'Confermato',      cls: 'bg-[#1A2B4A]/10 text-[#1A2B4A]' },
  received:  { label: 'Consegnato',      cls: 'bg-[#27AE60]/10 text-[#1E7E45]' },
  cancelled: { label: 'Annullato',       cls: 'bg-[#C0392B]/10 text-[#C0392B]' },
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
        <h1 className="font-playfair text-2xl font-bold text-[#1A2B4A]">Ciao, {ctx.supplierName}</h1>
        <p className="text-sm text-[#6B7280] mt-0.5">
          {pending.length > 0
            ? `${pending.length} ${pending.length === 1 ? 'ordine attende' : 'ordini attendono'} la tua conferma`
            : 'Nessun ordine in attesa di conferma'}
        </p>
      </div>

      {orders.length === 0 ? (
        <div className="bg-white rounded-2xl border border-[#E5DDD0] p-8 text-center text-sm text-[#6B7280]">
          Nessun ordine da {ctx.organizationName} al momento.
        </div>
      ) : (
        <>
          {pending.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-xs font-semibold text-[#8A6418] uppercase tracking-wide">Da confermare</h2>
              {pending.map((o) => <OrderCard key={o.id} token={params.token} order={o} />)}
            </section>
          )}
          {others.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-xs font-semibold text-[#6B7280] uppercase tracking-wide">In corso e storico</h2>
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
      className="block bg-white rounded-2xl border border-[#E5DDD0] p-4 active:bg-[#FAF7F2] transition-colors"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold text-[#1A2B4A]">Ordine del {fmtDate(order.orderDate)}</p>
          <p className="text-xs text-[#6B7280] mt-0.5">
            {order.lineCount} {order.lineCount === 1 ? 'riga' : 'righe'}
            {order.expectedDate && ` · consegna ${fmtDate(order.expectedDate)}`}
          </p>
        </div>
        <span className={`shrink-0 inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold ${cfg.cls}`}>
          {cfg.label}
        </span>
      </div>
      <div className="mt-3 flex items-center justify-between">
        <span className="text-sm font-mono font-semibold text-[#1A2B4A]">
          {order.totalAmount !== null ? `€${formatCurrency(order.totalAmount)}` : 'totale da definire'}
        </span>
        <span className="text-xs font-semibold text-[#14B8A6]">Vedi dettaglio →</span>
      </div>
    </Link>
  );
}
