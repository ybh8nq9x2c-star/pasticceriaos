'use client';

// =============================================================================
// app/(main)/recipes/[id]/edit/EditRecipeForm.tsx
// Form modifica ricetta (client). Dati iniziali reali dal server component.
// =============================================================================

import { useEffect, useState } from 'react';
import { useFormState } from 'react-dom';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { IDLE_STATE, type ActionState } from '@/lib/utils';
import { updateRecipeAction } from '@/modules/catalog/actions';

const UNITS = ['g', 'kg', 'ml', 'l', 'pz', 'bustina', 'foglio'] as const;

interface IngredientRow {
  key: number;
  ingredientProductId: string;
  quantity: string;
  unit: string;
}

interface IngredientOption { id: string; name: string; unit: string }

export interface EditableRecipe {
  id: string;
  name: string;
  category: string | null;
  emoji: string | null;
  basePortions: number;
  sellPricePerPortion: number | null;
  notes: string | null;
  isActive: boolean;
  ingredients: { ingredientProductId: string; quantity: string; unit: string }[];
}

let keyCounter = 0;

const fieldClass = 'w-full rounded-xl border border-[#E5DDD0] px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#C9962A]/30 focus:border-[#C9962A] bg-white';
const labelClass = 'block text-sm font-medium text-[#1A2B4A] mb-1.5';

export function EditRecipeForm({
  recipe,
  ingredientOptions,
}: {
  recipe: EditableRecipe;
  ingredientOptions: IngredientOption[];
}) {
  const router = useRouter();
  const boundAction = updateRecipeAction.bind(null, recipe.id) as (
    prev: ActionState,
    formData: FormData,
  ) => Promise<ActionState>;
  const [state, formAction, pending] = useFormState(boundAction, IDLE_STATE);

  const [rows, setRows] = useState<IngredientRow[]>(
    recipe.ingredients.length > 0
      ? recipe.ingredients.map((i) => ({ ...i, key: ++keyCounter }))
      : [{ key: ++keyCounter, ingredientProductId: '', quantity: '', unit: 'g' }],
  );

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
    formData.set('isActive', String(recipe.isActive));
    formAction(formData);
  }

  useEffect(() => {
    if (state.status === 'success') router.push(`/recipes/${recipe.id}`);
  }, [state, router, recipe.id]);

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <div className="mb-6">
        <Link href={`/recipes/${recipe.id}`} className="text-sm text-[#6B7280] hover:text-[#1A2B4A] transition-colors">
          ← {recipe.name}
        </Link>
        <h1 className="font-playfair text-3xl font-bold text-[#1A2B4A] mt-3">Modifica ricetta</h1>
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
                defaultValue={recipe.emoji ?? ''}
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
                defaultValue={recipe.name}
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
                defaultValue={recipe.category ?? ''}
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
                defaultValue={recipe.basePortions}
                className={fieldClass}
              />
            </div>
          </div>

          <div>
            <label className={labelClass}>
              Prezzo di vendita per porzione (€){' '}
              <span className="text-[#6B7280] font-normal text-xs">(opz. — abilita il margine nel food cost)</span>
            </label>
            <input
              name="sellPricePerPortion"
              type="number"
              step="0.01"
              min={0}
              defaultValue={recipe.sellPricePerPortion ?? ''}
              placeholder="es. 4,50"
              className={fieldClass}
            />
          </div>

          <div>
            <label className={labelClass}>
              Note <span className="text-[#6B7280] font-normal text-xs">(opz.)</span>
            </label>
            <textarea
              name="notes"
              rows={2}
              maxLength={2000}
              defaultValue={recipe.notes ?? ''}
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
        </div>

        <div className="flex gap-3">
          <Link
            href={`/recipes/${recipe.id}`}
            className="flex-1 py-3 text-center rounded-xl border border-[#E5DDD0] text-sm font-semibold text-[#1A2B4A] hover:bg-[#FAF7F2] transition-colors"
          >
            Annulla
          </Link>
          <button
            type="submit"
            disabled={pending}
            className="flex-1 py-3 bg-[#1A2B4A] text-white rounded-xl text-sm font-semibold hover:bg-[#243660] disabled:opacity-60 transition-colors"
          >
            {pending ? 'Salvataggio…' : 'Salva modifiche'}
          </button>
        </div>
      </form>
    </div>
  );
}
