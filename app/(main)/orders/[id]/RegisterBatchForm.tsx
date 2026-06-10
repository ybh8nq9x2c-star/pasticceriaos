'use client';

// =============================================================================
// app/(main)/orders/[id]/RegisterBatchForm.tsx
// Registra lotto + scadenza per una riga di un ordine ricevuto (HACCP-lite).
// =============================================================================

import { useFormState } from 'react-dom';
import { IDLE_STATE } from '@/lib/utils';
import { recordBatchAction } from '@/modules/inventory/actions';

export function RegisterBatchForm({
  orderId,
  ingredientProductId,
  defaultQuantity,
  unit,
}: {
  orderId: string;
  ingredientProductId: string;
  defaultQuantity: number;
  unit: string;
}) {
  const [state, formAction, pending] = useFormState(recordBatchAction, IDLE_STATE);

  if (state.status === 'success') {
    return <p className="text-xs font-semibold text-[#1E7E45]">✓ Lotto registrato</p>;
  }

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="purchaseOrderId" value={orderId} />
      <input type="hidden" name="ingredientProductId" value={ingredientProductId} />
      <input type="hidden" name="unit" value={unit} />
      <input
        name="lotNumber"
        type="text"
        placeholder="N° lotto"
        maxLength={100}
        className="w-24 rounded-lg border border-[#E5DDD0] px-2 py-1.5 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-[#C9962A]/30"
      />
      <input
        name="expiryDate"
        type="date"
        required
        className="rounded-lg border border-[#E5DDD0] px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-[#C9962A]/30"
      />
      <input
        name="quantity"
        type="number"
        step="0.001"
        min="0.001"
        required
        defaultValue={defaultQuantity}
        className="w-20 rounded-lg border border-[#E5DDD0] px-2 py-1.5 text-xs text-center font-mono focus:outline-none focus:ring-2 focus:ring-[#C9962A]/30"
      />
      <button
        type="submit"
        disabled={pending}
        className="px-3 py-1.5 bg-[#2A7D6B] text-white rounded-lg text-xs font-semibold hover:bg-[#236457] disabled:opacity-60"
      >
        {pending ? '…' : 'Registra'}
      </button>
      {state.status === 'error' && (
        <span className="text-xs text-[#C0392B] basis-full">{state.error}</span>
      )}
    </form>
  );
}
