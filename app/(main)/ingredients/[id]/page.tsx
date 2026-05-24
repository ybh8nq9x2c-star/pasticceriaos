'use client';
import { useFormState } from 'react-dom';

// =============================================================================
// app/(main)/ingredients/[id]/page.tsx
// Dettaglio + modifica ingrediente (Client Component).
// =============================================================================

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { IDLE_STATE, UNIT_LABELS } from '@/lib/utils';
import { updateIngredientAction, deactivateIngredientAction } from '@/modules/catalog/actions';
import type { IngredientProduct } from '@/modules/catalog/types';
import type { UnitOfMeasure } from '@/lib/database.types';

const UNITS: UnitOfMeasure[] = ['g', 'kg', 'ml', 'l', 'pz', 'bustina', 'foglio'];
interface SupplierOption { id: string; name: string }

const fieldClass = 'w-full rounded-xl border border-[#E5DDD0] px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#C9962A]/30 focus:border-[#C9962A] bg-white';
const labelClass = 'block text-sm font-medium text-[#1A2B4A] mb-1.5';
const optClass   = 'text-[#6B7280] font-normal text-xs';

export default function IngredientDetailPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [ingredient, setIngredient] = useState<IngredientProduct | null>(null);
  const [suppliers, setSuppliers]   = useState<SupplierOption[]>([]);
  const [loading, setLoading]       = useState(true);
  const [confirming, setConfirming] = useState(false);

  const [state, formAction, pending] = useFormState(
    (prev: typeof IDLE_STATE, formData: FormData) =>
      updateIngredientAction(params.id, prev, formData),
    IDLE_STATE,
  );

  useEffect(() => {
    Promise.all([
      fetch(`/api/catalog/ingredients/${params.id}`).then((r) => r.ok ? r.json() : null),
      fetch('/api/catalog/suppliers').then((r) => r.ok ? r.json() : []),
    ]).then(([ing, sups]) => {
      setIngredient(ing);
      setSuppliers(sups);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [params.id]);

  useEffect(() => {
    if (state.status === 'success') router.push('/ingredients');
  }, [state, router]);

  async function handleDeactivate() {
    const res = await deactivateIngredientAction(params.id);
    if (res.status === 'success') router.push('/ingredients');
  }

  if (loading) {
    return (
      <div className="p-8 max-w-2xl mx-auto">
        <div className="h-8 w-40 rounded-xl bg-[#E5DDD0] animate-pulse mb-3" />
        <div className="h-48 rounded-2xl bg-[#E5DDD0] animate-pulse" />
      </div>
    );
  }

  if (!ingredient) {
    return (
      <div className="p-8 max-w-2xl mx-auto">
        <div className="bg-white rounded-2xl border border-[#E5DDD0] p-8 text-center">
          <p className="text-sm text-[#C0392B] mb-3">Ingrediente non trovato.</p>
          <Link href="/ingredients" className="text-sm font-semibold text-[#C9962A] hover:underline">
            ← Ingredienti
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <div className="mb-6">
        <Link href="/ingredients" className="text-sm text-[#6B7280] hover:text-[#1A2B4A] transition-colors">
          ← Ingredienti
        </Link>
        <div className="flex items-center justify-between mt-3">
          <h1 className="font-playfair text-3xl font-bold text-[#1A2B4A]">{ingredient.name}</h1>
          <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${ingredient.isActive ? 'bg-[#27AE60]/10 text-[#1E7E45]' : 'bg-[#6B7280]/10 text-[#6B7280]'}`}>
            {ingredient.isActive ? 'Attivo' : 'Inattivo'}
          </span>
        </div>
      </div>

      <form action={formAction} className="space-y-6">
        {state.status === 'error' && (
          <div className="rounded-xl bg-[#C0392B]/[0.06] border border-[#C0392B]/30 p-3 text-sm text-[#C0392B]">
            {state.error}
          </div>
        )}

        <div className="bg-white rounded-2xl border border-[#E5DDD0] p-6 space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>
                Nome <span className="text-[#C0392B]">*</span>
              </label>
              <input
                name="name"
                type="text"
                required
                maxLength={200}
                defaultValue={ingredient.name}
                className={fieldClass}
              />
            </div>
            <div>
              <label className={labelClass}>
                Unità <span className="text-[#C0392B]">*</span>
              </label>
              <select name="unit" defaultValue={ingredient.unit} className={fieldClass}>
                {UNITS.map((u) => (
                  <option key={u} value={u}>{UNIT_LABELS[u]}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>
                SKU / Codice <span className={optClass}>(opz.)</span>
              </label>
              <input
                name="sku"
                type="text"
                maxLength={100}
                defaultValue={ingredient.sku ?? ''}
                className={fieldClass}
              />
            </div>
            <div>
              <label className={labelClass}>
                Prezzo unitario (€) <span className={optClass}>(opz.)</span>
              </label>
              <input
                name="unitPrice"
                type="number"
                step="0.01"
                min="0"
                defaultValue={ingredient.unitPrice ?? ''}
                className={fieldClass}
              />
            </div>
          </div>

          <div>
            <label className={labelClass}>
              Fornitore <span className={optClass}>(opz.)</span>
            </label>
            <select
              name="supplierId"
              defaultValue={ingredient.supplierId ?? ''}
              className={fieldClass}
            >
              <option value="">— Nessun fornitore —</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className={labelClass}>
              Note <span className={optClass}>(opz.)</span>
            </label>
            <textarea
              name="notes"
              rows={2}
              maxLength={2000}
              defaultValue={ingredient.notes ?? ''}
              className={`${fieldClass} resize-none`}
            />
          </div>
        </div>

        <div className="flex gap-3">
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
            {pending ? 'Salvataggio…' : 'Salva modifiche'}
          </button>
        </div>
      </form>

      {ingredient.isActive && (
        <div className="mt-8 border border-[#C0392B]/30 rounded-2xl p-5">
          <h3 className="text-sm font-semibold text-[#C0392B] mb-1">Disattiva ingrediente</h3>
          <p className="text-xs text-[#6B7280] mb-4">
            L&apos;ingrediente verrà escluso da nuove ricette e ordini.
          </p>
          {!confirming ? (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="px-4 py-2 text-sm font-semibold text-[#C0392B] border border-[#C0392B]/40 rounded-xl hover:bg-[#C0392B]/[0.06] transition-colors"
            >
              Disattiva
            </button>
          ) : (
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="px-4 py-2 text-sm font-semibold text-[#1A2B4A] border border-[#E5DDD0] rounded-xl hover:bg-[#FAF7F2] transition-colors"
              >
                Annulla
              </button>
              <button
                type="button"
                onClick={handleDeactivate}
                className="px-4 py-2 text-sm font-semibold text-white bg-[#C0392B] rounded-xl hover:bg-[#A93226] transition-colors"
              >
                Conferma disattivazione
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
