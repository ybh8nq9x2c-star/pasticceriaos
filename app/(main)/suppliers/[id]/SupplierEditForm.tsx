'use client';

// =============================================================================
// app/(main)/suppliers/[id]/SupplierEditForm.tsx
// Modifica fornitore: il dato arriva dal SERVER via props (P0-1).
// =============================================================================

import { useEffect, useState } from 'react';
import { useFormState } from 'react-dom';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { IDLE_STATE } from '@/lib/utils';
import { updateSupplierAction, deactivateSupplierAction } from '@/modules/catalog/actions';
import { SubmitButton } from '@/components/ui/SubmitButton';
import type { Supplier } from '@/modules/catalog/types';

const fieldClass = 'w-full rounded-xl border border-border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-ring focus:border-primary bg-surface-2';
const labelClass = 'block text-sm font-medium text-ink mb-1.5';
const optClass   = 'text-ink-muted font-normal text-xs';

export function SupplierEditForm({ supplier }: { supplier: Supplier }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);

  const [state, formAction] = useFormState(
    (prev: typeof IDLE_STATE, formData: FormData) =>
      updateSupplierAction(supplier.id, prev, formData),
    IDLE_STATE,
  );

  useEffect(() => {
    if (state.status === 'success') router.push('/suppliers');
  }, [state, router]);

  async function handleDeactivate() {
    const res = await deactivateSupplierAction(supplier.id);
    if (res.status === 'success') router.push('/suppliers');
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
          <div>
            <label className={labelClass}>
              Nome <span className="text-danger">*</span>
            </label>
            <input
              name="name"
              type="text"
              required
              maxLength={200}
              defaultValue={supplier.name}
              className={fieldClass}
            />
          </div>

          <div>
            <label className={labelClass}>
              Email <span className="text-danger">*</span>
            </label>
            <input
              name="email"
              type="email"
              required
              maxLength={200}
              defaultValue={supplier.email}
              className={fieldClass}
            />
          </div>

          <div>
            <label className={labelClass}>
              Telefono <span className={optClass}>(opz.)</span>
            </label>
            <input
              name="phone"
              type="tel"
              maxLength={50}
              defaultValue={supplier.phone ?? ''}
              className={fieldClass}
            />
          </div>

          <div>
            <label className={labelClass}>
              Note <span className={optClass}>(opz.)</span>
            </label>
            <textarea
              name="notes"
              rows={3}
              maxLength={2000}
              defaultValue={supplier.notes ?? ''}
              className={`${fieldClass} resize-none`}
            />
          </div>
        </div>

        <div className="flex gap-3">
          <Link
            href="/suppliers"
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

      {supplier.isActive && (
        <div className="mt-8 border border-danger-soft rounded-2xl p-5">
          <h3 className="text-sm font-semibold text-danger mb-1">Disattiva fornitore</h3>
          <p className="text-xs text-ink-muted mb-4">
            Il fornitore verrà nascosto dai nuovi ordini. L&apos;operazione è reversibile.
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
