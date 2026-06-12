'use client';

// =============================================================================
// app/(main)/suppliers/new/page.tsx
// Form creazione fornitore.
// =============================================================================

import { useFormState } from 'react-dom';
import Link from 'next/link';
import { IDLE_STATE } from '@/lib/utils';
import { createSupplierAction } from '@/modules/catalog/actions';

const fieldClass = 'w-full rounded-xl border border-border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-ring focus:border-primary bg-surface-2';
const labelClass = 'block text-sm font-medium text-ink mb-1.5';
const optClass   = 'text-ink-muted font-normal text-xs';

export default function NewSupplierPage() {
  const [state, formAction, pending] = useFormState(createSupplierAction, IDLE_STATE);

  return (
    <div className="p-8 max-w-xl mx-auto">
      <div className="mb-6">
        <Link href="/suppliers" className="text-sm text-ink-muted hover:text-ink transition-colors">
          ← Fornitori
        </Link>
        <h1 className="text-3xl font-bold text-ink mt-3">Nuovo fornitore</h1>
      </div>

      <div className="bg-surface-2 rounded-2xl border border-border p-6">
        <form action={formAction} className="space-y-5">
          {state.status === 'error' && (
            <div className="rounded-xl bg-danger-light border border-danger-soft p-3 text-sm text-danger">
              {state.error}
            </div>
          )}
          {state.status === 'success' && (
            <div className="rounded-xl bg-success-light border border-success-soft p-3 text-sm text-success-strong">
              {state.message}
            </div>
          )}

          <div>
            <label className={labelClass}>
              Nome <span className="text-danger">*</span>
            </label>
            <input
              name="name"
              type="text"
              required
              maxLength={200}
              placeholder="es. Farine e Cereali Srl"
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
              placeholder="ordini@fornitore.it"
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
              placeholder="+39 02 1234567"
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
              maxLength={1000}
              placeholder="Eventuali note sul fornitore…"
              className={`${fieldClass} resize-none`}
            />
          </div>

          <div className="flex gap-3 pt-1">
            <Link
              href="/suppliers"
              className="flex-1 py-3 text-center rounded-xl border border-border text-sm font-semibold text-ink hover:bg-surface-offset transition-colors"
            >
              Annulla
            </Link>
            <button
              type="submit"
              disabled={pending}
              className="flex-1 py-3 bg-primary text-primary-fg rounded-xl text-sm font-semibold hover:bg-primary-hover disabled:opacity-60 transition-colors"
            >
              {pending ? 'Salvataggio…' : 'Salva fornitore'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
