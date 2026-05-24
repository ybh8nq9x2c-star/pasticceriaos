'use client';
import { useFormState } from 'react-dom';

// =============================================================================
// app/(main)/orders/new/page.tsx
// Crea un nuovo ordine d'acquisto (Client Component).
// =============================================================================

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { IDLE_STATE } from '@/lib/utils';
import { createOrderAction } from '@/modules/ordering/actions';

interface SupplierOption  { id: string; name: string; email: string }
interface IngredientOption { id: string; name: string; unit: string; unitPrice: number | null }
interface LineRow {
  key: number;
  ingredientProductId: string;
  quantity: string;
  unitSnapshot: string;
  unitPriceSnapshot: string;
}

let keyCounter = 0;

function today() {
  return new Date().toISOString().slice(0, 10);
}

export default function NewOrderPage() {
  const router = useRouter();
  const [suppliers,    setSuppliers]    = useState<SupplierOption[]>([]);
  const [ingredients,  setIngredients]  = useState<IngredientOption[]>([]);
  const [rows, setRows] = useState<LineRow[]>([
    { key: ++keyCounter, ingredientProductId: '', quantity: '', unitSnapshot: 'g', unitPriceSnapshot: '' },
  ]);

  const [state, formAction, pending] = useFormState(createOrderAction, IDLE_STATE);

  useEffect(() => {
    Promise.all([
      fetch('/api/catalog/suppliers').then((r) => r.ok ? r.json() : []),
      fetch('/api/catalog/ingredients').then((r) => r.ok ? r.json() : []),
    ]).then(([s, i]) => { setSuppliers(s); setIngredients(i); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (state.status === 'success') router.push('/orders');
  }, [state, router]);

  function addRow() {
    setRows((p) => [...p, { key: ++keyCounter, ingredientProductId: '', quantity: '', unitSnapshot: 'g', unitPriceSnapshot: '' }]);
  }

  function removeRow(key: number) {
    setRows((p) => p.filter((r) => r.key !== key));
  }

  function updateRow(key: number, field: keyof LineRow, value: string) {
    setRows((p) => p.map((r) => {
      if (r.key !== key) return r;
      const updated = { ...r, [field]: value };
      // Precompila unità e prezzo dall'ingrediente selezionato
      if (field === 'ingredientProductId') {
        const ing = ingredients.find((i) => i.id === value);
        if (ing) {
          updated.unitSnapshot = ing.unit;
          updated.unitPriceSnapshot = ing.unitPrice !== null ? String(ing.unitPrice) : '';
        }
      }
      return updated;
    }));
  }

  function handleSubmit(formData: FormData) {
    const lineItems = rows.map((r) => ({
      ingredientProductId: r.ingredientProductId,
      quantity:            r.quantity,
      unitSnapshot:        r.unitSnapshot,
      unitPriceSnapshot:   r.unitPriceSnapshot || '',
    }));
    formData.set('lineItems', JSON.stringify(lineItems));
    formAction(formData);
  }

  const lineTotal = rows.reduce((sum, r) => {
    const q = parseFloat(r.quantity) || 0;
    const p = parseFloat(r.unitPriceSnapshot) || 0;
    return q && p ? sum + q * p : sum;
  }, 0);

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <div className="mb-6">
        <Link href="/orders" className="text-sm text-[#6B7280] hover:text-[#1A2B4A] transition-colors">
          ← Ordini
        </Link>
        <h1 className="font-playfair text-3xl font-bold text-[#1A2B4A] mt-3">Nuovo ordine d'acquisto</h1>
      </div>

      <form action={handleSubmit} className="space-y-6">
        {state.status === 'error' && (
          <div className="rounded-xl bg-[#C0392B]/[0.06] border border-[#C0392B]/30 p-3 text-sm text-[#C0392B]">
            {state.error}
          </div>
        )}

        {/* Testata ordine */}
        <div className="bg-white rounded-2xl border border-[#E5DDD0] p-6 space-y-5">
          <h2 className="font-playfair text-base font-bold text-[#1A2B4A]">Dettagli ordine</h2>

          <div>
            <label className="block text-sm font-medium text-[#1A2B4A] mb-1.5">
              Fornitore <span className="text-[#C0392B]">*</span>
            </label>
            <select
              name="supplierId"
              required
              className="w-full rounded-xl border border-[#E5DDD0] px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#C9962A]/30 bg-white"
            >
              <option value="">Seleziona fornitore…</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-[#1A2B4A] mb-1.5">
                Data ordine <span className="text-[#C0392B]">*</span>
              </label>
              <input
                name="orderDate"
                type="date"
                required
                defaultValue={today()}
                className="w-full rounded-xl border border-[#E5DDD0] px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#C9962A]/30 focus:border-[#C9962A]"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-[#1A2B4A] mb-1.5">
                Consegna prevista <span className="text-[#6B7280] font-normal">(opz.)</span>
              </label>
              <input
                name="expectedDate"
                type="date"
                className="w-full rounded-xl border border-[#E5DDD0] px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#C9962A]/30 focus:border-[#C9962A]"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-[#1A2B4A] mb-1.5">
              Note <span className="text-[#6B7280] font-normal">(opz.)</span>
            </label>
            <textarea
              name="notes"
              rows={2}
              maxLength={2000}
              className="w-full rounded-xl border border-[#E5DDD0] px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#C9962A]/30 focus:border-[#C9962A] resize-none"
            />
          </div>
        </div>

        {/* Righe ordine */}
        <div className="bg-white rounded-2xl border border-[#E5DDD0] p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-playfair text-base font-bold text-[#1A2B4A]">
              Prodotti <span className="text-[#C0392B]">*</span>
            </h2>
            <button
              type="button"
              onClick={addRow}
              className="text-xs font-semibold text-[#C9962A] hover:underline"
            >
              + Aggiungi riga
            </button>
          </div>

          <div className="space-y-3">
            {rows.map((row, idx) => (
              <div key={row.key} className="grid grid-cols-12 gap-2 items-center">
                <span className="col-span-1 text-xs text-[#6B7280] text-center font-mono">{idx + 1}</span>

                {/* Ingrediente */}
                <select
                  value={row.ingredientProductId}
                  onChange={(e) => updateRow(row.key, 'ingredientProductId', e.target.value)}
                  className="col-span-5 rounded-xl border border-[#E5DDD0] px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C9962A]/30 bg-white"
                >
                  <option value="">Ingrediente…</option>
                  {ingredients.map((i) => (
                    <option key={i.id} value={i.id}>{i.name}</option>
                  ))}
                </select>

                {/* Quantità */}
                <input
                  type="number"
                  step="0.001"
                  min="0"
                  placeholder="Qtà"
                  value={row.quantity}
                  onChange={(e) => updateRow(row.key, 'quantity', e.target.value)}
                  className="col-span-2 rounded-xl border border-[#E5DDD0] px-2 py-2 text-sm text-center font-mono focus:outline-none focus:ring-2 focus:ring-[#C9962A]/30"
                />

                {/* Unità */}
                <select
                  value={row.unitSnapshot}
                  onChange={(e) => updateRow(row.key, 'unitSnapshot', e.target.value)}
                  className="col-span-2 rounded-xl border border-[#E5DDD0] px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C9962A]/30 bg-white"
                >
                  {['g','kg','ml','l','pz','bustina','foglio'].map((u) => (
                    <option key={u} value={u}>{u}</option>
                  ))}
                </select>

                {/* Prezzo unitario */}
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="€/u"
                  value={row.unitPriceSnapshot}
                  onChange={(e) => updateRow(row.key, 'unitPriceSnapshot', e.target.value)}
                  className="col-span-1 rounded-xl border border-[#E5DDD0] px-2 py-2 text-sm text-center font-mono focus:outline-none focus:ring-2 focus:ring-[#C9962A]/30"
                />

                {/* Rimuovi */}
                {rows.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeRow(row.key)}
                    className="col-span-1 text-[#E5DDD0] hover:text-[#C0392B] transition-colors text-lg leading-none text-center"
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
          </div>

          {/* Totale stimato */}
          {lineTotal > 0 && (
            <div className="mt-4 pt-4 border-t border-[#F0EBE1] flex justify-end">
              <span className="text-sm text-[#6B7280]">Totale stimato:&nbsp;</span>
              <span className="text-sm font-mono font-semibold text-[#1A2B4A]">
                {new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(lineTotal)}
              </span>
            </div>
          )}
        </div>

        <div className="flex gap-3">
          <Link
            href="/orders"
            className="flex-1 py-3 text-center rounded-xl border border-[#E5DDD0] text-sm font-semibold text-[#1A2B4A] hover:bg-[#FAF7F2]"
          >
            Annulla
          </Link>
          <button
            type="submit"
            disabled={pending}
            className="flex-1 py-3 bg-[#1A2B4A] text-white rounded-xl text-sm font-semibold hover:bg-[#243660] disabled:opacity-60 transition-colors"
          >
            {pending ? 'Creazione…' : 'Crea ordine'}
          </button>
        </div>
      </form>
    </div>
  );
}
