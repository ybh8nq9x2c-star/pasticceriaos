'use client';

// =============================================================================
// <OrderReceiveSheet> — conferma ricezione ordine in bottom sheet (mobile-first).
// MVP Sprint 1: ricezione TOTALE (o del residuo su ordini parziali) in 1 tap,
// via goods receipt engine (receiveOrderInFullAction — nessun nuovo write-path).
// Il percorso "quantità diverse / riga per riga" resta il flusso Ricevimenti,
// linkato qui come uscita secondaria (base pronta per la parziale in Sprint 2).
// =============================================================================

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { CheckCircle2, Package } from 'lucide-react';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { receiveOrderInFullAction } from '@/modules/goods-receipts/actions';
import type { PurchaseOrderListItem } from '@/modules/ordering/types';

function fmtCurrency(n: number | null) {
  if (n === null) return '—';
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(n);
}

function fmtDate(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('it-IT', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

export function OrderReceiveSheet({
  order,
  open,
  onClose,
}: {
  order: PurchaseOrderListItem | null;
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!order) return null;
  const isPartial = order.status === 'partial';

  function confirm() {
    if (!order) return;
    setError(null);
    startTransition(async () => {
      const res = await receiveOrderInFullAction(order.id);
      if (res.status !== 'success') {
        setError(res.status === 'error' ? res.error ?? 'Operazione non riuscita.' : 'Operazione non riuscita.');
        return;
      }
      onClose();
      router.push(`/orders?flash=${encodeURIComponent(res.message ?? 'Ordine ricevuto')}`);
      router.refresh();
    });
  }

  return (
    <BottomSheet open={open} onClose={onClose} title="Conferma ricezione ordine">
      <div className="space-y-4">
        {/* Riepilogo essenziale: cosa sto confermando */}
        <div className="flex items-start gap-3 rounded-xl bg-surface-offset px-4 py-3">
          <Package size={20} aria-hidden="true" className="text-ink-muted shrink-0 mt-0.5" />
          <div className="min-w-0 flex-1">
            <p className="text-md font-semibold text-ink truncate">{order.supplierName}</p>
            <p className="text-sm text-ink-muted mt-0.5">
              {fmtDate(order.orderDate)} · {order.lineItemsCount} prodott{order.lineItemsCount === 1 ? 'o' : 'i'}
              {order.totalAmount !== null && <> · <span className="font-mono">{fmtCurrency(order.totalAmount)}</span></>}
            </p>
          </div>
        </div>

        <p className="text-sm text-ink-muted">
          {isPartial
            ? 'Verranno caricate a magazzino le quantità ancora mancanti di questo ordine.'
            : 'Il magazzino verrà aggiornato con tutte le quantità ordinate.'}
        </p>

        {error && (
          <p role="alert" className="rounded-md bg-danger-light px-3 py-2 text-sm text-danger">
            {error}
          </p>
        )}

        <Button fullWidth size="lg" loading={pending} onClick={confirm}>
          <CheckCircle2 size={16} aria-hidden="true" />
          {isPartial ? 'Conferma arrivo del resto' : 'Conferma ricezione'}
        </Button>

        {/* Uscita secondaria: quantità diverse → flusso riga-per-riga (engine). */}
        <Link
          href={`/receipts/new?order=${order.id}`}
          className="flex items-center justify-center min-h-[44px] text-sm font-semibold text-primary hover:underline"
        >
          Quantità diverse? Ricevi riga per riga →
        </Link>
      </div>
    </BottomSheet>
  );
}
