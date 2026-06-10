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
      <div className="bg-[#27AE60]/[0.07] rounded-2xl border border-[#27AE60]/25 p-4 sm:p-5">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-[#27AE60]/15 flex items-center justify-center shrink-0">
            <span className="text-[#27AE60] font-bold">✓</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-[#1E7E45]">Carico registrato a magazzino</p>
            <p className="text-xs text-[#6B7280] mt-0.5">
              Movimenti e prezzi ingredienti aggiornati dagli snapshot dell'ordine.
            </p>
          </div>
          <Link
            href={`/orders/${linkedPurchaseOrderId}`}
            className="shrink-0 text-xs font-semibold text-[#1E7E45] hover:underline"
          >
            Vedi ricezione →
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-[#E5DDD0] p-4 sm:p-5">
      <h2 className="font-semibold mb-1">Ricezione merce</h2>
      <p className="text-xs text-[#6B7280] mb-3">
        L'ordine è stato consegnato. Registra il carico: crea i movimenti di
        magazzino e aggiorna i prezzi degli ingredienti con i prezzi reali dell'ordine.
      </p>
      {state.status === 'error' && (
        <div className="mb-3 rounded-xl bg-[#C0392B]/[0.06] border border-[#C0392B]/30 p-3 text-sm text-[#C0392B]">
          {state.error}
        </div>
      )}
      <form action={formAction}>
        <input type="hidden" name="orderId" value={orderId} />
        <button
          type="submit"
          disabled={pending}
          className="w-full py-3 bg-[#2A7D6B] text-white rounded-xl text-sm font-semibold hover:bg-[#236457] disabled:opacity-60 transition-colors"
        >
          {pending ? 'Registrazione…' : '📦 Registra carico a magazzino'}
        </button>
      </form>
    </div>
  );
}
