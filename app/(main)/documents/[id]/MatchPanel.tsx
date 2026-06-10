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
    <div className="bg-white rounded-2xl border border-[#E5DDD0] p-5">
      <h2 className="text-[11px] font-semibold text-[#6B7280] uppercase tracking-wide mb-3">
        Matching con ordine
      </h2>
      {state.status === 'error' && (
        <p className="mb-3 text-xs text-[#C0392B]">{state.error}</p>
      )}
      {state.status === 'success' && (
        <p className="mb-3 text-xs text-[#1E7E45]">{state.message}</p>
      )}
      <form action={formAction} className="space-y-3">
        <select
          name="purchaseOrderId"
          defaultValue={currentOrderId ?? ''}
          className="w-full rounded-xl border border-[#E5DDD0] px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#C9962A]/30"
        >
          <option value="">Seleziona ordine…</option>
          {orders.map((o) => (
            <option key={o.id} value={o.id}>{o.label}</option>
          ))}
        </select>
        <button
          type="submit"
          disabled={pending}
          className="w-full py-2.5 bg-[#1A2B4A] text-white rounded-xl text-sm font-semibold hover:bg-[#243660] disabled:opacity-60 transition-colors"
        >
          {pending ? 'Verifica…' : currentOrderId ? 'Ri-esegui matching' : 'Associa e verifica'}
        </button>
      </form>
      <p className="text-[11px] text-[#6B7280] mt-2.5">
        Confronta quantità e prezzi del documento con le righe dell'ordine e
        segnala le differenze come anomalie.
      </p>
    </div>
  );
}
