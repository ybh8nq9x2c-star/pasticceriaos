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
  'w-full rounded-xl border border-[#E5DDD0] px-3 py-3 bg-white focus:outline-none focus:ring-2 focus:ring-[#14B8A6]/30';

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
        <div className="bg-white rounded-2xl border border-[#E5DDD0] p-4 space-y-3">
          {confirmError && <p className="text-sm text-[#C0392B]">{confirmError}</p>}
          <button
            onClick={handleConfirm}
            disabled={confirming}
            className="w-full min-h-[48px] bg-[#14B8A6] text-white rounded-xl text-base font-bold hover:bg-[#0F9488] disabled:opacity-60 transition-colors"
          >
            {confirming ? 'Conferma in corso…' : '✓ Conferma ordine'}
          </button>
          <button
            onClick={() => setShowIssue((v) => !v)}
            className="w-full min-h-[48px] border border-[#C0392B]/40 text-[#C0392B] rounded-xl text-base font-semibold hover:bg-[#C0392B]/5 transition-colors"
          >
            Segnala un problema
          </button>
        </div>
      )}
      {status === 'confirmed' && (
        <div className="bg-[#1A2B4A]/5 rounded-2xl border border-[#1A2B4A]/15 p-4 text-sm text-[#1A2B4A]">
          ✓ Hai confermato questo ordine. Quando consegni, allega il DDT qui sotto.
        </div>
      )}
      {status === 'received' && (
        <div className="bg-[#27AE60]/[0.07] rounded-2xl border border-[#27AE60]/25 p-4 text-sm text-[#1E7E45]">
          ✓ La pasticceria ha registrato la consegna. Puoi allegare la fattura qui sotto.
        </div>
      )}

      {/* Segnala problema */}
      {(showIssue || status !== 'sent') && status !== 'received' && (
        <div className={`bg-white rounded-2xl border border-[#E5DDD0] p-4 ${!showIssue && status === 'sent' ? 'hidden' : ''}`}>
          {issueState.status === 'success' ? (
            <p className="text-sm font-semibold text-[#1E7E45]">✓ {issueState.message}</p>
          ) : (
            <form action={issueAction} className="space-y-3">
              <label className="block text-sm font-medium text-[#1A2B4A]">
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
                <p className="text-sm text-[#C0392B]">{issueState.error}</p>
              )}
              <button
                type="submit"
                disabled={issuePending}
                className="w-full min-h-[48px] bg-[#1A2B4A] text-white rounded-xl text-base font-semibold hover:bg-[#243660] disabled:opacity-60"
              >
                {issuePending ? 'Invio…' : 'Invia segnalazione'}
              </button>
            </form>
          )}
        </div>
      )}

      {/* Upload documento */}
      <div className="bg-white rounded-2xl border border-[#E5DDD0] p-4">
        <p className="text-sm font-semibold text-[#1A2B4A] mb-1">Allega DDT o fattura</p>
        <p className="text-xs text-[#6B7280] mb-3">
          PDF o foto del documento (puoi fotografarlo direttamente). Le righe
          vengono precompilate dall'ordine.
        </p>
        {uploadState.status === 'success' ? (
          <p className="text-sm font-semibold text-[#1E7E45]">✓ {uploadState.message}</p>
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
              className="w-full text-sm text-[#6B7280] file:mr-3 file:min-h-[44px] file:px-4 file:rounded-xl file:border-0 file:bg-[#1A2B4A] file:text-white file:text-sm file:font-semibold"
            />
            {uploadState.status === 'error' && (
              <p className="text-sm text-[#C0392B]">{uploadState.error}</p>
            )}
            <button
              type="submit"
              disabled={uploadPending}
              className="w-full min-h-[48px] bg-[#2A7D6B] text-white rounded-xl text-base font-bold hover:bg-[#236457] disabled:opacity-60"
            >
              {uploadPending ? 'Invio…' : '📎 Invia documento'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
