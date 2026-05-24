'use client';
import { useFormState } from 'react-dom';

// =============================================================================
// app/(main)/recipes/new/page.tsx
// Form creazione ricetta con riga ingredienti dinamica (client component).
// =============================================================================

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { IDLE_STATE } from '@/lib/utils';
import { createRecipeAction } from '@/modules/catalog/actions';

const UNITS = ['g', 'kg', 'ml', 'l', 'pz', 'bustina', 'foglio'] as const;

interface IngredientRow {
  key: number;
  ingredientProductId: string;
  quantity: string;
  unit: string;
}

interface IngredientOption {
  id: string;
  name: string;
  unit: string;
}

let keyCounter = 0;

// Stile condiviso per campi
const fieldClass = 'w-full rounded-xl border border-[#E5DDD0] px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#C9962A]/30 focus:border-[#C9962A] bg-white';
const labelClass = 'block text-sm font-medium text-[#1A2B4A] mb-1.5';

export default function NewRecipePage() {
  const [state, formAction, pending] = useFormState(createRecipeAction, IDLE_STATE);
  const [rows, setRows] = useState<IngredientRow[]>([
    { key: ++keyCounter, ingredientProductId: '', quantity: '', unit: 'g' },
  ]);
  const [ingredientOptions, setIngredientOptions] = useState<IngredientOption[]>([]);

  useEffect(() => {
    fetch('/api/catalog/ingredients')
      .then((r) => r.ok ? r.json() : [])
      .then((data) => setIngredientOptions(data))
      .catch(() => setIngredientOptions([]));
  }, []);

  function addRow() {
    setRows((prev) => [
      ...prev,
      { key: ++keyCounter, ingredientProductId: '', quantity: '', unit: 'g' },
    ]);
  }

  function removeRow(key: number) {
    setRows((prev) => prev.filter((r) => r.key !== key));
  }

  function updateRow(key: number, field: keyof IngredientRow, value: string) {
    setRows((prev) =>
      prev.map((r) => (r.key === key ? { ...r, [field]: value } : r)),
    );
  }

  function handleSubmit(formData: FormData) {
    const ingredients = rows.map((r, idx) => ({
      ingredientProductId: r.ingredientProductId,
      quantity:            r.quantity,
      unit:                r.unit,
      sortOrder:           idx,
    }));
    formData.set('ingredients', JSON.stringify(ingredients));
    formAction(formData);
  }

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <div className="mb-6">
        <Link href="/recipes" className="text-sm text-[#6B7280] hover:text-[#1A2B4A] transition-colors">
          ← Ricette
        </Link>
        <h1 className="font-playfair text-3xl font-bold text-[#1A2B4A] mt-3">Nuova ricetta</h1>
      </div>

      <form action={handleSubmit} className="space-y-6">
        {state.status === 'error' && (
          <div className="rounded-xl bg-[#C0392B]/[0.06] border border-[#C0392B]/30 p-3 text-sm text-[#C0392B]">
            {state.error}
          </div>
        )}

        {/* Dati ricetta */}
        <div className="bg-white rounded-2xl border border-[#E5DDD0] p-6 space-y-5">
          <h2 className="font-playfair text-base font-bold text-[#1A2B4A]">Dettagli ricetta</h2>

          <div className="grid grid-cols-6 gap-4">
            <div className="col-span-1">
              <label className={labelClass}>Emoji</label>
              <input
                name="emoji"
                type="text"
                maxLength={10}
                placeholder="🎂"
                className={`${fieldClass} text-center`}
              />
            </div>
            <div className="col-span-5">
              <label className={labelClass}>
                Nome <span className="text-[#C0392B]">*</span>
              </label>
              <input
                name="name"
                type="text"
                required
                maxLength={200}
                placeholder="es. Torta Margherita"
                className={fieldClass}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>
                Categoria <span className="text-[#6B7280] font-normal text-xs">(opz.)</span>
              </label>
              <input
                name="category"
                type="text"
                maxLength={100}
                placeholder="es. Torte, Croissant…"
                className={fieldClass}
              />
            </div>
            <div>
              <label className={labelClass}>
                Porzioni base <span className="text-[#C0392B]">*</span>
              </label>
              <input
                name="basePortions"
                type="number"
                required
                min={1}
                defaultValue={1}
                className={fieldClass}
              />
            </div>
          </div>

          <div>
            <label className={labelClass}>
              Note <span className="text-[#6B7280] font-normal text-xs">(opz.)</span>
            </label>
            <textarea
              name="notes"
              rows={2}
              maxLength={2000}
              className={`${fieldClass} resize-none`}
            />
          </div>
        </div>

        {/* Ingredienti */}
        <div className="bg-white rounded-2xl border border-[#E5DDD0] p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-playfair text-base font-bold text-[#1A2B4A]">
              Ingredienti <span className="text-[#C0392B]">*</span>
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
              <div key={row.key} className="flex gap-2 items-center">
                <span className="text-xs text-[#6B7280] w-5 text-center font-mono">{idx + 1}</span>

                <select
                  value={row.ingredientProductId}
                  onChange={(e) => updateRow(row.key, 'ingredientProductId', e.target.value)}
                  className="flex-1 rounded-xl border border-[#E5DDD0] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C9962A]/30 bg-white"
                >
                  <option value="">Seleziona ingrediente…</option>
                  {ingredientOptions.map((o) => (
                    <option key={o.id} value={o.id}>{o.name}</option>
                  ))}
                </select>

                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="Qtà"
                  value={row.quantity}
                  onChange={(e) => updateRow(row.key, 'quantity', e.target.value)}
                  className="w-20 rounded-xl border border-[#E5DDD0] px-3 py-2 text-sm text-center font-mono focus:outline-none focus:ring-2 focus:ring-[#C9962A]/30"
                />

                <select
                  value={row.unit}
                  onChange={(e) => updateRow(row.key, 'unit', e.target.value)}
                  className="w-24 rounded-xl border border-[#E5DDD0] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C9962A]/30 bg-white"
                >
                  {UNITS.map((u) => (
                    <option key={u} value={u}>{u}</option>
                  ))}
                </select>

                {rows.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeRow(row.key)}
                    className="text-[#E5DDD0] hover:text-[#C0392B] transition-colors text-lg leading-none"
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
          </div>

          {ingredientOptions.length === 0 && (
            <p className="mt-4 text-xs text-[#8A6418] bg-[#C9962A]/[0.08] border border-[#C9962A]/30 rounded-xl p-3">
              Nessun ingrediente disponibile.{' '}
              <Link href="/ingredients/new" className="underline font-semibold">
                Aggiungi ingredienti
              </Link>{' '}
              prima di creare una ricetta.
            </p>
          )}
        </div>

        <div className="flex gap-3">
          <Link
            href="/recipes"
            className="flex-1 py-3 text-center rounded-xl border border-[#E5DDD0] text-sm font-semibold text-[#1A2B4A] hover:bg-[#FAF7F2] transition-colors"
          >
            Annulla
          </Link>
          <button
            type="submit"
            disabled={pending}
            className="flex-1 py-3 bg-[#1A2B4A] text-white rounded-xl text-sm font-semibold hover:bg-[#243660] disabled:opacity-60 transition-colors"
          >
            {pending ? 'Salvataggio…' : 'Salva ricetta'}
          </button>
        </div>
      </form>
    </div>
  );
}
