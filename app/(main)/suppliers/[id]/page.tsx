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
import { SubmitButton } from '@/components/ui/SubmitButton';
import { PortalLinkPanel } from '@/components/suppliers/PortalLinkPanel';
import type { Supplier } from '@/modules/catalog/types';

const fieldClass = 'w-full rounded-xl border border-border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-ring focus:border-primary bg-surface-2';
const labelClass = 'block text-sm font-medium text-ink mb-1.5';
const optClass   = 'text-ink-muted font-normal text-xs';

export default function SupplierDetailPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [supplier, setSupplier]     = useState<Supplier | null>(null);
  const [loading, setLoading]       = useState(true);
  const [confirming, setConfirming] = useState(false);

  const [state, formAction] = useFormState(
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
      <div className="p-4 sm:p-6 lg:p-8 max-w-2xl mx-auto">
        <div className="h-8 w-40 rounded-xl bg-surface-offset animate-pulse mb-3" />
        <div className="h-56 rounded-2xl bg-surface-offset animate-pulse" />
      </div>
    );
  }

  if (!supplier) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 max-w-2xl mx-auto">
        <div className="bg-surface-2 rounded-2xl border border-border p-8 text-center">
          <p className="text-sm text-danger mb-3">Fornitore non trovato.</p>
          <Link href="/suppliers" className="text-sm font-semibold text-primary hover:underline">
            ← Fornitori
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-2xl mx-auto">
      <div className="mb-6">
        <Link href="/suppliers" className="text-sm text-ink-muted hover:text-ink transition-colors">
          ← Fornitori
        </Link>
        <div className="flex items-center justify-between mt-3">
          <h1 className="text-3xl font-bold text-ink">{supplier.name}</h1>
          {supplier.isActive && (
            <span className="px-2.5 py-0.5 rounded-full bg-success-light text-success-strong text-xs font-semibold">
              Attivo
            </span>
          )}
        </div>
      </div>

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

      {/* Portale fornitore + listino */}
      <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-4">
        <PortalLinkPanel supplierId={params.id} />
        <Link
          href={`/suppliers/${params.id}/price-list`}
          className="bg-surface-2 rounded-2xl border border-border p-5 hover:border-primary-soft transition-colors flex flex-col justify-between"
        >
          <div>
            <h2 className="text-xs font-semibold text-ink-muted uppercase tracking-wide mb-2">
              Listino prezzi
            </h2>
            <p className="text-xs text-ink-muted">
              Prezzi concordati per ingrediente: alimentano le bozze d'ordine e
              il livello di connessione L3.
            </p>
          </div>
          <span className="mt-3 text-sm font-semibold text-primary">Gestisci listino →</span>
        </Link>
      </div>

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
    </div>
  );
}
