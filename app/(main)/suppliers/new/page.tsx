'use client';

// =============================================================================
// app/(main)/suppliers/new/page.tsx
// Form creazione fornitore.
// =============================================================================

import { useFormState } from 'react-dom';
import Link from 'next/link';
import { IDLE_STATE } from '@/lib/utils';
import { createSupplierAction } from '@/modules/catalog/actions';

const fieldClass = 'w-full rounded-xl border border-[#E5DDD0] px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#C9962A]/30 focus:border-[#C9962A] bg-white';
const labelClass = 'block text-sm font-medium text-[#1A2B4A] mb-1.5';
const optClass   = 'text-[#6B7280] font-normal text-xs';

export default function NewSupplierPage() {
  const [state, formAction, pending] = useFormState(createSupplierAction, IDLE_STATE);

  return (
    <div className="p-8 max-w-xl mx-auto">
      <div className="mb-6">
        <Link href="/suppliers" className="text-sm text-[#6B7280] hover:text-[#1A2B4A] transition-colors">
          ← Fornitori
        </Link>
        <h1 className="font-playfair text-3xl font-bold text-[#1A2B4A] mt-3">Nuovo fornitore</h1>
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
              placeholder="es. Farine e Cereali Srl"
              className={fieldClass}
            />
          </div>

          <div>
            <label className={labelClass}>
              Email <span className="text-[#C0392B]">*</span>
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
              className="flex-1 py-3 text-center rounded-xl border border-[#E5DDD0] text-sm font-semibold text-[#1A2B4A] hover:bg-[#FAF7F2] transition-colors"
            >
              Annulla
            </Link>
            <button
              type="submit"
              disabled={pending}
              className="flex-1 py-3 bg-[#1A2B4A] text-white rounded-xl text-sm font-semibold hover:bg-[#243660] disabled:opacity-60 transition-colors"
            >
              {pending ? 'Salvataggio…' : 'Salva fornitore'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
