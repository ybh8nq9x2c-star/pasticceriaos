'use client';

// =============================================================================
// app/(main)/customers/new/NewCustomerOrderForm.tsx
// =============================================================================

import { useState } from 'react';
import { useFormState } from 'react-dom';
import Link from 'next/link';
import { IDLE_STATE } from '@/lib/utils';
import { createCustomerOrderAction } from '@/modules/customers/actions';
import { SubmitButton } from '@/components/ui/SubmitButton';

interface ItemRow {
  key: number;
  recipeId: string;
  description: string;
  quantity: string;
  unitPrice: string;
  notes: string;
}

let keyCounter = 0;
const fieldClass = 'w-full rounded-xl border border-border px-3 py-2.5 text-sm bg-surface-2 focus:outline-none focus:ring-2 focus:ring-primary-ring focus:border-primary';
const labelClass = 'block text-sm font-medium text-ink mb-1.5';

const EMPTY_ITEM = (): ItemRow => ({
  key: ++keyCounter, recipeId: '', description: '', quantity: '1', unitPrice: '', notes: '',
});

export function NewCustomerOrderForm({ recipes }: { recipes: { id: string; name: string }[] }) {
  const [state, formAction] = useFormState(createCustomerOrderAction, IDLE_STATE);
  const [items, setItems] = useState<ItemRow[]>([EMPTY_ITEM()]);

  function updateItem(key: number, field: keyof ItemRow, value: string) {
    setItems((p) => p.map((i) => {
      if (i.key !== key) return i;
      const updated = { ...i, [field]: value };
      // Selezionando una ricetta, la descrizione si precompila col nome reale.
      if (field === 'recipeId' && value) {
        const r = recipes.find((x) => x.id === value);
        if (r && !i.description) updated.description = r.name;
      }
      return updated;
    }));
  }

  function handleSubmit(formData: FormData) {
    formData.set('items', JSON.stringify(items.map((i) => ({
      recipeId:    i.recipeId,
      description: i.description,
      quantity:    i.quantity,
      unitPrice:   i.unitPrice,
      notes:       i.notes,
    }))));
    formAction(formData);
  }

  const total = items.reduce((s, i) => {
    const q = parseInt(i.quantity) || 0;
    const p = parseFloat(i.unitPrice.replace(',', '.')) || 0;
    return s + q * p;
  }, 0);

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <div className="mb-6">
        <Link href="/customers" className="text-sm text-ink-muted hover:text-ink transition-colors">
          ← Ordini clienti
        </Link>
        <h1 className="text-3xl font-bold text-ink mt-3">Nuovo ordine cliente</h1>
      </div>

      <form action={handleSubmit} className="space-y-6">
        {state.status === 'error' && (
          <div className="rounded-xl bg-danger-light border border-danger-soft p-3 text-sm text-danger">
            {state.error}
          </div>
        )}

        <div className="bg-surface-2 rounded-2xl border border-border p-6 space-y-5">
          <h2 className="text-base font-bold text-ink">Cliente e ritiro</h2>
          <div>
            <label className={labelClass}>Nome cliente <span className="text-danger">*</span></label>
            <input name="customerName" type="text" required maxLength={200} placeholder="es. Sig.ra Bianchi" className={fieldClass} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Telefono</label>
              <input name="customerPhone" type="tel" maxLength={50} className={fieldClass} />
            </div>
            <div>
              <label className={labelClass}>Email</label>
              <input name="customerEmail" type="email" className={fieldClass} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className={labelClass}>Data ritiro <span className="text-danger">*</span></label>
              <input name="pickupDate" type="date" required className={fieldClass} />
            </div>
            <div>
              <label className={labelClass}>Ora ritiro</label>
              <input name="pickupTime" type="time" className={fieldClass} />
            </div>
            <div>
              <label className={labelClass}>Acconto (€)</label>
              <input name="depositPaid" type="number" step="0.01" min={0} className={fieldClass} />
            </div>
          </div>
          <div>
            <label className={labelClass}>Note</label>
            <textarea name="notes" rows={2} maxLength={2000} placeholder="es. consegna al piano, scritta sulla torta…" className={`${fieldClass} resize-none`} />
          </div>
        </div>

        {/* Articoli */}
        <div className="bg-surface-2 rounded-2xl border border-border p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-bold text-ink">
              Articoli <span className="text-danger">*</span>
            </h2>
            <button
              type="button"
              onClick={() => setItems((p) => [...p, EMPTY_ITEM()])}
              className="text-xs font-semibold text-primary hover:underline"
            >
              + Aggiungi articolo
            </button>
          </div>

          <div className="space-y-4">
            {items.map((item, idx) => (
              <div key={item.key} className="rounded-xl border border-divider p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-ink-muted font-mono w-5">{idx + 1}</span>
                  <select
                    value={item.recipeId}
                    onChange={(e) => updateItem(item.key, 'recipeId', e.target.value)}
                    className="flex-1 rounded-lg border border-border px-2 py-2 text-sm bg-surface-2 focus:outline-none focus:ring-2 focus:ring-primary-ring"
                  >
                    <option value="">Fuori ricettario (torta custom)…</option>
                    {recipes.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </select>
                  <input
                    type="number" min="1" step="1"
                    value={item.quantity}
                    onChange={(e) => updateItem(item.key, 'quantity', e.target.value)}
                    className="w-16 rounded-lg border border-border px-2 py-2 text-sm text-center font-mono focus:outline-none focus:ring-2 focus:ring-primary-ring"
                  />
                  <input
                    type="number" step="0.01" min="0" placeholder="€/pz"
                    value={item.unitPrice}
                    onChange={(e) => updateItem(item.key, 'unitPrice', e.target.value)}
                    className="w-20 rounded-lg border border-border px-2 py-2 text-sm text-center font-mono focus:outline-none focus:ring-2 focus:ring-primary-ring"
                  />
                  {items.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setItems((p) => p.filter((i) => i.key !== item.key))}
                      className="text-ink-faint hover:text-danger text-lg leading-none"
                    >
                      ×
                    </button>
                  )}
                </div>
                <input
                  type="text"
                  placeholder="Descrizione (obbligatoria) — es. Torta mimosa 8 porzioni"
                  value={item.description}
                  onChange={(e) => updateItem(item.key, 'description', e.target.value)}
                  className="w-full rounded-lg border border-border px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-ring"
                />
                <input
                  type="text"
                  placeholder="Personalizzazioni (opz.) — es. senza lattosio"
                  value={item.notes}
                  onChange={(e) => updateItem(item.key, 'notes', e.target.value)}
                  className="w-full rounded-lg border border-border px-2 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary-ring"
                />
              </div>
            ))}
          </div>

          {total > 0 && (
            <div className="mt-4 pt-4 border-t border-divider flex justify-end text-sm">
              <span className="text-ink-muted">Totale:&nbsp;</span>
              <span className="font-mono font-semibold text-ink">
                {new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(total)}
              </span>
            </div>
          )}
        </div>

        <div className="flex gap-3">
          <Link href="/customers" className="flex-1 py-3 text-center rounded-xl border border-border text-sm font-semibold text-ink hover:bg-surface-offset">
            Annulla
          </Link>
          <SubmitButton
            pendingLabel="Salvataggio…"
            className="flex-1 py-3 bg-primary text-primary-fg rounded-xl text-sm font-semibold hover:bg-primary-hover transition-colors"
          >
            Registra ordine
          </SubmitButton>
        </div>
      </form>
    </div>
  );
}
