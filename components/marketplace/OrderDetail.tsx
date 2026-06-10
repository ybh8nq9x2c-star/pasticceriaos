import { StatusBadge } from './StatusBadge';
import { StatusActions } from './StatusActions';
import { ORDER_STATUS_LABELS, type MarketplaceOrderDetail, type AccountType } from '@/modules/marketplace/types';
import { formatCurrency } from '@/lib/utils';

export function OrderDetail({
  order,
  side,
  footer,
}: {
  order: MarketplaceOrderDetail;
  side: AccountType;
  footer?: React.ReactNode;
}) {
  const counterpartyLabel = side === 'supplier' ? 'Cliente' : 'Fornitore';
  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-3xl mx-auto space-y-5 sm:space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-[#6B7280] uppercase">{counterpartyLabel}</p>
          <h1 className="font-playfair text-xl sm:text-2xl font-bold truncate">{order.counterpartyName}</h1>
          <p className="text-sm text-[#6B7280]">Ordine #{order.id.slice(0, 8)}</p>
        </div>
        <div className="shrink-0"><StatusBadge status={order.status} /></div>
      </div>

      {/* Mobile: line items as cards */}
      <div className="md:hidden space-y-2">
        {order.lines.map((l) => (
          <div key={l.id} className="bg-white rounded-xl border border-[#E5DDD0] p-3">
            <div className="flex items-start justify-between gap-3">
              <span className="font-medium leading-tight">{l.name}{l.sku ? <span className="text-[#6B7280]"> · {l.sku}</span> : null}</span>
              <span className="shrink-0 font-mono font-semibold">{l.unitPrice != null ? `${formatCurrency(l.quantity * l.unitPrice)} €` : '—'}</span>
            </div>
            <div className="mt-1 text-xs text-[#6B7280]">{l.quantity} {l.unit}{l.unitPrice != null ? ` × ${formatCurrency(l.unitPrice)} €` : ''}</div>
          </div>
        ))}
        <div className="flex justify-between px-1 pt-1 font-semibold">
          <span>Totale ordine</span><span className="font-mono">{formatCurrency(order.total)} €</span>
        </div>
      </div>

      {/* Tablet/desktop: table */}
      <div className="hidden md:block bg-white rounded-2xl border border-[#E5DDD0] overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-[#FAF7F2] text-[#6B7280] text-xs uppercase">
            <tr>
              <th className="text-left px-4 py-3">Prodotto</th>
              <th className="text-right px-4 py-3">Qtà</th>
              <th className="text-right px-4 py-3">€/u</th>
              <th className="text-right px-4 py-3">Totale</th>
            </tr>
          </thead>
          <tbody>
            {order.lines.map((l) => (
              <tr key={l.id} className="border-t border-[#F0EAE0]">
                <td className="px-4 py-3">{l.name}{l.sku ? <span className="text-[#6B7280]"> · {l.sku}</span> : null}</td>
                <td className="px-4 py-3 text-right">{l.quantity} {l.unit}</td>
                <td className="px-4 py-3 text-right">{l.unitPrice != null ? `${formatCurrency(l.unitPrice)} €` : '—'}</td>
                <td className="px-4 py-3 text-right">{l.unitPrice != null ? `${formatCurrency(l.quantity * l.unitPrice)} €` : '—'}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-[#E5DDD0] font-semibold">
              <td className="px-4 py-3" colSpan={3}>Totale ordine</td>
              <td className="px-4 py-3 text-right">{formatCurrency(order.total)} €</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {order.notes && (
        <div className="bg-white rounded-2xl border border-[#E5DDD0] p-4 text-sm">
          <p className="text-xs text-[#6B7280] uppercase mb-1">Note</p>{order.notes}
        </div>
      )}

      {footer}

      <div className="bg-white rounded-2xl border border-[#E5DDD0] p-4 sm:p-5">
        <h2 className="font-semibold mb-3">Azioni</h2>
        <StatusActions orderId={order.id} status={order.status} side={side} />
      </div>

      <div className="bg-white rounded-2xl border border-[#E5DDD0] p-4 sm:p-5">
        <h2 className="font-semibold mb-3">Storico stato</h2>
        <ol className="space-y-2 text-sm">
          {order.history.map((h) => (
            <li key={h.id} className="flex justify-between gap-3">
              <span>{h.fromStatus ? `${ORDER_STATUS_LABELS[h.fromStatus]} → ` : ''}{ORDER_STATUS_LABELS[h.toStatus]}</span>
              <span className="text-[#6B7280] text-right shrink-0">{new Date(h.createdAt).toLocaleString('it-IT')}</span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
