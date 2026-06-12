'use client';

// =============================================================================
// PortalOrderActions — azioni touch-first del portale fornitore:
// conferma ordine (48px), segnala problema (textarea), upload DDT/fattura
// (input file con accept pdf+immagini: da mobile apre camera roll).
// =============================================================================

import { useState } from 'react';
import { useFormState } from 'react-dom';
import { useRouter } from 'next/navigation';
import { IDLE_STATE, type ActionState } from '@/lib/utils';
import {
  portalConfirmOrderAction,
  portalReportIssueAction,
  portalUploadDocumentAction,
} from '@/modules/portal/actions';
import type { OrderStatus } from '@/lib/database.types';

const fieldClass =
  'w-full rounded-xl border border-border px-3 py-3 bg-surface-2 focus:outline-none focus:ring-2 focus:ring-primary-ring';

export function PortalOrderActions({
  token,
  orderId,
  status,
}: {
  token: string;
  orderId: string;
  status: OrderStatus;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [showIssue, setShowIssue] = useState(false);

  const issueBound = portalReportIssueAction.bind(null, token, orderId) as (
    prev: ActionState, formData: FormData,
  ) => Promise<ActionState>;
  const [issueState, issueAction, issuePending] = useFormState(issueBound, IDLE_STATE);

  const uploadBound = portalUploadDocumentAction.bind(null, token, orderId) as (
    prev: ActionState, formData: FormData,
  ) => Promise<ActionState>;
  const [uploadState, uploadAction, uploadPending] = useFormState(uploadBound, IDLE_STATE);

  async function handleConfirm() {
    setConfirming(true);
    setConfirmError(null);
    const result = await portalConfirmOrderAction(token, orderId);
    setConfirming(false);
    if (result.status === 'error') setConfirmError(result.error);
    else router.refresh();
  }

  return (
    <div className="space-y-4">
      {/* Conferma */}
      {status === 'sent' && (
        <div className="bg-surface-2 rounded-2xl border border-border p-4 space-y-3">
          {confirmError && <p className="text-sm text-danger">{confirmError}</p>}
          <button
            onClick={handleConfirm}
            disabled={confirming}
            className="w-full min-h-[48px] bg-primary text-primary-fg rounded-xl text-base font-bold hover:bg-primary-hover disabled:opacity-60 transition-colors"
          >
            {confirming ? 'Conferma in corso…' : '✓ Conferma ordine'}
          </button>
          <button
            onClick={() => setShowIssue((v) => !v)}
            className="w-full min-h-[48px] border border-danger-soft text-danger rounded-xl text-base font-semibold hover:bg-danger-light transition-colors"
          >
            Segnala un problema
          </button>
        </div>
      )}
      {status === 'confirmed' && (
        <div className="bg-neutral-light rounded-2xl border border-border p-4 text-sm text-ink">
          ✓ Hai confermato questo ordine. Quando consegni, allega il DDT qui sotto.
        </div>
      )}
      {status === 'received' && (
        <div className="bg-success-light rounded-2xl border border-success-soft p-4 text-sm text-success-strong">
          ✓ La pasticceria ha registrato la consegna. Puoi allegare la fattura qui sotto.
        </div>
      )}

      {/* Segnala problema */}
      {(showIssue || status !== 'sent') && status !== 'received' && (
        <div className={`bg-surface-2 rounded-2xl border border-border p-4 ${!showIssue && status === 'sent' ? 'hidden' : ''}`}>
          {issueState.status === 'success' ? (
            <p className="text-sm font-semibold text-success-strong">✓ {issueState.message}</p>
          ) : (
            <form action={issueAction} className="space-y-3">
              <label className="block text-sm font-medium text-ink">
                {status === 'sent' ? 'Descrivi il problema' : 'Comunica qualcosa alla pasticceria'}
              </label>
              <textarea
                name="message"
                rows={3}
                required
                maxLength={1000}
                placeholder="es. Burro non disponibile fino a giovedì, posso sostituire con…"
                className={`${fieldClass} resize-none`}
              />
              {issueState.status === 'error' && (
                <p className="text-sm text-danger">{issueState.error}</p>
              )}
              <button
                type="submit"
                disabled={issuePending}
                className="w-full min-h-[48px] bg-primary text-primary-fg rounded-xl text-base font-semibold hover:bg-primary-hover disabled:opacity-60"
              >
                {issuePending ? 'Invio…' : 'Invia segnalazione'}
              </button>
            </form>
          )}
        </div>
      )}

      {/* Upload documento */}
      <div className="bg-surface-2 rounded-2xl border border-border p-4">
        <p className="text-sm font-semibold text-ink mb-1">Allega DDT o fattura</p>
        <p className="text-xs text-ink-muted mb-3">
          PDF o foto del documento (puoi fotografarlo direttamente). Le righe
          vengono precompilate dall'ordine.
        </p>
        {uploadState.status === 'success' ? (
          <p className="text-sm font-semibold text-success-strong">✓ {uploadState.message}</p>
        ) : (
          <form action={uploadAction} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <select name="documentType" required defaultValue={status === 'received' ? 'invoice' : 'delivery_note'} className={fieldClass}>
                <option value="delivery_note">DDT</option>
                <option value="invoice">Fattura</option>
              </select>
              <input name="documentNumber" type="text" maxLength={100} placeholder="Numero doc." className={fieldClass} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <input name="documentDate" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} className={fieldClass} />
              <input name="totalAmount" type="number" step="0.01" min={0} inputMode="decimal" placeholder="Totale €" className={fieldClass} />
            </div>
            <input
              name="file"
              type="file"
              accept=".pdf,image/*"
              className="w-full text-sm text-ink-muted file:mr-3 file:min-h-[44px] file:px-4 file:rounded-xl file:border-0 file:bg-primary file:text-primary-fg file:text-sm file:font-semibold"
            />
            {uploadState.status === 'error' && (
              <p className="text-sm text-danger">{uploadState.error}</p>
            )}
            <button
              type="submit"
              disabled={uploadPending}
              className="w-full min-h-[48px] bg-primary text-primary-fg rounded-xl text-base font-bold hover:bg-primary-hover disabled:opacity-60"
            >
              {uploadPending ? 'Invio…' : '📎 Invia documento'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
