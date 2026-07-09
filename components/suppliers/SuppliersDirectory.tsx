'use client';

// =============================================================================
// <SuppliersDirectory> — anagrafica fornitori con CANALE in primo piano e filtri
// rapidi Tutti / Connessi BakeryOS / Non connessi. Desktop = tabella, mobile =
// card (badge e microcopy mai troncati). Il canale è la verità primaria; il
// listino attivo resta un tag secondario.
// =============================================================================

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { CHANNEL_COPY, type SupplierChannel } from '@/lib/supplier-channel';
import { SupplierChannelBadge } from './SupplierChannelBadge';

export interface DirectorySupplier {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  isActive: boolean;
  channel: SupplierChannel;
  hasPriceList: boolean;
}

type Filter = 'all' | 'bakeryos' | 'email';

export function SuppliersDirectory({ suppliers }: { suppliers: DirectorySupplier[] }) {
  const [filter, setFilter] = useState<Filter>('all');

  const counts = useMemo(() => {
    let bakeryos = 0;
    for (const s of suppliers) if (s.channel === 'bakeryos') bakeryos += 1;
    return { all: suppliers.length, bakeryos, email: suppliers.length - bakeryos };
  }, [suppliers]);

  const visible = useMemo(
    () => (filter === 'all' ? suppliers : suppliers.filter((s) => s.channel === filter)),
    [filter, suppliers],
  );

  const chip = (active: boolean) =>
    cn(
      'px-3 py-1.5 rounded-full text-sm font-medium transition-colors whitespace-nowrap',
      active ? 'bg-primary text-primary-fg' : 'bg-surface-2 text-ink-muted border border-border hover:text-ink',
    );

  return (
    <div className="space-y-4">
      {/* Filtri rapidi per canale */}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={chip(filter === 'all')} onClick={() => setFilter('all')}>
          Tutti ({counts.all})
        </button>
        <button type="button" className={chip(filter === 'bakeryos')} onClick={() => setFilter('bakeryos')}>
          Connessi BakeryOS ({counts.bakeryos})
        </button>
        <button type="button" className={chip(filter === 'email')} onClick={() => setFilter('email')}>
          Non connessi ({counts.email})
        </button>
      </div>

      {visible.length === 0 ? (
        <div className="rounded-2xl border border-border bg-surface-2 p-8 text-center text-sm text-ink-muted">
          {filter === 'bakeryos'
            ? 'Nessun fornitore collegato a BakeryOS. Collegane uno con la sua chiave qui sopra.'
            : filter === 'email'
            ? 'Tutti i tuoi fornitori sono collegati a BakeryOS. 🎉'
            : 'Nessun fornitore.'}
        </div>
      ) : (
        <>
          {/* Mobile: card */}
          <ul className="space-y-3 md:hidden">
            {visible.map((s) => (
              <li key={s.id}>
                <Link
                  href={`/suppliers/${s.id}`}
                  className="block rounded-2xl border border-border bg-surface-2 p-4 active:bg-surface-offset transition-colors"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-ink truncate">{s.name}</p>
                      <p className="text-xs text-ink-muted mt-0.5">{CHANNEL_COPY[s.channel].sub}</p>
                    </div>
                    <SupplierChannelBadge channel={s.channel} />
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-3">
                    <p className="text-sm text-ink-muted truncate">{s.email}</p>
                    {s.hasPriceList && (
                      <span className="shrink-0 text-xs font-medium text-ink-muted">Listino attivo</span>
                    )}
                  </div>
                  {!s.isActive && <p className="text-xs text-danger mt-1">disattivato</p>}
                </Link>
              </li>
            ))}
          </ul>

          {/* Desktop: tabella */}
          <div className="hidden md:block bg-surface-2 rounded-2xl border border-border overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-bg border-b border-border">
                <tr>
                  <th className="text-left px-6 py-3.5 font-semibold text-ink-muted text-xs uppercase tracking-wide">Nome</th>
                  <th className="text-left px-6 py-3.5 font-semibold text-ink-muted text-xs uppercase tracking-wide">Contatti</th>
                  <th className="text-left px-6 py-3.5 font-semibold text-ink-muted text-xs uppercase tracking-wide">Canale</th>
                  <th className="px-6 py-3.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-divider">
                {visible.map((s) => (
                  <tr key={s.id} className="hover:bg-surface-offset transition-colors">
                    <td className="px-6 py-4">
                      <p className="font-medium text-ink">{s.name}</p>
                      <p className="text-xs text-ink-muted mt-0.5">{CHANNEL_COPY[s.channel].sub}</p>
                      {!s.isActive && <p className="text-xs text-danger">disattivato</p>}
                    </td>
                    <td className="px-6 py-4">
                      <p className="text-ink-muted">{s.email}</p>
                      {s.phone && <p className="text-xs font-mono text-ink-muted">{s.phone}</p>}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <SupplierChannelBadge channel={s.channel} />
                        {s.hasPriceList && (
                          <span className="text-xs font-medium text-ink-muted">· Listino</span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <Link href={`/suppliers/${s.id}`} className="text-primary text-xs font-semibold hover:underline">
                        Scheda →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
