'use client';

// =============================================================================
// app/(main)/orders/[id]/RegisterBatchForm.tsx
// Registra lotto + scadenza per una riga di un ordine ricevuto (HACCP-lite).
// =============================================================================

import { useFormState } from 'react-dom';
import { IDLE_STATE } from '@/lib/utils';
import { recordBatchAction } from '@/modules/inventory/actions';
import { SubmitButton } from '@/components/ui/SubmitButton';

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
  const [state, formAction] = useFormState(recordBatchAction, IDLE_STATE);

  if (state.status === 'success') {
    return <p className="text-xs font-semibold text-success-strong">✓ Lotto registrato</p>;
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
        className="w-24 rounded-lg border border-border px-2 py-1.5 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-primary-ring"
      />
      <input
        name="expiryDate"
        type="date"
        required
        className="rounded-lg border border-border px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary-ring"
      />
      <input
        name="quantity"
        type="number"
        step="0.001"
        min="0.001"
        required
        defaultValue={defaultQuantity}
        className="w-20 rounded-lg border border-border px-2 py-1.5 text-xs text-center font-mono focus:outline-none focus:ring-2 focus:ring-primary-ring"
      />
      <SubmitButton className="px-3 py-1.5 bg-primary text-primary-fg rounded-lg text-xs font-semibold hover:bg-primary-hover">
        Registra
      </SubmitButton>
      {state.status === 'error' && (
        <span className="text-xs text-danger basis-full">{state.error}</span>
      )}
    </form>
  );
}
