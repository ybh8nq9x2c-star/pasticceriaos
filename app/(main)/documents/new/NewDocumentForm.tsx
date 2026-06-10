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
const fieldClass = 'w-full rounded-xl border border-[#E5DDD0] px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#C9962A]/30 focus:border-[#C9962A] bg-white';
const labelClass = 'block text-sm font-medium text-[#1A2B4A] mb-1.5';

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
  const [state, formAction, pending] = useFormState(createDocumentAction, IDLE_STATE);
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
        <Link href="/documents" className="text-sm text-[#6B7280] hover:text-[#1A2B4A] transition-colors">
          ← Documenti
        </Link>
        <h1 className="font-playfair text-3xl font-bold text-[#1A2B4A] mt-3">Registra documento</h1>
        <p className="text-sm text-[#6B7280] mt-1">
          Inserisci i dati del DDT o della fattura: il sistema li confronta con l'ordine.
        </p>
      </div>

      <form action={handleSubmit} className="space-y-6">
        {state.status === 'error' && (
          <div className="rounded-xl bg-[#C0392B]/[0.06] border border-[#C0392B]/30 p-3 text-sm text-[#C0392B]">
            {state.error}
          </div>
        )}

        <div className="bg-white rounded-2xl border border-[#E5DDD0] p-6 space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Tipo documento <span className="text-[#C0392B]">*</span></label>
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
              <label className={labelClass}>Fornitore <span className="text-[#C0392B]">*</span></label>
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
              <label className={labelClass}>Data documento <span className="text-[#C0392B]">*</span></label>
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
        </div>

        {/* Righe */}
        <div className="bg-white rounded-2xl border border-[#E5DDD0] p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-playfair text-base font-bold text-[#1A2B4A]">
              Righe documento <span className="text-[#C0392B]">*</span>
            </h2>
            <button
              type="button"
              onClick={() => setRows((p) => [...p, EMPTY_LINE()])}
              className="text-xs font-semibold text-[#C9962A] hover:underline"
            >
              + Aggiungi riga
            </button>
          </div>
          {prefillLines && prefillLines.length > 0 && (
            <p className="text-xs text-[#6B7280] mb-3 bg-[#FAF7F2] rounded-xl p-3">
              Righe precompilate dall'ordine: correggi quantità e prezzi con i valori
              REALI del documento — le differenze verranno rilevate come anomalie.
            </p>
          )}

          <div className="space-y-3">
            {rows.map((row, idx) => (
              <div key={row.key} className="grid grid-cols-12 gap-2 items-center">
                <span className="col-span-1 text-xs text-[#6B7280] text-center font-mono">{idx + 1}</span>
                <input
                  type="text"
                  placeholder="Descrizione"
                  value={row.description}
                  onChange={(e) => updateRow(row.key, 'description', e.target.value)}
                  className="col-span-5 rounded-xl border border-[#E5DDD0] px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C9962A]/30"
                />
                <input
                  type="number" step="0.001" min="0" placeholder="Qtà"
                  value={row.quantity}
                  onChange={(e) => updateRow(row.key, 'quantity', e.target.value)}
                  className="col-span-2 rounded-xl border border-[#E5DDD0] px-2 py-2 text-sm text-center font-mono focus:outline-none focus:ring-2 focus:ring-[#C9962A]/30"
                />
                <select
                  value={row.unit}
                  onChange={(e) => updateRow(row.key, 'unit', e.target.value)}
                  className="col-span-2 rounded-xl border border-[#E5DDD0] px-2 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#C9962A]/30"
                >
                  {['g','kg','ml','l','pz','bustina','foglio'].map((u) => <option key={u} value={u}>{u}</option>)}
                </select>
                <input
                  type="number" step="0.0001" min="0" placeholder="€/u"
                  value={row.unitPrice}
                  onChange={(e) => updateRow(row.key, 'unitPrice', e.target.value)}
                  className="col-span-1 rounded-xl border border-[#E5DDD0] px-2 py-2 text-sm text-center font-mono focus:outline-none focus:ring-2 focus:ring-[#C9962A]/30"
                />
                {rows.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setRows((p) => p.filter((r) => r.key !== row.key))}
                    className="col-span-1 text-[#E5DDD0] hover:text-[#C0392B] text-lg leading-none text-center"
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="flex gap-3">
          <Link href="/documents" className="flex-1 py-3 text-center rounded-xl border border-[#E5DDD0] text-sm font-semibold text-[#1A2B4A] hover:bg-[#FAF7F2]">
            Annulla
          </Link>
          <button
            type="submit"
            disabled={pending}
            className="flex-1 py-3 bg-[#1A2B4A] text-white rounded-xl text-sm font-semibold hover:bg-[#243660] disabled:opacity-60 transition-colors"
          >
            {pending ? 'Registrazione…' : 'Registra e verifica'}
          </button>
        </div>
      </form>
    </div>
  );
}
