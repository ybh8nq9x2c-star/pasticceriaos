'use client';

// =============================================================================
// app/(main)/documents/new/NewDocumentForm.tsx
// Form registrazione documento (client). Le righe arrivano prefillate
// dall'ordine reale quando si parte da /documents/new?order=<id>.
// =============================================================================

import { useState } from 'react';
import { useFormState } from 'react-dom';
import Link from 'next/link';
import { IDLE_STATE } from '@/lib/utils';
import { createDocumentAction } from '@/modules/documents/actions';
import { SubmitButton } from '@/components/ui/SubmitButton';

export interface DocLinePrefill {
  orderLineItemId: string | null;
  ingredientProductId: string | null;
  description: string;
  quantity: string;
  unit: string;
  unitPrice: string;
}

interface LineRow extends DocLinePrefill { key: number }

let keyCounter = 0;
const fieldClass = 'w-full rounded-xl border border-border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-ring focus:border-primary bg-surface-2';
const labelClass = 'block text-sm font-medium text-ink mb-1.5';

const EMPTY_LINE = (): LineRow => ({
  key: ++keyCounter, orderLineItemId: null, ingredientProductId: null,
  description: '', quantity: '', unit: 'kg', unitPrice: '',
});

export function NewDocumentForm({
  suppliers,
  orders,
  prefillOrderId,
  prefillSupplierId,
  prefillLines,
}: {
  suppliers: { id: string; name: string }[];
  orders: { id: string; label: string; supplierId: string }[];
  prefillOrderId?: string;
  prefillSupplierId?: string;
  prefillLines?: DocLinePrefill[];
}) {
  const [state, formAction] = useFormState(createDocumentAction, IDLE_STATE);
  const [rows, setRows] = useState<LineRow[]>(
    prefillLines && prefillLines.length > 0
      ? prefillLines.map((l) => ({ ...l, key: ++keyCounter }))
      : [EMPTY_LINE()],
  );

  function updateRow(key: number, field: keyof DocLinePrefill, value: string) {
    setRows((p) => p.map((r) => (r.key === key ? { ...r, [field]: value } : r)));
  }

  function handleSubmit(formData: FormData) {
    formData.set('lines', JSON.stringify(rows.map((r) => ({
      orderLineItemId:     r.orderLineItemId ?? '',
      ingredientProductId: r.ingredientProductId ?? '',
      description:         r.description,
      quantity:            r.quantity,
      unit:                r.unit,
      unitPrice:           r.unitPrice,
    }))));
    formAction(formData);
  }

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <div className="mb-6">
        <Link href="/documents" className="text-sm text-ink-muted hover:text-ink transition-colors">
          ← Documenti
        </Link>
        <h1 className="text-3xl font-bold text-ink mt-3">Registra documento</h1>
        <p className="text-sm text-ink-muted mt-1">
          Inserisci i dati del DDT o della fattura: il sistema li confronta con l'ordine.
        </p>
      </div>

      <form action={handleSubmit} className="space-y-6">
        {state.status === 'error' && (
          <div className="rounded-xl bg-danger-light border border-danger-soft p-3 text-sm text-danger">
            {state.error}
          </div>
        )}

        <div className="bg-surface-2 rounded-2xl border border-border p-6 space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Tipo documento <span className="text-danger">*</span></label>
              <select name="documentType" required defaultValue="invoice" className={fieldClass}>
                <option value="delivery_note">DDT (documento di trasporto)</option>
                <option value="invoice">Fattura</option>
                <option value="order_confirmation">Conferma ordine</option>
                <option value="credit_note">Nota di credito</option>
              </select>
            </div>
            <div>
              <label className={labelClass}>Numero documento</label>
              <input name="documentNumber" type="text" maxLength={100} placeholder="es. FT-2026/041" className={fieldClass} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Fornitore <span className="text-danger">*</span></label>
              <select name="supplierId" required defaultValue={prefillSupplierId ?? ''} className={fieldClass}>
                <option value="">Seleziona…</option>
                {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label className={labelClass}>Ordine collegato</label>
              <select name="purchaseOrderId" defaultValue={prefillOrderId ?? ''} className={fieldClass}>
                <option value="">Nessuno (matching dopo)</option>
                {orders.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className={labelClass}>Data documento <span className="text-danger">*</span></label>
              <input name="documentDate" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} className={fieldClass} />
            </div>
            <div>
              <label className={labelClass}>Scadenza pagamento</label>
              <input name="dueDate" type="date" className={fieldClass} />
            </div>
            <div>
              <label className={labelClass}>Totale documento (€)</label>
              <input name="totalAmount" type="number" step="0.01" min={0} placeholder="0,00" className={fieldClass} />
            </div>
          </div>

          <div>
            <label className={labelClass}>Note</label>
            <textarea name="notes" rows={2} maxLength={2000} className={`${fieldClass} resize-none`} />
          </div>

          <div>
            <label className={labelClass}>
              File documento <span className="text-ink-muted font-normal text-xs">(PDF o foto, max 10MB — opz.)</span>
            </label>
            <input
              name="file"
              type="file"
              accept=".pdf,image/*"
              className="w-full text-sm text-ink-muted file:mr-3 file:min-h-[44px] file:px-4 file:rounded-xl file:border-0 file:bg-primary file:text-primary-fg file:text-sm file:font-semibold"
            />
          </div>
        </div>

        {/* Righe */}
        <div className="bg-surface-2 rounded-2xl border border-border p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-bold text-ink">
              Righe documento <span className="text-danger">*</span>
            </h2>
            <button
              type="button"
              onClick={() => setRows((p) => [...p, EMPTY_LINE()])}
              className="text-xs font-semibold text-primary hover:underline"
            >
              + Aggiungi riga
            </button>
          </div>
          {prefillLines && prefillLines.length > 0 && (
            <p className="text-xs text-ink-muted mb-3 bg-bg rounded-xl p-3">
              Righe precompilate dall'ordine: correggi quantità e prezzi con i valori
              REALI del documento — le differenze verranno rilevate come anomalie.
            </p>
          )}

          <div className="space-y-3">
            {rows.map((row, idx) => (
              <div key={row.key} className="grid grid-cols-12 gap-2 items-center">
                <span className="col-span-1 text-xs text-ink-muted text-center font-mono">{idx + 1}</span>
                <input
                  type="text"
                  placeholder="Descrizione"
                  value={row.description}
                  onChange={(e) => updateRow(row.key, 'description', e.target.value)}
                  className="col-span-5 rounded-xl border border-border px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-ring"
                />
                <input
                  type="number" step="0.001" min="0" placeholder="Qtà"
                  value={row.quantity}
                  onChange={(e) => updateRow(row.key, 'quantity', e.target.value)}
                  className="col-span-2 rounded-xl border border-border px-2 py-2 text-sm text-center font-mono focus:outline-none focus:ring-2 focus:ring-primary-ring"
                />
                <select
                  value={row.unit}
                  onChange={(e) => updateRow(row.key, 'unit', e.target.value)}
                  className="col-span-2 rounded-xl border border-border px-2 py-2 text-sm bg-surface-2 focus:outline-none focus:ring-2 focus:ring-primary-ring"
                >
                  {['g','kg','ml','l','pz','bustina','foglio'].map((u) => <option key={u} value={u}>{u}</option>)}
                </select>
                <input
                  type="number" step="0.0001" min="0" placeholder="€/u"
                  value={row.unitPrice}
                  onChange={(e) => updateRow(row.key, 'unitPrice', e.target.value)}
                  className="col-span-1 rounded-xl border border-border px-2 py-2 text-sm text-center font-mono focus:outline-none focus:ring-2 focus:ring-primary-ring"
                />
                {rows.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setRows((p) => p.filter((r) => r.key !== row.key))}
                    className="col-span-1 text-ink-faint hover:text-danger text-lg leading-none text-center"
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="flex gap-3">
          <Link href="/documents" className="flex-1 py-3 text-center rounded-xl border border-border text-sm font-semibold text-ink hover:bg-surface-offset">
            Annulla
          </Link>
          <SubmitButton
            pendingLabel="Registrazione…"
            className="flex-1 py-3 bg-primary text-primary-fg rounded-xl text-sm font-semibold hover:bg-primary-hover transition-colors"
          >
            Registra e verifica
          </SubmitButton>
        </div>
      </form>
    </div>
  );
}
