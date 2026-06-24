'use client';

// =============================================================================
// <CompleteReceiptBar> — azione di completamento con anteprima dell'esito
// (stessa semantica della RPC) e conferma esplicita su parziali/discrepanze.
// Sticky in basso su mobile per chiudere il giro col telefono in mano.
// =============================================================================

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, XCircle, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { cancelReceiptAction, completeReceiptAction, receiveAllAndCompleteAction } from '@/modules/goods-receipts/actions';
import {
  computeReceiptStatus,
  type ReceiptDetail,
  type ReceiptMode,
} from '@/modules/goods-receipts/types';
import { IDLE_STATE, cn, type ActionState } from '@/lib/utils';

export function CompleteReceiptBar({
  receipt,
  mode,
}: {
  receipt: ReceiptDetail;
  mode: ReceiptMode;
}) {
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [state, setState] = useState<ActionState>(IDLE_STATE);
  const [pending, startTransition] = useTransition();

  const editable = ['draft', 'expected', 'partial'].includes(receipt.status);

  const toPost = receipt.lines.filter((l) => l.qtyReceived > l.qtyPosted);
  const unmatched = toPost.filter((l) => !l.productId);
  const preview = useMemo(() => computeReceiptStatus(receipt.lines), [receipt.lines]);
  const canComplete = editable && toPost.length > 0 && unmatched.length === 0;
  const canCancel = editable && receipt.lines.every((l) => l.qtyPosted === 0);
  // "Ricevuto tutto" 1-tap: ci sono righe MATCHATE attese non ancora piene (caso
  // standard "tutto arrivato" → niente compilazione riga per riga).
  const fillable = receipt.lines.filter((l) => l.productId && l.qtyExpected !== null && l.qtyReceived < (l.qtyExpected ?? 0));
  const canReceiveAll = editable && fillable.length > 0;

  function complete() {
    const fd = new FormData();
    fd.set('mode', mode);
    fd.set('receiptId', receipt.id);
    startTransition(async () => {
      const res = await completeReceiptAction(IDLE_STATE, fd);
      setState(res);
      if (res.status === 'success') router.refresh();
    });
  }

  function receiveAll() {
    const fd = new FormData();
    fd.set('mode', mode);
    fd.set('receiptId', receipt.id);
    startTransition(async () => {
      const res = await receiveAllAndCompleteAction(IDLE_STATE, fd);
      setState(res);
      if (res.status === 'success') router.refresh();
    });
  }

  function cancel() {
    const fd = new FormData();
    fd.set('mode', mode);
    fd.set('receiptId', receipt.id);
    startTransition(async () => {
      const res = await cancelReceiptAction(IDLE_STATE, fd);
      // in caso di successo la action fa redirect; qui arriva solo l'errore
      if (res?.status === 'error') setState(res);
    });
  }

  if (!editable) return null;

  return (
    <>
      <div
        className={cn(
          'sticky bottom-0 lg:static z-30 -mx-4 px-4 sm:mx-0 sm:px-0 py-3',
          'bg-glass backdrop-blur lg:bg-transparent lg:backdrop-blur-0 border-t border-divider lg:border-0',
        )}
        style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
      >
        {state.status === 'error' && (
          <p role="alert" className="mb-2 rounded-md bg-danger-light px-3 py-2 text-sm text-danger">
            {state.error}
          </p>
        )}
        {state.status === 'success' && (
          <p role="status" className="mb-2 rounded-md bg-success-light px-3 py-2 text-sm text-success-strong">
            {state.message}
          </p>
        )}
        {canComplete && (
          <p className="mb-2 flex items-start gap-1.5 rounded-md bg-warning-light px-3 py-2 text-xs font-medium text-warning-strong">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
            <span>
              Il magazzino <strong>non è ancora aggiornato</strong>: conferma per contabilizzare{' '}
              {toPost.length} rig{toPost.length === 1 ? 'a' : 'he'}.
            </span>
          </p>
        )}
        <div className="flex items-center gap-2">
          {canCancel && (
            <Button variant="ghost" className="text-danger" onClick={() => setCancelOpen(true)}>
              <XCircle size={16} aria-hidden="true" /> Annulla
            </Button>
          )}
          {!canComplete && canReceiveAll ? (
            // Caso standard "tutto arrivato": un solo tap riempie e contabilizza.
            <Button fullWidth loading={pending} onClick={receiveAll}>
              <CheckCircle2 size={16} aria-hidden="true" />
              Ricevuto tutto
            </Button>
          ) : (
            <Button
              fullWidth
              loading={pending}
              disabled={!canComplete}
              onClick={() => (preview === 'completed' ? complete() : setConfirmOpen(true))}
            >
              <CheckCircle2 size={16} aria-hidden="true" />
              Conferma e aggiorna magazzino
            </Button>
          )}
        </div>
        {!canComplete && canReceiveAll && (
          <p className="mt-1.5 text-xs text-ink-muted">
            Tutto arrivato? Un tap. Quantità diverse? Modifica le righe sopra e usa “Conferma”.
          </p>
        )}
        {/* Hanno già inserito quantità manuali ma possono anche prendere tutto. */}
        {canComplete && canReceiveAll && (
          <button type="button" onClick={receiveAll} className="mt-1.5 text-xs font-semibold text-primary hover:underline">
            Oppure: ricevuto tutto come da ordine →
          </button>
        )}
        {!canComplete && !canReceiveAll && (
          <p className="mt-1.5 text-xs text-ink-muted">
            {toPost.length === 0
              ? 'Registra le quantità ricevute (scan o manuale) per completare.'
              : `${unmatched.length} rig${unmatched.length === 1 ? 'a' : 'he'} da associare a un prodotto prima di completare.`}
          </p>
        )}
      </div>

      {/* Conferma esplicita quando l'esito non è "tutto ricevuto" */}
      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title={preview === 'discrepancy' ? 'Completare con discrepanze?' : 'Ricevimento parziale'}
        description={
          preview === 'discrepancy'
            ? 'Alcune righe hanno discrepanze registrate. Il carico a magazzino userà le quantità effettivamente ricevute e le discrepanze resteranno tracciate sul documento.'
            : 'Alcune righe attese non sono state ricevute per intero. Verrà registrato il carico delle sole quantità ricevute; il ricevimento resterà aperto come parziale.'
        }
        confirmLabel={preview === 'discrepancy' ? 'Completa con discrepanze' : 'Registra carico parziale'}
        confirmVariant={preview === 'discrepancy' ? 'danger' : 'primary'}
        onConfirm={complete}
      >
        <ul className="text-sm text-ink-muted space-y-1 max-h-40 overflow-y-auto">
          {receipt.lines
            .filter(
              (l) =>
                l.discrepancyReason ||
                (l.qtyExpected !== null && l.qtyReceived < l.qtyExpected),
            )
            .slice(0, 6)
            .map((l) => (
              <li key={l.id} className="flex justify-between gap-3">
                <span className="truncate">{l.productName ?? l.rawProductName}</span>
                <span className="font-mono tnum shrink-0">
                  {l.qtyReceived}/{l.qtyExpected ?? '—'} {l.unit}
                </span>
              </li>
            ))}
        </ul>
      </ConfirmDialog>

      <ConfirmDialog
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        title="Annullare il ricevimento?"
        description="Il ricevimento verrà archiviato come annullato. Nessun movimento di magazzino è stato registrato: l'operazione non tocca le giacenze."
        confirmLabel="Annulla ricevimento"
        onConfirm={cancel}
      />
    </>
  );
}
