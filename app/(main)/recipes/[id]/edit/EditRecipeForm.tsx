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
import { SubmitButton } from '@/components/ui/SubmitButton';

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

const fieldClass = 'w-full rounded-xl border border-border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-ring focus:border-primary bg-surface-2';
const labelClass = 'block text-sm font-medium text-ink mb-1.5';

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
  const [state, formAction] = useFormState(boundAction, IDLE_STATE);

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
        <Link href={`/recipes/${recipe.id}`} className="text-sm text-ink-muted hover:text-ink transition-colors">
          ← {recipe.name}
        </Link>
        <h1 className="text-3xl font-bold text-ink mt-3">Modifica ricetta</h1>
      </div>

      <form action={handleSubmit} className="space-y-6">
        {state.status === 'error' && (
          <div className="rounded-xl bg-danger-light border border-danger-soft p-3 text-sm text-danger">
            {state.error}
          </div>
        )}

        {/* Dati ricetta */}
        <div className="bg-surface-2 rounded-2xl border border-border p-6 space-y-5">
          <h2 className="text-base font-bold text-ink">Dettagli ricetta</h2>

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
                Nome <span className="text-danger">*</span>
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
                Categoria <span className="text-ink-muted font-normal text-xs">(opz.)</span>
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
                Porzioni base <span className="text-danger">*</span>
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
              <span className="text-ink-muted font-normal text-xs">(opz. — abilita il margine nel food cost)</span>
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
              Note <span className="text-ink-muted font-normal text-xs">(opz.)</span>
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
        <div className="bg-surface-2 rounded-2xl border border-border p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-bold text-ink">
              Ingredienti <span className="text-danger">*</span>
            </h2>
            <button
              type="button"
              onClick={addRow}
              className="text-xs font-semibold text-primary hover:underline"
            >
              + Aggiungi riga
            </button>
          </div>

          <div className="space-y-3">
            {rows.map((row, idx) => (
              <div key={row.key} className="flex gap-2 items-center">
                <span className="text-xs text-ink-muted w-5 text-center font-mono">{idx + 1}</span>

                <select
                  value={row.ingredientProductId}
                  onChange={(e) => updateRow(row.key, 'ingredientProductId', e.target.value)}
                  className="flex-1 rounded-xl border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-ring bg-surface-2"
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
                  className="w-20 rounded-xl border border-border px-3 py-2 text-sm text-center font-mono focus:outline-none focus:ring-2 focus:ring-primary-ring"
                />

                <select
                  value={row.unit}
                  onChange={(e) => updateRow(row.key, 'unit', e.target.value)}
                  className="w-24 rounded-xl border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-ring bg-surface-2"
                >
                  {UNITS.map((u) => (
                    <option key={u} value={u}>{u}</option>
                  ))}
                </select>

                {rows.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeRow(row.key)}
                    className="text-ink-faint hover:text-danger transition-colors text-lg leading-none"
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
            className="flex-1 py-3 text-center rounded-xl border border-border text-sm font-semibold text-ink hover:bg-surface-offset transition-colors"
          >
            Annulla
          </Link>
          <SubmitButton
            pendingLabel="Salvataggio…"
            className="flex-1 py-3 bg-primary text-primary-fg rounded-xl text-sm font-semibold hover:bg-primary-hover transition-colors"
          >
            Salva modifiche
          </SubmitButton>
        </div>
      </form>
    </div>
  );
}
