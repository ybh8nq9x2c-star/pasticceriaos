'use client';

// =============================================================================
// app/(main)/production/[id]/DraftOrdersButton.tsx
// A1: genera bozze d'ordine reali (una per fornitore) dalle shortage del piano.
// =============================================================================

import Link from 'next/link';
import { useFormState } from 'react-dom';
import { IDLE_STATE, type ActionState } from '@/lib/utils';
import { createDraftsFromShortageAction } from '@/modules/ordering/actions';

export function DraftOrdersButton({ planId }: { planId: string }) {
  const bound = (async (_prev: ActionState, _fd: FormData) =>
    createDraftsFromShortageAction(planId)) as (
    prev: ActionState,
    formData: FormData,
  ) => Promise<ActionState>;
  const [state, formAction, pending] = useFormState(bound, IDLE_STATE);

  if (state.status === 'success') {
    return (
      <div className="text-right">
        <p className="text-xs font-semibold text-success-strong">✓ {state.message}</p>
        <Link href="/orders" className="text-xs font-semibold text-primary hover:underline">
          Rivedi le bozze →
        </Link>
      </div>
    );
  }

  return (
    <div className="text-right shrink-0">
      {state.status === 'error' && (
        <div className="mb-1">
          <p className="text-xs text-danger">{state.error}</p>
          {/* CTA: il caso più comune è "ingredienti senza fornitore" (BUG-05) */}
          {/fornitore/i.test(state.error) && (
            <Link
              href="/ingredients"
              className="inline-block mt-0.5 text-xs font-semibold text-primary hover:underline"
            >
              Assegna fornitori →
            </Link>
          )}
        </div>
      )}
      <form action={formAction}>
        <button
          type="submit"
          disabled={pending}
          className="px-3 py-2 bg-primary text-primary-fg rounded-xl text-xs font-semibold hover:bg-primary-hover disabled:opacity-60"
        >
          {pending ? 'Generazione…' : '🛒 Genera bozze per fornitore'}
        </button>
      </form>
      <Link
        href={`/orders/new?plan=${planId}`}
        className="inline-block mt-1.5 text-xs font-semibold text-ink-muted hover:text-primary"
      >
        oppure componi a mano →
      </Link>
    </div>
  );
}
