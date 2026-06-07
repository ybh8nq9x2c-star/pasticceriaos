'use client';
import { useFormState } from 'react-dom';

// =============================================================================
// app/(main)/inventory/movement/page.tsx
// Registra un movimento manuale di magazzino (Client Component).
// =============================================================================

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { IDLE_STATE } from '@/lib/utils';
import { recordMovementAction } from '@/modules/inventory/actions';

interface IngredientOption { id: string; name: string; unit: string }

const MOVEMENT_TYPES = [
  { value: 'purchase_receipt', label: 'Acquisto ricevuto' },
  { value: 'waste',             label: 'Scarico / Scarto' },
  { value: 'manual_adjustment', label: 'Rettifica manuale' },
  { value: 'initial_stock',     label: 'Stock iniziale' },
] as const;

const fieldClass = 'w-full rounded-xl border border-[#E5DDD0] px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#C9962A]/30 focus:border-[#C9962A] bg-white';
const labelClass = 'block text-sm font-medium text-[#1A2B4A] mb-1.5';

export default function MovementPage() {
  const router = useRouter();
  const [ingredients, setIngredients] = useState<IngredientOption[]>([]);
  const [movType, setMovType] = useState('purchase_receipt');

  const [state, formAction, pending] = useFormState(recordMovementAction, IDLE_STATE);

  useEffect(() => {
    fetch('/api/catalog/ingredients')
      .then((r) => r.ok ? r.json() : [])
      .then(setIngredients)
      .catch(() => []);
  }, []);

  useEffect(() => {
    if (state.status === 'success') router.push('/inventory');
  }, [state, router]);

  return (
    <div className="p-8 max-w-xl mx-auto">
      <div className="mb-6">
        <Link href="/inventory" className="text-sm text-[#6B7280] hover:text-[#1A2B4A] transition-colors">
          ← Magazzino
        </Link>
        <h1 className="font-playfair text-3xl font-bold text-[#1A2B4A] mt-3">Registra movimento</h1>
      </div>

      <form action={formAction} className="space-y-6">
        {state.status === 'error' && (
          <div className="rounded-xl bg-[#C0392B]/[0.06] border border-[#C0392B]/30 p-3 text-sm text-[#C0392B]">
            {state.error}
          </div>
        )}

        <div className="bg-white rounded-2xl border border-[#E5DDD0] p-6 space-y-5">
          <div>
            <label className={labelClass}>
              Tipo movimento <span className="text-[#C0392B]">*</span>
            </label>
            <select
              name="movementType"
              value={movType}
              onChange={(e) => setMovType(e.target.value)}
              className={fieldClass}
            >
              {MOVEMENT_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className={labelClass}>
              Ingrediente <span className="text-[#C0392B]">*</span>
            </label>
            <select name="ingredientProductId" required className={fieldClass}>
              <option value="">Seleziona ingrediente…</option>
              {ingredients.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name} ({i.unit})
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>
                Quantità <span className="text-[#C0392B]">*</span>
              </label>
              <input
                name="quantityDelta"
                type="number"
                step="0.001"
                required
                placeholder="0.00"
                className={`${fieldClass} font-mono`}
              />
            </div>
            <div>
              <label className={labelClass}>
                Unità <span className="text-[#C0392B]">*</span>
              </label>
              <select name="unit" className={fieldClass}>
                {['g','kg','ml','l','pz','bustina','foglio'].map((u) => (
                  <option key={u} value={u}>{u}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className={labelClass}>
              Note
              {movType === 'manual_adjustment'
                ? <span className="text-[#C0392B]"> *</span>
                : <span className="text-[#6B7280] font-normal text-xs"> (opz.)</span>
              }
            </label>
            <textarea
              name="notes"
              rows={2}
              maxLength={500}
              required={movType === 'manual_adjustment'}
              placeholder={movType === 'manual_adjustment' ? 'Motivo della rettifica (obbligatorio)' : ''}
              className={`${fieldClass} resize-none`}
            />
          </div>
        </div>

        <div className="flex gap-3">
          <Link
            href="/inventory"
            className="flex-1 py-3 text-center rounded-xl border border-[#E5DDD0] text-sm font-semibold text-[#1A2B4A] hover:bg-[#FAF7F2] transition-colors"
          >
            Annulla
          </Link>
          <button
            type="submit"
            disabled={pending}
            className="flex-1 py-3 bg-[#1A2B4A] text-white rounded-xl text-sm font-semibold hover:bg-[#243660] disabled:opacity-60 transition-colors"
          >
            {pending ? 'Registrazione…' : 'Registra movimento'}
          </button>
        </div>
      </form>
    </div>
  );
}
