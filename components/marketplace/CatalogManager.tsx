'use client';

import { useEffect } from 'react';
import { useFormState } from 'react-dom';
import { useRouter } from 'next/navigation';
import { IDLE_STATE } from '@/lib/utils';
import { upsertCatalogItemAction, deactivateCatalogItemAction } from '@/modules/marketplace/actions';
import type { CatalogItem } from '@/modules/marketplace/types';

const UNITS = ['g', 'kg', 'ml', 'l', 'pz', 'bustina', 'foglio'] as const;
const field = 'rounded-xl border border-border px-3 py-2.5 text-base sm:text-sm min-h-[44px]';

export function CatalogManager({ items }: { items: CatalogItem[] }) {
  const router = useRouter();
  const [addState, addAction] = useFormState(upsertCatalogItemAction, IDLE_STATE);
  const [delState, delAction] = useFormState(deactivateCatalogItemAction, IDLE_STATE);
  useEffect(() => { if (delState.status === 'success') router.refresh(); }, [delState, router]);

  return (
    <div className="space-y-6">
      <form action={addAction} className="bg-surface-2 rounded-2xl border border-border p-5 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-6 gap-3 items-end">
        <div className="sm:col-span-2"><label className="block text-xs text-ink-muted mb-1">Nome *</label><input name="name" required className={`${field} w-full`} /></div>
        <div><label className="block text-xs text-ink-muted mb-1">SKU</label><input name="sku" maxLength={50} placeholder="FAR-00-25" className={`${field} w-full`} /></div>
        <div><label className="block text-xs text-ink-muted mb-1">Unità *</label>
          <select name="unit" required className={`${field} w-full`}>{UNITS.map((u) => <option key={u} value={u}>{u}</option>)}</select></div>
        <div><label className="block text-xs text-ink-muted mb-1">€/u</label><input name="unitPrice" inputMode="decimal" placeholder="1,20" className={`${field} w-full`} /></div>
        <button type="submit" className="px-4 py-2.5 rounded-xl bg-primary text-primary-fg text-sm font-semibold hover:bg-primary-hover min-h-[44px]">Aggiungi</button>
        {addState.status === 'error' && <p className="col-span-full text-sm text-danger">{addState.error}</p>}
      </form>

      {/* Mobile: card stack */}
      <ul className="md:hidden space-y-3">
        {items.filter((i) => i.isActive).length === 0 && (
          <li className="bg-surface-2 rounded-2xl border border-border p-6 text-center text-ink-muted">Nessun prodotto. Aggiungi il primo.</li>
        )}
        {items.filter((i) => i.isActive).map((i) => (
          <li key={i.id} className="bg-surface-2 rounded-2xl border border-border p-4 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="font-medium truncate">{i.name}{i.sku ? <span className="text-ink-muted"> · {i.sku}</span> : null}</p>
              <p className="text-xs text-ink-muted mt-0.5">{i.unitPrice != null ? `${i.unitPrice} € / ${i.unit}` : `— / ${i.unit}`}</p>
            </div>
            <form action={delAction} className="shrink-0"><input type="hidden" name="id" value={i.id} /><button className="text-danger text-xs font-semibold hover:underline min-h-[36px] px-1">Disattiva</button></form>
          </li>
        ))}
      </ul>

      {/* Tablet/desktop: table */}
      <div className="hidden md:block bg-surface-2 rounded-2xl border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-bg text-ink-muted text-xs uppercase"><tr><th className="text-left px-4 py-3">Prodotto</th><th className="text-left px-4 py-3">Unità</th><th className="text-right px-4 py-3">€/u</th><th className="px-4 py-3"></th></tr></thead>
          <tbody>
            {items.length === 0 && <tr><td colSpan={4} className="px-4 py-6 text-center text-ink-muted">Nessun prodotto. Aggiungi il primo.</td></tr>}
            {items.filter((i) => i.isActive).map((i) => (
              <tr key={i.id} className="border-t border-divider">
                <td className="px-4 py-3 font-medium">{i.name}{i.sku ? <span className="text-ink-muted"> · {i.sku}</span> : null}</td>
                <td className="px-4 py-3">{i.unit}</td>
                <td className="px-4 py-3 text-right">{i.unitPrice != null ? `${i.unitPrice} €` : '—'}</td>
                <td className="px-4 py-3 text-right">
                  <form action={delAction}><input type="hidden" name="id" value={i.id} /><button className="text-danger text-xs font-semibold hover:underline">Disattiva</button></form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
