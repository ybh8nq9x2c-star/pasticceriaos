'use client';

// =============================================================================
// components/marketplace/ReceiveIntoInventory.tsx
// CTA lato cliente: registra il carico a magazzino di un ordine marketplace
// consegnato. Idempotente lato DB (nessun doppio movimento al retry).
// =============================================================================

import Link from 'next/link';
import { useFormState } from 'react-dom';
import { IDLE_STATE } from '@/lib/utils';
import { receiveMarketplaceOrderAction } from '@/modules/marketplace/actions';

export function ReceiveIntoInventory({
  orderId,
  linkedPurchaseOrderId,
}: {
  orderId: string;
  linkedPurchaseOrderId: string | null;
}) {
  const [state, formAction, pending] = useFormState(receiveMarketplaceOrderAction, IDLE_STATE);

  if (linkedPurchaseOrderId) {
    return (
      <div className="bg-success-light rounded-2xl border border-success-soft p-4 sm:p-5">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-success-light flex items-center justify-center shrink-0">
            <span className="text-success-strong font-bold">✓</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-success-strong">Carico registrato a magazzino</p>
            <p className="text-xs text-ink-muted mt-0.5">
              Movimenti e prezzi ingredienti aggiornati dagli snapshot dell'ordine.
            </p>
          </div>
          <Link
            href={`/orders/${linkedPurchaseOrderId}`}
            className="shrink-0 text-xs font-semibold text-success-strong hover:underline"
          >
            Vedi ricezione →
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-surface-2 rounded-2xl border border-border p-4 sm:p-5">
      <h2 className="font-semibold mb-1">Ricezione merce</h2>
      <p className="text-xs text-ink-muted mb-3">
        L'ordine è stato consegnato. Registra il carico: crea i movimenti di
        magazzino e aggiorna i prezzi degli ingredienti con i prezzi reali dell'ordine.
      </p>
      {state.status === 'error' && (
        <div className="mb-3 rounded-xl bg-danger-light border border-danger-soft p-3 text-sm text-danger">
          {state.error}
        </div>
      )}
      <form action={formAction}>
        <input type="hidden" name="orderId" value={orderId} />
        <button
          type="submit"
          disabled={pending}
          className="w-full py-3 bg-primary text-primary-fg rounded-xl text-sm font-semibold hover:bg-primary-hover disabled:opacity-60 transition-colors"
        >
          {pending ? 'Registrazione…' : '📦 Registra carico a magazzino'}
        </button>
      </form>
    </div>
  );
}
