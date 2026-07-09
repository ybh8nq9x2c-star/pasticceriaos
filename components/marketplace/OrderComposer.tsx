'use client';

import { useRef, useState } from 'react';
import { useFormState } from 'react-dom';
import { IDLE_STATE } from '@/lib/utils';
import { placeOrderAction } from '@/modules/marketplace/actions';
import type { CatalogItem } from '@/modules/marketplace/types';

export function OrderComposer({
  connectionId,
  catalog,
  initialQty,
  fromDraftId,
}: {
  connectionId: string;
  catalog: CatalogItem[];
  /** Prefill quantità (conversione bozza → ordine condiviso). */
  initialQty?: Record<string, string>;
  /** Bozza PO d'origine: annullata dopo l'invio riuscito (vedi placeOrderAction). */
  fromDraftId?: string;
}) {
  const [state, formAction] = useFormState(placeOrderAction, IDLE_STATE);
  const [qty, setQty] = useState<Record<string, string>>(initialQty ?? {});
  const idem = useRef<string>(typeof crypto !== 'undefined' ? crypto.randomUUID() : Math.random().toString(36));

  const num = (v: string | undefined) => parseFloat((v ?? '0').replace(',', '.')) || 0;
  const total = catalog.reduce((s, i) => s + num(qty[i.id]) * Number(i.unitPrice ?? 0), 0);

  // inject the JSON lines + connection + idempotency key before the server action runs.
  function handleSubmit(formData: FormData) {
    const lines = catalog
      .filter((i) => num(qty[i.id]) > 0)
      .map((i) => ({ catalogItemId: i.id, quantity: qty[i.id] }));
    formData.set('lines', JSON.stringify(lines));
    formData.set('connectionId', connectionId);
    formData.set('idempotencyKey', idem.current);
    if (fromDraftId) formData.set('fromDraftId', fromDraftId);
    return formAction(formData);
  }

  if (catalog.length === 0) {
    return <p className="text-ink-muted">Questo fornitore non ha ancora prodotti a catalogo.</p>;
  }

  return (
    <form action={handleSubmit} className="space-y-4">
      {state.status === 'error' && (
        <p role="alert" className="text-sm text-danger">{state.error}</p>
      )}

      {/* Mobile: one tappable card per product with a large quantity field */}
      <ul className="md:hidden space-y-2">
        {catalog.map((i) => (
          <li key={i.id} className="bg-surface-2 rounded-xl border border-border p-3 flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="font-medium leading-tight truncate">{i.name}{i.sku ? <span className="text-ink-muted"> · {i.sku}</span> : null}</p>
              <p className="text-xs text-ink-muted mt-0.5">{i.unitPrice != null ? `${i.unitPrice} € / ${i.unit}` : `— / ${i.unit}`}</p>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <label className="sr-only" htmlFor={`qty-m-${i.id}`}>Quantità {i.name}</label>
              <input id={`qty-m-${i.id}`} inputMode="decimal" value={qty[i.id] ?? ''}
                onChange={(e) => setQty((p) => ({ ...p, [i.id]: e.target.value }))}
                placeholder="0" className="w-20 rounded-lg border border-border px-2 text-base text-right min-h-[44px]" />
              <span className="text-xs text-ink-muted w-8">{i.unit}</span>
            </div>
          </li>
        ))}
      </ul>

      {/* Tablet/desktop: table */}
      <div className="hidden md:block bg-surface-2 rounded-2xl border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-bg text-ink-muted text-xs uppercase">
            <tr><th className="text-left px-4 py-3">Prodotto</th><th className="text-right px-4 py-3">€/u</th><th className="text-right px-4 py-3 w-32">Quantità</th></tr>
          </thead>
          <tbody>
            {catalog.map((i) => (
              <tr key={i.id} className="border-t border-divider">
                <td className="px-4 py-3 font-medium">{i.name}{i.sku ? <span className="text-ink-muted"> · {i.sku}</span> : null}</td>
                <td className="px-4 py-3 text-right">{i.unitPrice != null ? `${i.unitPrice} €` : '—'}</td>
                <td className="px-4 py-2 text-right">
                  <label className="sr-only" htmlFor={`qty-${i.id}`}>Quantità {i.name}</label>
                  <input id={`qty-${i.id}`} inputMode="decimal" value={qty[i.id] ?? ''} onChange={(e) => setQty((p) => ({ ...p, [i.id]: e.target.value }))}
                    placeholder="0" className="w-24 rounded-lg border border-border px-2 py-1.5 text-sm text-right" />
                  <span className="ml-1 text-xs text-ink-muted">{i.unit}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div>
        <label htmlFor="order-notes" className="block text-xs text-ink-muted mb-1">Note (opz.)</label>
        <textarea id="order-notes" name="notes" rows={2} className="w-full rounded-xl border border-border px-3 py-2.5 text-base sm:text-sm resize-none" />
      </div>

      {/* Action bar: sticky just above the mobile tab bar, static on desktop */}
      <div
        className="sticky lg:static z-30 -mx-4 sm:-mx-6 lg:mx-0 px-4 sm:px-6 lg:px-0 py-3 bg-glass backdrop-blur border-t border-border lg:border-0 lg:bg-transparent flex items-center justify-between gap-3"
        style={{ bottom: 'calc(56px + env(safe-area-inset-bottom))' }}
      >
        <span className="text-sm shrink-0">Totale: <strong className="font-mono">{total.toFixed(2)} €</strong></span>
        <button type="submit" className="flex-1 sm:flex-none px-5 py-3 rounded-xl bg-primary text-primary-fg text-sm font-semibold hover:bg-primary-hover min-h-[48px]">
          Invia ordine
        </button>
      </div>
    </form>
  );
}
