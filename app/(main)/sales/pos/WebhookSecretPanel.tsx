'use client';

// =============================================================================
// Segreto HMAC della cassa (062): per-config, derivato lato server. L'operatore
// lo copia nel pannello MiPOS; "Genera nuovo" lo ruota (il precedente smette
// subito di valere). Il segreto globale storico non viene MAI mostrato.
// =============================================================================

import { useState } from 'react';
import { useFormState } from 'react-dom';
import { rotatePosWebhookSecretAction } from '@/modules/pos/actions';
import { IDLE_STATE } from '@/lib/utils';
import { SubmitButton } from '@/components/ui/SubmitButton';

interface Props {
  scheme: 'derived' | 'legacy_global';
  version: number;
  verifiedAt: string | null;
  secret: string | null;
}

export function WebhookSecretPanel({ scheme, version, verifiedAt, secret }: Props) {
  const [shown, setShown] = useState(false);
  const [state, formAction] = useFormState(rotatePosWebhookSecretAction, IDLE_STATE);

  return (
    <div className="mt-4 rounded-xl border border-border bg-surface-2 p-3 space-y-2" data-testid="pos-webhook-secret">
      <p className="text-sm font-semibold text-ink">Firma di sicurezza della tua cassa</p>

      {scheme === 'legacy_global' ? (
        <p className="text-xs text-warning-strong">
          Questa cassa usa ancora la firma <strong>condivisa</strong> di installazione. Genera una firma
          dedicata e incollala nel pannello MiPOS: da quel momento solo la tua cassa può inviarti scontrini.
        </p>
      ) : secret ? (
        <>
          <p className="text-xs text-ink-muted">
            Incolla questo valore come <strong>secret del webhook</strong> nel pannello MiPOS (versione {version}).
          </p>
          <div className="flex items-center gap-2">
            <input
              readOnly
              type={shown ? 'text' : 'password'}
              value={secret}
              className="flex-1 rounded-xl border border-border bg-bg px-3 py-2 font-mono text-xs text-ink select-all"
              aria-label="Secret del webhook da incollare nel pannello MiPOS"
            />
            <button
              type="button"
              onClick={() => setShown((v) => !v)}
              className="px-3 min-h-[36px] rounded-xl border border-border text-xs font-semibold text-ink hover:bg-surface-offset"
            >
              {shown ? 'Nascondi' : 'Mostra'}
            </button>
          </div>
          <p className={`text-xs ${verifiedAt ? 'text-success-strong' : 'text-ink-muted'}`}>
            {verifiedAt
              ? `Verificata: primo scontrino firmato ricevuto il ${new Date(verifiedAt).toLocaleString('it-IT')}.`
              : 'In attesa del primo scontrino firmato con questo valore (prova di possesso).'}
          </p>
        </>
      ) : (
        <p className="text-xs text-warning-strong">
          Il server non ha ancora la chiave madre dei webhook (POS_WEBHOOK_MASTER_SECRET): chiedi a chi
          gestisce l&apos;installazione di configurarla.
        </p>
      )}

      <form action={formAction} className="flex items-center gap-3">
        <SubmitButton className="px-3 min-h-[36px] rounded-xl border border-border text-xs font-semibold text-ink hover:bg-surface-offset">
          {scheme === 'legacy_global' ? 'Genera firma dedicata' : 'Genera nuova firma'}
        </SubmitButton>
        {state.status === 'success' && <span className="text-xs text-success-strong">{state.message}</span>}
        {state.status === 'error' && <span className="text-xs text-danger">{state.error}</span>}
      </form>
    </div>
  );
}
