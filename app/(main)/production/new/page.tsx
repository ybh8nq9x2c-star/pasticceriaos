'use client';
import { useFormState } from 'react-dom';

// =============================================================================
// app/(main)/production/new/page.tsx
// Crea un nuovo piano di produzione con righe ricette (Client Component).
// =============================================================================

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { IDLE_STATE } from '@/lib/utils';
import { createPlanAction } from '@/modules/production/actions';

interface RecipeOption { id: string; name: string; emoji: string | null; basePortions: number }
interface PlanRow { key: number; recipeId: string; batchCount: string; notes: string }

let keyCounter = 0;

function today() {
  return new Date().toISOString().slice(0, 10);
}

export default function NewProductionPage() {
  const router = useRouter();
  const [recipes, setRecipes] = useState<RecipeOption[]>([]);
  const [rows, setRows] = useState<PlanRow[]>([
    { key: ++keyCounter, recipeId: '', batchCount: '1', notes: '' },
  ]);

  const [state, formAction, pending] = useFormState(createPlanAction, IDLE_STATE);

  useEffect(() => {
    fetch('/api/catalog/recipes')
      .then((r) => r.ok ? r.json() : [])
      .then(setRecipes)
      .catch(() => []);
  }, []);

  useEffect(() => {
    if (state.status === 'success') router.push('/production');
  }, [state, router]);

  function addRow() {
    setRows((p) => [...p, { key: ++keyCounter, recipeId: '', batchCount: '1', notes: '' }]);
  }

  function removeRow(key: number) {
    setRows((p) => p.filter((r) => r.key !== key));
  }

  function updateRow(key: number, field: keyof PlanRow, value: string) {
    setRows((p) => p.map((r) => r.key === key ? { ...r, [field]: value } : r));
  }

  function handleSubmit(formData: FormData) {
    const items = rows.map((r, i) => ({
      recipeId:   r.recipeId,
      batchCount: Number(r.batchCount) || 1,
      notes:      r.notes || null,
      sortOrder:  i,
    }));
    formData.set('items', JSON.stringify(items));
    formAction(formData);
  }

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <div className="mb-6">
        <Link href="/production" className="text-sm text-[#6B7280] hover:text-[#1A2B4A] transition-colors">
          ← Produzione
        </Link>
        <h1 className="font-playfair text-3xl font-bold text-[#1A2B4A] mt-3">Nuovo piano di produzione</h1>
      </div>

      <form action={handleSubmit} className="space-y-6">
        {state.status === 'error' && (
          <div className="rounded-xl bg-[#C0392B]/[0.06] border border-[#C0392B]/30 p-3 text-sm text-[#C0392B]">
            {state.error}
          </div>
        )}

        {/* Dati piano */}
        <div className="bg-white rounded-2xl border border-[#E5DDD0] p-6 space-y-5">
          <h2 className="font-playfair text-base font-bold text-[#1A2B4A]">Dettagli piano</h2>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-[#1A2B4A] mb-1.5">
                Data produzione <span className="text-[#C0392B]">*</span>
              </label>
              <input
                name="planDate"
                type="date"
                required
                defaultValue={today()}
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

        {/* Ricette nel piano */}
        <div className="bg-white rounded-2xl border border-[#E5DDD0] p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-playfair text-base font-bold text-[#1A2B4A]">
              Ricette <span className="text-[#C0392B]">*</span>
            </h2>
            <button
              type="button"
              onClick={addRow}
              className="text-xs font-semibold text-[#C9962A] hover:underline"
            >
              + Aggiungi ricetta
            </button>
          </div>

          <div className="space-y-3">
            {rows.map((row, idx) => {
              const recipe = recipes.find((r) => r.id === row.recipeId);
              const totalPortions = recipe ? recipe.basePortions * (parseInt(row.batchCount) || 0) : null;
              return (
                <div key={row.key} className="flex gap-2 items-center">
                  <span className="text-xs text-[#6B7280] w-5 text-center font-mono">{idx + 1}</span>

                  <select
                    value={row.recipeId}
                    onChange={(e) => updateRow(row.key, 'recipeId', e.target.value)}
                    className="flex-1 rounded-xl border border-[#E5DDD0] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C9962A]/30 bg-white"
                  >
                    <option value="">Seleziona ricetta…</option>
                    {recipes.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.emoji ?? '📖'} {r.name}
                      </option>
                    ))}
                  </select>

                  <div className="flex flex-col items-center">
                    <input
                      type="number"
                      min={1}
                      value={row.batchCount}
                      onChange={(e) => updateRow(row.key, 'batchCount', e.target.value)}
                      className="w-16 rounded-xl border border-[#E5DDD0] px-2 py-2 text-sm text-center font-mono focus:outline-none focus:ring-2 focus:ring-[#C9962A]/30"
                    />
                    {totalPortions !== null && (
                      <span className="text-xs text-[#6B7280] mt-0.5 font-mono">{totalPortions} pz</span>
                    )}
                  </div>

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
              );
            })}
          </div>

          {recipes.length === 0 && (
            <p className="mt-3 text-xs text-[#8A6418] bg-[#C9962A]/[0.1] rounded-xl p-3">
              Nessuna ricetta disponibile.{' '}
              <Link href="/recipes/new" className="underline">Crea una ricetta</Link>{' '}
              prima di pianificare.
            </p>
          )}
        </div>

        <div className="flex gap-3">
          <Link
            href="/production"
            className="flex-1 py-3 text-center rounded-xl border border-[#E5DDD0] text-sm font-semibold text-[#1A2B4A] hover:bg-[#FAF7F2]"
          >
            Annulla
          </Link>
          <button
            type="submit"
            disabled={pending}
            className="flex-1 py-3 bg-[#1A2B4A] text-white rounded-xl text-sm font-semibold hover:bg-[#243660] disabled:opacity-60 transition-colors"
          >
            {pending ? 'Creazione…' : 'Crea piano'}
          </button>
        </div>
      </form>
    </div>
  );
}
