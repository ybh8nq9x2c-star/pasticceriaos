'use client';

// =============================================================================
// app/(main)/ingredients/[id]/IngredientEditForm.tsx
// Modifica ingrediente + rettifica stock. Tutti i dati (ingrediente, fornitori,
// giacenza, permessi) arrivano dal SERVER via props (P0-1).
// =============================================================================

import { useEffect, useState } from 'react';
import { useFormState } from 'react-dom';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { IDLE_STATE, UNIT_LABELS } from '@/lib/utils';
import { updateIngredientAction, deactivateIngredientAction } from '@/modules/catalog/actions';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { StockAdjustPanel } from '@/components/inventory/StockAdjustPanel';
import type { IngredientProduct } from '@/modules/catalog/types';
import type { UnitOfMeasure } from '@/lib/database.types';

const UNITS: UnitOfMeasure[] = ['g', 'kg', 'ml', 'l', 'pz', 'bustina', 'foglio'];
export interface SupplierOption { id: string; name: string; email?: string | null }

const fieldClass = 'w-full rounded-xl border border-border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-ring focus:border-primary bg-surface-2';
const labelClass = 'block text-sm font-medium text-ink mb-1.5';
const optClass   = 'text-ink-muted font-normal text-xs';

export function IngredientEditForm({
  ingredient,
  suppliers,
  currentQuantity,
  canAdjust,
}: {
  ingredient: IngredientProduct;
  suppliers: SupplierOption[];
  currentQuantity: number;
  canAdjust: boolean;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);

  const [state, formAction] = useFormState(
    (prev: typeof IDLE_STATE, formData: FormData) =>
      updateIngredientAction(ingredient.id, prev, formData),
    IDLE_STATE,
  );

  useEffect(() => {
    if (state.status === 'success') router.push('/ingredients');
  }, [state, router]);

  async function handleDeactivate() {
    const res = await deactivateIngredientAction(ingredient.id);
    if (res.status === 'success') router.push('/ingredients');
  }

  return (
    <>
      <form action={formAction} className="space-y-6">
        {state.status === 'error' && (
          <div className="rounded-xl bg-danger-light border border-danger-soft p-3 text-sm text-danger">
            {state.error}
          </div>
        )}

        <div className="bg-surface-2 rounded-2xl border border-border p-6 space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>
                Nome <span className="text-danger">*</span>
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
                Unità <span className="text-danger">*</span>
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
                <option key={s.id} value={s.id}>{s.email ? `${s.name} — ${s.email}` : s.name}</option>
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

      {/* Ancora #rettifica: gli alert magazzino linkano qui (alert → correzione). */}
      <div id="rettifica" className="scroll-mt-8">
        <StockAdjustPanel
          ingredientId={ingredient.id}
          ingredientName={ingredient.name}
          unit={ingredient.unit}
          initialQuantity={currentQuantity}
          canAdjust={canAdjust}
        />
      </div>

      {ingredient.isActive && (
        <div className="mt-8 border border-danger-soft rounded-2xl p-5">
          <h3 className="text-sm font-semibold text-danger mb-1">Disattiva ingrediente</h3>
          <p className="text-xs text-ink-muted mb-4">
            L&apos;ingrediente verrà escluso da nuove ricette e ordini.
          </p>
          {!confirming ? (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="px-4 py-2 text-sm font-semibold text-danger border border-danger-soft rounded-xl hover:bg-danger-light transition-colors"
            >
              Disattiva
            </button>
          ) : (
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="px-4 py-2 text-sm font-semibold text-ink border border-border rounded-xl hover:bg-surface-offset transition-colors"
              >
                Annulla
              </button>
              <button
                type="button"
                onClick={handleDeactivate}
                className="px-4 py-2 text-sm font-semibold text-white bg-danger rounded-xl hover:bg-danger-hover transition-colors"
              >
                Conferma disattivazione
              </button>
            </div>
          )}
        </div>
      )}
    </>
  );
}
