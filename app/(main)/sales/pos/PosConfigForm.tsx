'use client';

// =============================================================================
// app/(main)/sales/pos/PosConfigForm.tsx — step "Il tuo negozio" del wizard.
// Salva store_id/merchant_code: è ciò che permette al webhook di capire a QUALE
// organizzazione appartiene lo scontrino. Prima esisteva solo via SQL.
// =============================================================================

import { useFormState } from 'react-dom';
import { IDLE_STATE } from '@/lib/utils';
import { savePosConfigAction } from '@/modules/pos/actions';
import { SubmitButton } from '@/components/ui/SubmitButton';

const field =
  'w-full rounded-xl border border-border bg-surface-2 px-3 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary-ring';

export function PosConfigForm({
  provider = 'mipos',
  storeId,
  merchantCode,
}: {
  provider?: string;
  storeId: string | null;
  merchantCode: string | null;
}) {
  const [state, formAction] = useFormState(savePosConfigAction, IDLE_STATE);

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="provider" value={provider} />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="block">
          <span className="block text-xs font-medium text-ink mb-1">Store ID</span>
          <input name="storeId" defaultValue={storeId ?? ''} placeholder="es. store_12345" className={field} />
        </label>
        <label className="block">
          <span className="block text-xs font-medium text-ink mb-1">Merchant code (alternativa)</span>
          <input name="merchantCode" defaultValue={merchantCode ?? ''} placeholder="es. MERCH-001" className={field} />
        </label>
      </div>
      <p className="text-xs text-ink-muted">
        Li trovi nel pannello della tua cassa. Ne basta <strong>uno</strong>: serve a collegare gli
        scontrini alla tua organizzazione.
      </p>
      {state.status === 'error' && <p role="alert" className="text-sm text-danger">{state.error}</p>}
      {state.status === 'success' && <p role="status" className="text-sm text-success-strong">{state.message}</p>}
      <SubmitButton
        pendingLabel="Salvataggio…"
        className="min-h-[44px] rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-fg hover:bg-primary-hover"
      >
        Salva collegamento
      </SubmitButton>
    </form>
  );
}
