// =============================================================================
// app/(main)/orders/[id]/page.tsx
// Dettaglio ordine d'acquisto con storico stati — Server Component.
// =============================================================================

import type { Metadata } from 'next';
import Link from 'next/link';
import { ReceiptText, Package } from 'lucide-react';
import { notFound } from 'next/navigation';
import { getOrder, getOrderHistory } from '@/modules/ordering/service';
import { getBatchesForOrder } from '@/modules/inventory/service';
import { changeOrderStatusAction, cancelOrderAction } from '@/modules/ordering/actions';
import { RegisterBatchForm } from './RegisterBatchForm';
import { IDLE_STATE, UNIT_LABELS, UNIT_SHORT } from '@/lib/utils';
import type { OrderStatus } from '@/modules/ordering/types';
import {
  orderStatusBadge,
  needsManualSend,
  ORDER_PIPELINE,
  pipelineIndex,
} from '@/modules/ordering/status-display';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { SubmitButton } from '@/components/ui/SubmitButton';

export const metadata: Metadata = { title: 'Ordine' };

// Etichette per lo storico (copre tutti gli stati DB, incluso 'confirmed' legacy).
const STATUS_LABELS: Record<OrderStatus, string> = {
  draft:     'Bozza',
  sent:      'Inviato',
  confirmed: 'Confermato',
  partial:   'Parziale',
  received:  'Ricevuto',
  cancelled: 'Annullato',
};

// Happy path visivo a 3 nodi: Bozza → Inviato → Ricevuto.
const PIPELINE = ORDER_PIPELINE;

// Unica CTA primaria di avanzamento stato: invio dell'ordine. 'confirmed' NON è
// più nell'happy path. La ricezione passa solo dal Goods Receipt Engine.
const NEXT_ACTIONS: Partial<Record<OrderStatus, { toStatus: OrderStatus; label: string }>> = {
  draft: { toStatus: 'sent', label: 'Invia ordine' },
};

function formatDate(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('it-IT', {
    day: '2-digit', month: 'long', year: 'numeric',
  });
}

function formatCurrency(n: number | null) {
  if (n === null) return '—';
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(n);
}

