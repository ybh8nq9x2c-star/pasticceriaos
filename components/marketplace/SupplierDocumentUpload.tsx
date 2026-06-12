'use client';

// =============================================================================
// components/marketplace/SupplierDocumentUpload.tsx
// Il fornitore allega DDT/fattura a un ordine: il documento appare nella
// sezione Documenti del cliente, con le righe snapshot dell'ordine già pronte
// per il matching.
// =============================================================================

import { useFormState } from 'react-dom';
import { IDLE_STATE } from '@/lib/utils';
import { supplierUploadDocumentAction } from '@/modules/documents/actions';

const fieldClass = 'w-full rounded-xl border border-border px-3 py-2.5 text-sm bg-surface-2 focus:outline-none focus:ring-2 focus:ring-primary-ring focus:border-primary';

export function SupplierDocumentUpload({ orderId }: { orderId: string }) {
  const [state, formAction, pending] = useFormState(supplierUploadDocumentAction, IDLE_STATE);

  return (
    <div className="bg-surface-2 rounded-2xl border border-border p-4 sm:p-5">
      <h2 className="font-semibold mb-1">Invia documento al cliente</h2>
      <p className="text-xs text-ink-muted mb-3">
        DDT o fattura per questo ordine: il cliente lo riceve nella sua sezione
        Documenti con le righe già precompilate.
      </p>
      {state.status === 'error' && (
        <p className="mb-3 text-sm text-danger">{state.error}</p>
      )}
      {state.status === 'success' && (
        <p className="mb-3 text-sm text-success-strong">✓ {state.message}</p>
      )}
      <form action={formAction} className="space-y-3">
        <input type="hidden" name="marketplaceOrderId" value={orderId} />
        <div className="grid grid-cols-2 gap-3">
          <select name="documentType" required defaultValue="delivery_note" className={fieldClass}>
            <option value="delivery_note">DDT</option>
            <option value="invoice">Fattura</option>
          </select>
          <input name="documentNumber" type="text" maxLength={100} placeholder="Numero doc." className={fieldClass} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <input name="documentDate" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} className={fieldClass} />
          <input name="totalAmount" type="number" step="0.01" min={0} placeholder="Totale € (opz.)" className={fieldClass} />
        </div>
        <input name="notes" type="text" maxLength={500} placeholder="Note (opz.)" className={fieldClass} />
        <button
          type="submit"
          disabled={pending}
          className="w-full py-2.5 bg-primary text-primary-fg rounded-xl text-sm font-semibold hover:bg-primary-hover disabled:opacity-60 transition-colors"
        >
          {pending ? 'Invio…' : '📎 Invia documento'}
        </button>
      </form>
    </div>
  );
}
