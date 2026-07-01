'use client';

// =============================================================================
// <OrdersMobileList> — lista ordini mobile-first: card verticali (mai tabella),
// default = ordini DA GESTIRE (bozze/inviati/parziali), storico collassato.
// UNA primary action per card: bozza → "Apri e invia"; inviato/confermato/
// parziale → "Ricevuto" (bottom sheet, ricezione via engine).
// La tabella desktop resta invariata nella pagina server (hidden md:block).
// =============================================================================

import { useState } from 'react';
import Link from 'next/link';
import { ChevronDown } from 'lucide-react';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Button } from '@/components/ui/Button';
import { orderStatusBadge } from '@/modules/ordering/status-display';
import { OrderReceiveSheet } from './OrderReceiveSheet';
import type { PurchaseOrderListItem, OrderStatus } from '@/modules/ordering/types';

const OPEN_STATUSES: OrderStatus[] = ['draft', 'sent', 'confirmed', 'partial'];
const RECEIVABLE: OrderStatus[] = ['sent', 'confirmed', 'partial'];

function fmtCurrency(n: number | null) {
  if (n === null) return '—';
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(n);
}

function fmtDate(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('it-IT', {
    day: '2-digit', month: 'short',
  });
}

export function OrdersMobileList({ orders }: { orders: PurchaseOrderListItem[] }) {
  const [receiveOrder, setReceiveOrder] = useState<PurchaseOrderListItem | null>(null);

  const open = orders.filter((o) => OPEN_STATUSES.includes(o.status));
  const closed = orders.filter((o) => !OPEN_STATUSES.includes(o.status));

  return (
    <div className="space-y-4">
      {/* ── Da gestire (default: solo ciò che richiede azione) ─────────────── */}
      {open.length === 0 ? (
        <p className="rounded-2xl border border-border bg-surface-2 px-5 py-6 text-sm text-ink-muted text-center">
          Nessun ordine da gestire. ✓
        </p>
      ) : (
        <div className="space-y-3">
          {open.map((o) => {
            const badge = orderStatusBadge(o.status, o.dispatchOutcome);
            const receivable = RECEIVABLE.includes(o.status);
            return (
              <div key={o.id} className="rounded-2xl border border-border bg-surface-2 overflow-hidden">
                {/* Testata cliccabile → dettaglio (zona ampia, nessun bottone annidato) */}
                <Link href={`/orders/${o.id}`} className="block px-4 pt-3.5 pb-2 active:bg-surface-offset transition-colors">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-md font-semibold text-ink truncate">{o.supplierName}</p>
                    <StatusBadge label={badge.label} variant={badge.variant} />
                  </div>
                  <p className="text-sm text-ink-muted mt-1">
                    {fmtDate(o.orderDate)} · {o.lineItemsCount} prodott{o.lineItemsCount === 1 ? 'o' : 'i'}
                    {o.totalAmount !== null && (
                      <> · <span className="font-mono font-medium text-ink">{fmtCurrency(o.totalAmount)}</span></>
                    )}
                  </p>
                </Link>
                {/* UNA primary action per card */}
                <div className="px-4 pb-3.5 pt-1">
                  {receivable ? (
                    <Button fullWidth size="lg" onClick={() => setReceiveOrder(o)}>
                      {o.status === 'partial' ? 'Ricevi il resto' : 'Ricevuto'}
                    </Button>
                  ) : (
                    <Link
                      href={`/orders/${o.id}`}
                      className="flex items-center justify-center h-11 w-full rounded-md border border-border text-sm font-semibold text-ink hover:bg-surface-offset transition-colors"
                    >
                      Apri e invia →
                    </Link>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Storico (secondario, collassato di default) ───────────────────── */}
      {closed.length > 0 && (
        <details className="group rounded-2xl border border-border bg-surface-2 overflow-hidden">
          <summary className="flex items-center justify-between min-h-[48px] px-4 cursor-pointer list-none select-none [&::-webkit-details-marker]:hidden">
            <span className="text-sm font-semibold text-ink-muted uppercase tracking-wide">
              Storico ({closed.length})
            </span>
            <ChevronDown size={16} aria-hidden="true" className="text-ink-faint transition-transform group-open:rotate-180" />
          </summary>
          <div className="divide-y divide-divider border-t border-divider">
            {closed.map((o) => {
              const badge = orderStatusBadge(o.status, o.dispatchOutcome);
              return (
                <Link
                  key={o.id}
                  href={`/orders/${o.id}`}
                  className="flex items-center gap-3 px-4 min-h-[52px] active:bg-surface-offset transition-colors"
                >
                  <span className="flex-1 min-w-0 text-sm text-ink truncate">{o.supplierName}</span>
                  <span className="text-xs font-mono text-ink-muted shrink-0">{fmtDate(o.orderDate)}</span>
                  <StatusBadge label={badge.label} variant={badge.variant} />
                </Link>
              );
            })}
          </div>
        </details>
      )}

      <OrderReceiveSheet
        order={receiveOrder}
        open={receiveOrder !== null}
        onClose={() => setReceiveOrder(null)}
      />
    </div>
  );
}
