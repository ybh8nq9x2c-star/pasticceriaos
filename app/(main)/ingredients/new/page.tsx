'use client';
import { useFormState } from 'react-dom';

// =============================================================================
// app/(main)/ingredients/new/page.tsx
// Form creazione ingrediente. Carica fornitori via fetch client-side.
// =============================================================================

import Link from 'next/link';
import { IDLE_STATE } from '@/lib/utils';
import { createIngredientAction } from '@/modules/catalog/actions';

// Stile campo condiviso
const fieldClass = 'w-full rounded-xl border border-[#E5DDD0] px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#C9962A]/30 focus:border-[#C9962A] bg-white';
const labelClass = 'block text-sm font-medium text-[#1A2B4A] mb-1.5';
const optClass   = 'text-[#6B7280] font-normal text-xs';

const UNITS = [
  { value: 'g',       label: 'Grammi (g)' },
  { value: 'kg',      label: 'Chilogrammi (kg)' },
  { value: 'ml',      label: 'Millilitri (ml)' },
  { value: 'l',       label: 'Litri (l)' },
  { value: 'pz',      label: 'Pezzi (pz)' },
  { value: 'bustina', label: 'Bustine' },
  { value: 'foglio',  label: 'Fogli' },
] as const;

export default function NewIngredientPage() {
  const [state, formAction, pending] = useFormState(createIngredientAction, IDLE_STATE);

  return (
    <div className="p-8 max-w-xl mx-auto">
      <div className="mb-6">
        <Link href="/ingredients" className="text-sm text-[#6B7280] hover:text-[#1A2B4A] transition-colors">
          ← Ingredienti
        </Link>
        <h1 className="font-playfair text-3xl font-bold text-[#1A2B4A] mt-3">Nuovo ingrediente</h1>
      </div>

      <div className="bg-white rounded-2xl border border-[#E5DDD0] p-6">
        <form action={formAction} className="space-y-5">
          {state.status === 'error' && (
            <div className="rounded-xl bg-[#C0392B]/[0.06] border border-[#C0392B]/30 p-3 text-sm text-[#C0392B]">
              {state.error}
            </div>
          )}
          {state.status === 'success' && (
            <div className="rounded-xl bg-[#27AE60]/[0.06] border border-[#27AE60]/30 p-3 text-sm text-[#1E7E45]">
              {state.message}
            </div>
          )}

          <div>
            <label className={labelClass}>
              Nome <span className="text-[#C0392B]">*</span>
            </label>
            <input
              name="name"
              type="text"
              required
              maxLength={200}
              placeholder="es. Farina 00"
              className={fieldClass}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>
                Unità di misura <span className="text-[#C0392B]">*</span>
              </label>
              <select name="unit" required className={fieldClass}>
                <option value="">Seleziona…</option>
                {UNITS.map((u) => (
                  <option key={u.value} value={u.value}>{u.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className={labelClass}>
                SKU <span className={optClass}>(opz.)</span>
              </label>
              <input
                name="sku"
                type="text"
                maxLength={50}
                placeholder="es. FAR001"
                className={fieldClass}
              />
            </div>
          </div>

          <div>
            <label className={labelClass}>
              Prezzo per unità (€) <span className={optClass}>(opz.)</span>
            </label>
            <input
              name="unitPrice"
              type="text"
              inputMode="decimal"
              placeholder="es. 1,25"
              className={fieldClass}
            />
          </div>

          <div>
            <label className={labelClass}>
              Note <span className={optClass}>(opz.)</span>
            </label>
            <textarea
              name="notes"
              rows={2}
              maxLength={1000}
              placeholder="Eventuali note sull'ingrediente…"
              className={`${fieldClass} resize-none`}
            />
          </div>

          <div className="flex gap-3 pt-1">
            <Link
              href="/ingredients"
              className="flex-1 py-3 text-center rounded-xl border border-[#E5DDD0] text-sm font-semibold text-[#1A2B4A] hover:bg-[#FAF7F2] transition-colors"
            >
              Annulla
            </Link>
            <button
              type="submit"
              disabled={pending}
              className="flex-1 py-3 bg-[#1A2B4A] text-white rounded-xl text-sm font-semibold hover:bg-[#243660] disabled:opacity-60 transition-colors"
            >
              {pending ? 'Salvataggio…' : 'Salva ingrediente'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
