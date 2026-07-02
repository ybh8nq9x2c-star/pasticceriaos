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
    // Mobile: griglia 2×2 con campi comodi da toccare; da sm: riga compatta.
    <form action={formAction} className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
      <input type="hidden" name="purchaseOrderId" value={orderId} />
      <input type="hidden" name="ingredientProductId" value={ingredientProductId} />
      <input type="hidden" name="unit" value={unit} />
      <input
        name="lotNumber"
        type="text"
        placeholder="N° lotto"
        maxLength={100}
        className="w-full sm:w-24 rounded-lg border border-border px-2.5 py-2.5 sm:py-1.5 text-sm sm:text-xs font-mono focus:outline-none focus:ring-2 focus:ring-primary-ring"
      />
      <input
        name="expiryDate"
        type="date"
        required
        className="w-full sm:w-auto rounded-lg border border-border px-2.5 py-2.5 sm:py-1.5 text-sm sm:text-xs focus:outline-none focus:ring-2 focus:ring-primary-ring"
      />
      <input
        name="quantity"
        type="number"
        step="0.001"
        min="0.001"
        required
        inputMode="decimal"
        aria-label="Quantità"
        defaultValue={defaultQuantity}
        className="w-full sm:w-20 rounded-lg border border-border px-2.5 py-2.5 sm:py-1.5 text-sm sm:text-xs text-center font-mono focus:outline-none focus:ring-2 focus:ring-primary-ring"
      />
      <SubmitButton className="w-full sm:w-auto px-3 py-2.5 sm:py-1.5 bg-primary text-primary-fg rounded-lg text-sm sm:text-xs font-semibold hover:bg-primary-hover">
        Registra
      </SubmitButton>
      {state.status === 'error' && (
        <span className="text-xs text-danger col-span-2 sm:basis-full">{state.error}</span>
      )}
    </form>
  );
}
