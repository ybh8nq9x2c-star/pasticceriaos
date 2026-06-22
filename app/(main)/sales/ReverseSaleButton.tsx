'use client';

// =============================================================================
// app/(main)/sales/ReverseSaleButton.tsx
// Storno vendita (reso/annullo): inserisce movimenti inversi e ripristina il
// magazzino. La storia NON viene modificata (regola #3). Conferma prima di agire.
// =============================================================================

import { useFormState } from 'react-dom';
import { IDLE_STATE } from '@/lib/utils';
import { reverseSaleAction } from '@/modules/sales/actions';
import { SubmitButton } from '@/components/ui/SubmitButton';

export function ReverseSaleButton({ saleId }: { saleId: string }) {
  const [state, formAction] = useFormState(reverseSaleAction, IDLE_STATE);

  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (!confirm('Stornare questa vendita? Il magazzino verrà ripristinato.')) e.preventDefault();
      }}
    >
      <input type="hidden" name="saleId" value={saleId} />
      <SubmitButton
        pendingLabel="…"
        className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-ink-muted hover:text-danger hover:border-danger-soft transition-colors"
      >
        Storna
      </SubmitButton>
      {state.status === 'error' && <span className="ml-2 text-xs text-danger">{state.error}</span>}
    </form>
  );
}
