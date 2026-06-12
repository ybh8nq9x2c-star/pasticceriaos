// =============================================================================
// app/portal/[token]/orders/[orderId]/page.tsx
// Dettaglio ordine portale: righe, conferma, segnalazione problema, upload doc.
// =============================================================================

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getPortalOrder } from '@/modules/portal/service';
import { PortalOrderActions } from './PortalOrderActions';
import { formatCurrency, UNIT_SHORT } from '@/lib/utils';

export const dynamic = 'force-dynamic';

function fmtDate(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('it-IT', { day: '2-digit', month: 'long', year: 'numeric' });
}

const DOC_LABEL: Record<string, string> = {
  delivery_note: 'DDT',
  invoice: 'Fattura',
  order_confirmation: 'Conferma',
  credit_note: 'Nota credito',
};

export default async function PortalOrderDetailPage({
  params,
}: {
  params: { token: string; orderId: string };
}) {
  let result;
  try {
    result = await getPortalOrder(params.token, params.orderId);
  } catch {
    redirect(`/portal/${params.token}/orders`);
  }
  const { order } = result;

  return (
    <div className="space-y-5">
      <div>
        <Link href={`/portal/${params.token}/orders`} className="text-sm text-ink-muted">
          ← Tutti gli ordini
        </Link>
        <h1 className="text-2xl font-bold text-ink mt-2">
          Ordine del {fmtDate(order.orderDate)}
        </h1>
        {order.expectedDate && (
          <p className="text-sm text-ink-muted mt-0.5">Consegna richiesta: {fmtDate(order.expectedDate)}</p>
        )}
      </div>

      {/* Righe come card (zero tabelle su mobile) */}
      <div className="space-y-2">
        {order.lines.map((l) => (
          <div key={l.id} className="bg-surface-2 rounded-xl border border-border p-3.5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-ink">{l.name}</p>
                {l.sku && <p className="text-xs font-mono text-ink-muted">{l.sku}</p>}
              </div>
              <span className="shrink-0 text-sm font-mono font-semibold text-ink">
                {l.quantity} {UNIT_SHORT[l.unit]}
              </span>
            </div>
            {l.unitPrice !== null && (
              <p className="text-xs text-ink-muted mt-1.5 text-right font-mono">
                €{formatCurrency(l.unitPrice)}/{UNIT_SHORT[l.unit]} · tot €{formatCurrency(l.quantity * l.unitPrice)}
              </p>
            )}
          </div>
        ))}
        <div className="flex justify-between items-center px-1 pt-1">
          <span className="text-sm font-semibold text-ink">Totale ordine</span>
          <span className="font-mono font-bold text-ink">
            {order.totalAmount !== null ? `€${formatCurrency(order.totalAmount)}` : '—'}
          </span>
        </div>
      </div>

      {order.notes && (
        <div className="bg-surface-2 rounded-xl border border-border p-3.5 text-sm">
          <p className="text-xs text-ink-muted uppercase font-semibold mb-1">Note della pasticceria</p>
          {order.notes}
        </div>
      )}

      {/* Documenti già inviati */}
      {order.documents.length > 0 && (
        <div className="bg-surface-2 rounded-xl border border-border p-3.5">
          <p className="text-xs text-ink-muted uppercase font-semibold mb-2">Documenti inviati</p>
          <ul className="space-y-1.5">
            {order.documents.map((d) => (
              <li key={d.id} className="text-sm text-ink flex items-center gap-2">
                <span className="text-success-strong">✓</span>
                {DOC_LABEL[d.documentType] ?? d.documentType}
                {d.documentNumber && <span className="font-mono text-xs text-ink-muted">n. {d.documentNumber}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Azioni (client): conferma / problema / upload */}
      <PortalOrderActions token={params.token} orderId={order.id} status={order.status} />
    </div>
  );
}