export default async function OrderDetailPage({ params }: { params: { id: string } }) {
  // L'ordine è l'entità primaria: se manca → 404. Lo storico è ancillare: un suo
  // errore NON deve far sparire un ordine esistente (degrada a lista vuota).
  let order;
  try {
    order = await getOrder(params.id);
  } catch {
    notFound();
  }
  let history: Awaited<ReturnType<typeof getOrderHistory>> = [];
  try {
    history = await getOrderHistory(params.id);
  } catch {
    history = [];
  }

  // Lotti registrati su questo ordine (ordini ricevuti o parzialmente ricevuti).
  const hasGoods = order.status === 'received' || order.status === 'partial';
  const batches = hasGoods ? await getBatchesForOrder(order.id) : [];
  const batchedQtyByIngredient = new Map<string, number>();
  for (const b of batches) {
    batchedQtyByIngredient.set(
      b.ingredientProductId,
      (batchedQtyByIngredient.get(b.ingredientProductId) ?? 0) + b.quantityReceived,
    );
  }

  // Residuo (ordine parziale): cosa è arrivato e cosa manca ancora, per riga.
  const isPartial = order.status === 'partial';
  const openLines = order.lineItems
    .map((li) => ({ li, missing: Math.max(0, li.quantity - li.quantityReceived) }))
    .filter((r) => r.missing > 0);

  const nextAction = NEXT_ACTIONS[order.status];
  // La ricezione del resto passa dal goods receipt engine anche per gli ordini parziali.
  const canReceive = order.status === 'sent' || order.status === 'confirmed' || order.status === 'partial';
  // Niente annullamento quando merce è già (in parte) arrivata: partial non è annullabile.
  const canCancel  = order.status === 'draft' || order.status === 'sent' || order.status === 'confirmed';

  const orderId = order.id;

  // Inline void wrappers per form action
  async function handleAdvance(formData: FormData): Promise<void> {
    'use server';
    await changeOrderStatusAction(orderId, IDLE_STATE, formData);
  }

  async function handleCancel(_formData: FormData): Promise<void> {
    'use server';
    await cancelOrderAction(orderId);
  }

  const isCancelled = order.status === 'cancelled';
  const currentIdx = pipelineIndex(order.status);
  const badge = orderStatusBadge(order.status, order.dispatchOutcome);
  const showManualSend = needsManualSend(order.status, order.dispatchOutcome);

  return (
    <div className="p-8 max-w-4xl mx-auto">
      {/* Breadcrumb + header */}
      <div className="mb-6">
        <Link href="/orders" className="text-sm text-ink-muted hover:text-ink transition-colors">
          ← Ordini
        </Link>
        <div className="flex items-start justify-between gap-4 mt-3">
          <div>
            <h1 className="text-3xl font-bold text-ink">
              {order.supplierName}
            </h1>
            <p className="text-xs text-ink-muted font-mono mt-1.5">
              {formatDate(order.orderDate)}
              {order.expectedDate && ` · consegna ${formatDate(order.expectedDate)}`}
            </p>
          </div>
          <StatusBadge
            label={badge.label}
            variant={badge.variant}
            className="text-sm px-3 py-1"
          />
        </div>
      </div>

      {/* Invio non attestato: stato ONESTO + azione chiara (mandalo tu al fornitore). */}
      {showManualSend && (
        <div className="mb-6 rounded-2xl border border-warning-soft bg-warning-light/50 px-5 py-4">
          <p className="font-semibold text-ink">Questo ordine non è stato recapitato automaticamente.</p>
          <p className="text-sm text-ink-muted mt-1">
            Nessun invio email è stato confermato dal sistema. Invialo tu al fornitore
            {order.supplierEmail ? <> — <span className="font-medium text-ink">{order.supplierEmail}</span></> : null}.
            Quando il fornitore conferma, prosegui con “Ricevi merce”.
          </p>
        </div>
      )}

      {/* Stepper orizzontale */}
      <div className="bg-surface-2 rounded-2xl border border-border p-6 mb-6">
        <div className="flex items-center">
          {PIPELINE.map((step, idx) => {
            const isDone    = !isCancelled && idx < currentIdx;
            const isCurrent = !isCancelled && idx === currentIdx;
            const dotClass = isCancelled
              ? 'bg-surface-offset text-ink-muted'
              : isCurrent
              ? 'bg-primary text-ink ring-4 ring-primary-ring'
              : isDone
              ? 'bg-success text-white'
              : 'bg-surface-offset text-ink-muted';
            const labelClass = isCurrent
              ? 'text-ink font-semibold'
              : isDone
              ? 'text-success-strong'
              : 'text-ink-muted';
            return (
              <div key={step} className="flex items-center flex-1 last:flex-none">
                <div className="flex flex-col items-center gap-1.5">
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-mono font-medium ${dotClass}`}>
                    {isDone ? '✓' : idx + 1}
                  </div>
                  <span className={`text-xs ${labelClass}`}>{STATUS_LABELS[step]}</span>
                </div>
                {idx < PIPELINE.length - 1 && (
                  <div className={`flex-1 h-0.5 mx-2 -mt-5 ${!isCancelled && idx < currentIdx ? 'bg-success' : 'bg-surface-offset'}`} />
                )}
              </div>
            );
          })}
        </div>
        {isCancelled && (
          <p className="text-center text-xs text-danger font-semibold mt-4">
            Questo ordine è stato annullato.
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Righe ordine */}
        <div className="lg:col-span-2 space-y-6">
          {/* Ricezione PARZIALE: cosa è arrivato e cosa manca ancora. La merce
              entra a magazzino solo dai Ricevimenti; qui si vede solo il residuo. */}
          {isPartial && (
            <div className="bg-warning-light/40 rounded-2xl border border-warning-soft overflow-hidden">
              <div className="px-6 py-4 border-b border-warning-soft flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-bold text-ink">Ricezione parziale</h2>
                  <p className="text-xs text-ink-muted mt-0.5">
                    {openLines.length} rig{openLines.length === 1 ? 'a' : 'he'} ancora apert{openLines.length === 1 ? 'a' : 'e'}: è arrivata solo una parte dell'ordine.
                  </p>
                </div>
                <Link
                  href={`/receipts/new?order=${order.id}`}
                  className="shrink-0 px-3 py-2 rounded-xl text-xs font-semibold bg-primary text-primary-fg hover:bg-primary-hover transition-colors whitespace-nowrap"
                >
                  Ricevi il resto
                </Link>
              </div>
              <table className="w-full text-sm">
                <thead className="bg-bg/60 border-b border-warning-soft">
                  <tr>
                    <th className="text-left px-6 py-2.5 font-semibold text-ink-muted text-xs uppercase tracking-wide">Prodotto</th>
                    <th className="text-right px-6 py-2.5 font-semibold text-ink-muted text-xs uppercase tracking-wide">Ordinato</th>
                    <th className="text-right px-6 py-2.5 font-semibold text-ink-muted text-xs uppercase tracking-wide">Ricevuto</th>
                    <th className="text-right px-6 py-2.5 font-semibold text-ink-muted text-xs uppercase tracking-wide">Manca</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-warning-soft/60">
                  {openLines.map(({ li, missing }) => (
                    <tr key={li.id}>
                      <td className="px-6 py-2.5 text-ink">{li.ingredientName}</td>
                      <td className="px-6 py-2.5 text-right font-mono text-ink-muted">{li.quantity} {UNIT_SHORT[li.unitSnapshot]}</td>
                      <td className="px-6 py-2.5 text-right font-mono text-ink-muted">{li.quantityReceived} {UNIT_SHORT[li.unitSnapshot]}</td>
                      <td className="px-6 py-2.5 text-right font-mono font-semibold text-warning-strong">{missing} {UNIT_SHORT[li.unitSnapshot]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="bg-surface-2 rounded-2xl border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-bg border-b border-border">
                <tr>
                  <th className="text-left px-6 py-3.5 font-semibold text-ink-muted text-xs uppercase tracking-wide">Prodotto</th>
                  <th className="text-right px-6 py-3.5 font-semibold text-ink-muted text-xs uppercase tracking-wide">Qtà</th>
                  <th className="text-left px-6 py-3.5 font-semibold text-ink-muted text-xs uppercase tracking-wide">Unità</th>
                  <th className="text-right px-6 py-3.5 font-semibold text-ink-muted text-xs uppercase tracking-wide">€/u</th>
                  <th className="text-right px-6 py-3.5 font-semibold text-ink-muted text-xs uppercase tracking-wide">Totale</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-divider">
                {order.lineItems.map((li) => (
                  <tr key={li.id}>
                    <td className="px-6 py-3.5 text-ink">{li.ingredientName}</td>
                    <td className="px-6 py-3.5 text-right font-mono text-ink">{li.quantity}</td>
                    <td className="px-6 py-3.5 text-ink-muted">{UNIT_LABELS[li.unitSnapshot]}</td>
                    <td className="px-6 py-3.5 text-right font-mono text-ink-muted">
                      {li.unitPriceSnapshot !== null ? formatCurrency(li.unitPriceSnapshot) : '—'}
                    </td>
                    <td className="px-6 py-3.5 text-right font-mono font-medium text-ink">
                      {formatCurrency(li.lineTotal)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t border-border bg-bg">
                <tr>
                  <td colSpan={4} className="px-6 py-3.5 text-right text-sm font-medium text-ink-muted">
                    Totale ordine
                  </td>
                  <td className="px-6 py-3.5 text-right font-mono font-bold text-ink">
                    {formatCurrency(order.totalAmount)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Lotti e scadenze (HACCP) — su ordini ricevuti o parzialmente ricevuti */}
          {hasGoods && (
            <div className="bg-surface-2 rounded-2xl border border-border p-6">
              <div className="flex items-center justify-between mb-1">
                <h2 className="text-base font-bold text-ink">Lotti e scadenze</h2>
                <Link href="/inventory/batches" className="text-xs font-semibold text-primary hover:underline">
                  Tutte le scadenze →
                </Link>
              </div>
              <p className="text-xs text-ink-muted mb-4">
                Registra lotto e scadenza per gli ingredienti deperibili: abilita
                alert scadenza, consumo FEFO e tracciabilità di produzione.
              </p>

              {batches.length > 0 && (
                <div className="mb-4 divide-y divide-divider border border-divider rounded-xl overflow-hidden">
                  {batches.map((b) => (
                    <div key={b.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                      <span className="flex-1 text-ink">{b.ingredientName}</span>
                      <span className="font-mono text-xs text-ink-muted">{b.lotNumber ?? 'senza lotto'}</span>
                      <span className="font-mono text-xs text-ink-muted">
                        {b.quantityRemaining}/{b.quantityReceived} {UNIT_SHORT[b.unit]}
                      </span>
                      <span className="font-mono text-xs font-semibold text-ink">
                        scad. {new Date(b.expiryDate + 'T00:00:00').toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: '2-digit' })}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              <div className="space-y-3">
                {order.lineItems.map((li) => {
                  const registered = batchedQtyByIngredient.get(li.ingredientProductId) ?? 0;
                  const remaining = Math.max(0, li.quantity - registered);
                  if (remaining <= 0) return null;
                  return (
                    <div key={li.id} className="flex flex-wrap items-center gap-3 py-1">
                      <span className="text-sm text-ink w-44 truncate">{li.ingredientName}</span>
                      <RegisterBatchForm
                        orderId={order.id}
                        ingredientProductId={li.ingredientProductId}
                        defaultQuantity={remaining}
                        unit={li.unitSnapshot}
                      />
                    </div>
                  );
                })}
                {order.lineItems.every(
                  (li) => (batchedQtyByIngredient.get(li.ingredientProductId) ?? 0) >= li.quantity,
                ) && (
                  <p className="text-sm text-success-strong font-medium">✓ Tutte le righe hanno lotti registrati.</p>
                )}
              </div>
            </div>
          )}

          {/* Storico stati */}
          {history.length > 0 && (
            <div className="bg-surface-2 rounded-2xl border border-border p-6">
              <h2 className="text-base font-bold text-ink mb-4">Storico stato</h2>
              <ol className="space-y-4 relative">
                {history.map((ev, idx) => (
                  <li key={ev.id} className="flex gap-3 items-start">
                    <div className={`w-2.5 h-2.5 rounded-full mt-1.5 shrink-0 ${idx === history.length - 1 ? 'bg-primary' : 'bg-surface-offset'}`} />
                    <div>
                      <p className="text-sm text-ink">
                        {ev.fromStatus
                          ? <><span className="text-ink-muted">{STATUS_LABELS[ev.fromStatus]}</span> → <strong>{STATUS_LABELS[ev.toStatus]}</strong></>
                          : <strong>Ordine creato ({STATUS_LABELS[ev.toStatus]})</strong>
                        }
                      </p>
                      {ev.notes && <p className="text-xs text-ink-muted mt-0.5">{ev.notes}</p>}
                      <p className="text-xs text-ink-muted font-mono mt-0.5">
                        {new Date(ev.createdAt).toLocaleString('it-IT', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>

        {/* Colonna azioni */}
        <div className="space-y-4">
          {/* Info fornitore */}
          <div className="bg-surface-2 rounded-2xl border border-border p-5">
            <h2 className="text-xs font-semibold text-ink-muted uppercase tracking-wide mb-3">Fornitore</h2>
            <p className="text-sm font-semibold text-ink">{order.supplierName}</p>
            <p className="text-sm text-ink-muted mt-0.5">{order.supplierEmail}</p>
          </div>

          {order.notes && (
            <div className="bg-surface-2 rounded-2xl border border-border p-5">
              <h2 className="text-xs font-semibold text-ink-muted uppercase tracking-wide mb-2">Note</h2>
              <p className="text-sm text-ink whitespace-pre-wrap">{order.notes}</p>
            </div>
          )}

          {/* Documenti collegati */}
          {(order.status === 'received' || order.status === 'confirmed' || order.status === 'partial') && (
            <Link
              href={`/documents/new?order=${order.id}`}
              className="block w-full py-3 text-center border border-border text-ink rounded-xl text-sm font-semibold hover:bg-surface-offset transition-colors"
            >
              <ReceiptText size={15} className="inline-block mr-1.5 -mt-0.5" aria-hidden="true" /> Registra DDT / fattura
            </Link>
          )}

          {/* Ricevi merce → Goods Receipt Engine (preview editabile, poi conferma).
              Unica via di ingresso a magazzino: niente posting istantaneo. */}
          {canReceive && (
            <Link
              href={`/receipts/new?order=${order.id}`}
              className="block w-full py-3 text-center rounded-xl text-sm font-semibold bg-primary text-primary-fg hover:bg-primary-hover transition-colors"
            >
              <Package size={15} className="inline-block mr-1.5 -mt-0.5" aria-hidden="true" /> Ricevi merce
            </Link>
          )}

          {/* Azione avanzamento stato (non tocca il magazzino) */}
          {nextAction && (
            <form action={handleAdvance}>
              <input type="hidden" name="status" value={nextAction.toStatus} />
              <SubmitButton
                pendingLabel="Attendere…"
                className={
                  canReceive
                    ? 'w-full py-3 rounded-xl text-sm font-semibold border border-border text-ink hover:bg-surface-offset transition-colors'
                    : 'w-full py-3 rounded-xl text-sm font-semibold bg-primary text-primary-fg hover:bg-primary-hover transition-colors'
                }
              >
                {nextAction.label}
              </SubmitButton>
            </form>
          )}

          {/* Annulla */}
          {canCancel && (
            <form action={handleCancel}>
              <SubmitButton
                pendingLabel="Attendere…"
                className="w-full py-3 border border-danger-soft text-danger rounded-xl text-sm font-semibold hover:bg-danger-light transition-colors"
              >
                Annulla ordine
              </SubmitButton>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
