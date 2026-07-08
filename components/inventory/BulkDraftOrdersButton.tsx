'use client';

// =============================================================================
// <BulkDraftOrdersButton> — P1-A: dal magazzino, UNA bozza reale PER FORNITORE
// da tutte le scorte sotto soglia (prima: un solo form monofornitore).
// Stessa meccanica del DraftOrdersButton del piano produzione.
// =============================================================================

import Link from 'next/link';
import { useFormState } from 'react-dom';
import { ShoppingCart } from 'lucide-react';
import { IDLE_STATE, type ActionState } from '@/lib/utils';
import { createDraftsFromLowStockAction } from '@/modules/ordering/actions';
import { SubmitButton } from '@/components/ui/SubmitButton';

export function BulkDraftOrdersButton({ alertCount }: { alertCount: number }) {
  const bound = (async (_prev: ActionState, _fd: FormData) =>
    createDraftsFromLowStockAction()) as (
    prev: ActionState,
    formData: FormData,
  ) => Promise<ActionState>;
  const [state, formAction] = useFormState(bound, IDLE_STATE);

  if (state.status === 'success') {
    return (
      <div className="text-center">
        <p className="text-sm font-semibold text-success-strong">✓ {state.message}</p>
        <Link href="/orders" className="text-sm font-semibold text-primary hover:underline">
          Rivedi e invia le bozze →
        </Link>
      </div>
    );
  }

  return (
    <div>
      {state.status === 'error' && (
        <p className="mb-1.5 text-xs text-danger">
          {state.error}{' '}
          {/fornitore/i.test(state.error) && (
            <Link href="/ingredients" className="font-semibold text-primary hover:underline">
              Assegna fornitori →
            </Link>
          )}
        </p>
      )}
      <form action={formAction}>
        <SubmitButton
          pendingLabel="Creo le bozze…"
          className="flex items-center justify-center gap-2 h-12 w-full rounded-xl bg-primary text-primary-fg text-sm font-semibold hover:bg-primary-hover transition-colors"
        >
          <ShoppingCart size={16} aria-hidden="true" />
          Ordina tutti i mancanti ({alertCount})
        </SubmitButton>
      </form>
    </div>
  );
}
