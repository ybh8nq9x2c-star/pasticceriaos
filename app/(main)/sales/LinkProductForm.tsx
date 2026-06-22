'use client';

// =============================================================================
// app/(main)/sales/LinkProductForm.tsx
// Collega un prodotto POS non riconosciuto a una ricetta. Le vendite future di
// quel prodotto verranno dedotte in automatico (crea/aggiorna product_mappings).
// =============================================================================

import { useFormState } from 'react-dom';
import { IDLE_STATE } from '@/lib/utils';
import { linkProductAction } from '@/modules/sales/actions';
import { SubmitButton } from '@/components/ui/SubmitButton';

export function LinkProductForm({
  source,
  externalProductRef,
  recipes,
}: {
  source: string;
  externalProductRef: string;
  recipes: { id: string; name: string }[];
}) {
  const [state, formAction] = useFormState(linkProductAction, IDLE_STATE);

  return (
    <form action={formAction} className="flex items-center gap-2 shrink-0">
      <input type="hidden" name="source" value={source} />
      <input type="hidden" name="externalProductRef" value={externalProductRef} />
      <select
        name="recipeId"
        required
        defaultValue=""
        className="rounded-lg border border-border bg-surface-2 px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-ring"
      >
        <option value="" disabled>
          Collega a ricetta…
        </option>
        {recipes.map((r) => (
          <option key={r.id} value={r.id}>
            {r.name}
          </option>
        ))}
      </select>
      <SubmitButton
        pendingLabel="…"
        className="rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-fg hover:bg-primary-hover transition-colors"
      >
        Collega
      </SubmitButton>
      {state.status === 'error' && <span className="text-xs text-danger">{state.error}</span>}
    </form>
  );
}
