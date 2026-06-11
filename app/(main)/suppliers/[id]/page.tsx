'use client';
import { useFormState } from 'react-dom';

// =============================================================================
// app/(main)/suppliers/[id]/page.tsx
// Dettaglio + modifica fornitore (Client Component).
// =============================================================================

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { IDLE_STATE } from '@/lib/utils';
import { updateSupplierAction, deactivateSupplierAction } from '@/modules/catalog/actions';
import { PortalLinkPanel } from '@/components/suppliers/PortalLinkPanel';
import type { Supplier } from '@/modules/catalog/types';

const fieldClass = 'w-full rounded-xl border border-[#E5DDD0] px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#C9962A]/30 focus:border-[#C9962A] bg-white';
const labelClass = 'block text-sm font-medium text-[#1A2B4A] mb-1.5';
const optClass   = 'text-[#6B7280] font-normal text-xs';

export default function SupplierDetailPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [supplier, setSupplier]     = useState<Supplier | null>(null);
  const [loading, setLoading]       = useState(true);
  const [confirming, setConfirming] = useState(false);

  const [state, formAction, pending] = useFormState(
    (prev: typeof IDLE_STATE, formData: FormData) =>
      updateSupplierAction(params.id, prev, formData),
    IDLE_STATE,
  );

  useEffect(() => {
    fetch(`/api/catalog/suppliers/${params.id}`)
      .then((r) => r.ok ? r.json() : null)
      .then((data) => { setSupplier(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, [params.id]);

  useEffect(() => {
    if (state.status === 'success') router.push('/suppliers');
  }, [state, router]);

  async function handleDeactivate() {
    const res = await deactivateSupplierAction(params.id);
    if (res.status === 'success') router.push('/suppliers');
  }

  if (loading) {
    return (
      <div className="p-8 max-w-2xl mx-auto">
        <div className="h-8 w-40 rounded-xl bg-[#E5DDD0] animate-pulse mb-3" />
        <div className="h-56 rounded-2xl bg-[#E5DDD0] animate-pulse" />
      </div>
    );
  }

  if (!supplier) {
    return (
      <div className="p-8 max-w-2xl mx-auto">
        <div className="bg-white rounded-2xl border border-[#E5DDD0] p-8 text-center">
          <p className="text-sm text-[#C0392B] mb-3">Fornitore non trovato.</p>
          <Link href="/suppliers" className="text-sm font-semibold text-[#C9962A] hover:underline">
            ← Fornitori
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <div className="mb-6">
        <Link href="/suppliers" className="text-sm text-[#6B7280] hover:text-[#1A2B4A] transition-colors">
          ← Fornitori
        </Link>
        <div className="flex items-center justify-between mt-3">
          <h1 className="font-playfair text-3xl font-bold text-[#1A2B4A]">{supplier.name}</h1>
          {supplier.isActive && (
            <span className="px-2.5 py-0.5 rounded-full bg-[#27AE60]/10 text-[#1E7E45] text-xs font-semibold">
              Attivo
            </span>
          )}
        </div>
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
              Nome <span className="text-[#C0392B]">*</span>
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
              Email <span className="text-[#C0392B]">*</span>
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

      {/* Portale fornitore + listino */}
      <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-4">
        <PortalLinkPanel supplierId={params.id} />
        <Link
          href={`/suppliers/${params.id}/price-list`}
          className="bg-white rounded-2xl border border-[#E5DDD0] p-5 hover:border-[#C9962A] transition-colors flex flex-col justify-between"
        >
          <div>
            <h2 className="text-[11px] font-semibold text-[#6B7280] uppercase tracking-wide mb-2">
              Listino prezzi
            </h2>
            <p className="text-xs text-[#6B7280]">
              Prezzi concordati per ingrediente: alimentano le bozze d'ordine e
              il livello di connessione L3.
            </p>
          </div>
          <span className="mt-3 text-sm font-semibold text-[#C9962A]">Gestisci listino →</span>
        </Link>
      </div>

      {supplier.isActive && (
        <div className="mt-8 border border-[#C0392B]/30 rounded-2xl p-5">
          <h3 className="text-sm font-semibold text-[#C0392B] mb-1">Disattiva fornitore</h3>
          <p className="text-xs text-[#6B7280] mb-4">
            Il fornitore verrà nascosto dai nuovi ordini. L&apos;operazione è reversibile.
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
