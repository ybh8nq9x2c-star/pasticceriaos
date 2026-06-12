'use client';

// =============================================================================
// app/(main)/documents/[id]/MatchPanel.tsx
// Matching manuale: associa il documento a un ordine ed esegue il confronto.
// =============================================================================

import { useFormState } from 'react-dom';
import { IDLE_STATE, type ActionState } from '@/lib/utils';
import { runMatchingAction } from '@/modules/documents/actions';

export function MatchPanel({
  documentId,
  currentOrderId,
  orders,
}: {
  documentId: string;
  currentOrderId: string | null;
  orders: { id: string; label: string }[];
}) {
  const bound = runMatchingAction.bind(null, documentId) as (
    prev: ActionState,
    formData: FormData,
  ) => Promise<ActionState>;
  const [state, formAction, pending] = useFormState(bound, IDLE_STATE);

  return (
    <div className="bg-surface-2 rounded-2xl border border-border p-5">
      <h2 className="text-xs font-semibold text-ink-muted uppercase tracking-wide mb-3">
        Matching con ordine
      </h2>
      {state.status === 'error' && (
        <p className="mb-3 text-xs text-danger">{state.error}</p>
      )}
      {state.status === 'success' && (
        <p className="mb-3 text-xs text-success-strong">{state.message}</p>
      )}
      <form action={formAction} className="space-y-3">
        <select
          name="purchaseOrderId"
          defaultValue={currentOrderId ?? ''}
          className="w-full rounded-xl border border-border px-3 py-2.5 text-sm bg-surface-2 focus:outline-none focus:ring-2 focus:ring-primary-ring"
        >
          <option value="">Seleziona ordine…</option>
          {orders.map((o) => (
            <option key={o.id} value={o.id}>{o.label}</option>
          ))}
        </select>
        <button
          type="submit"
          disabled={pending}
          className="w-full py-2.5 bg-primary text-primary-fg rounded-xl text-sm font-semibold hover:bg-primary-hover disabled:opacity-60 transition-colors"
        >
          {pending ? 'Verifica…' : currentOrderId ? 'Ri-esegui matching' : 'Associa e verifica'}
        </button>
      </form>
      <p className="text-xs text-ink-muted mt-2.5">
        Confronta quantità e prezzi del documento con le righe dell'ordine e
        segnala le differenze come anomalie.
      </p>
    </div>
  );
}
