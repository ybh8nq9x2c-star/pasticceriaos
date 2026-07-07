'use client';

// =============================================================================
// app/(main)/sales/pos/PosMappingForm.tsx
// Riga di mappatura POS→ricetta. Tre usi (stessa action):
//  • edit di una mappatura esistente (posItemId fisso, valori precompilati)
//  • collega un prodotto "Non collegato" visto in vendita (posItemId fisso)
//  • aggiunta manuale (posItemId editabile)
// =============================================================================

import { useFormState } from 'react-dom';
import { IDLE_STATE } from '@/lib/utils';
import { upsertPosMappingAction } from '@/modules/pos/actions';
import { SubmitButton } from '@/components/ui/SubmitButton';

const field =
  'rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-ring';

export function PosMappingForm({
  source = 'pos:mipos',
  posItemId,
  posItemName,
  recipeId,
  portionsPerUnit = 1,
  recipes,
  editablePosId = false,
  submitLabel = 'Salva',
}: {
  source?: string;
  posItemId?: string;
  posItemName?: string | null;
  recipeId?: string | null;
  portionsPerUnit?: number;
  recipes: { id: string; name: string }[];
  editablePosId?: boolean;
  submitLabel?: string;
}) {
  const [state, formAction] = useFormState(upsertPosMappingAction, IDLE_STATE);

  return (
    // Mobile: campi impilati a tutta larghezza (tap comodo); da sm: riga compatta.
    <form action={formAction} className="grid grid-cols-1 gap-2 sm:flex sm:flex-wrap sm:items-center">
      <input type="hidden" name="source" value={source} />
      {editablePosId ? (
        <input name="posItemId" required placeholder="Codice / PLU" defaultValue={posItemId ?? ''} className={`${field} w-full sm:w-28`} />
      ) : (
        <input type="hidden" name="posItemId" value={posItemId ?? ''} />
      )}
      <input
        name="posItemName"
        placeholder="Nome POS (opz.)"
        defaultValue={posItemName ?? ''}
        className={`${field} w-full sm:w-36`}
      />
      <select name="recipeId" required defaultValue={recipeId ?? ''} className={`${field} w-full sm:w-auto sm:min-w-[10rem] sm:flex-1`}>
        <option value="" disabled>
          Ricetta…
        </option>
        {recipes.map((r) => (
          <option key={r.id} value={r.id}>
            {r.name}
          </option>
        ))}
      </select>
      <div className="flex items-center gap-2 sm:contents">
        <label className="flex-1 sm:flex-none text-xs text-ink-muted flex items-center justify-between sm:justify-start gap-1.5">
          porzioni/unità
          <input
            name="portionsPerUnit"
            type="number"
            min={1}
            inputMode="numeric"
            defaultValue={portionsPerUnit}
            className={`${field} w-20 sm:w-16 text-center`}
          />
        </label>
        <SubmitButton
          pendingLabel="…"
          className="flex-1 sm:flex-none min-h-[44px] rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-fg hover:bg-primary-hover transition-colors"
        >
          {submitLabel}
        </SubmitButton>
      </div>
      {state.status === 'error' && <span className="w-full text-xs text-danger">{state.error}</span>}
      {state.status === 'success' && <span className="w-full text-xs text-success-strong">Salvato.</span>}
    </form>
  );
}
