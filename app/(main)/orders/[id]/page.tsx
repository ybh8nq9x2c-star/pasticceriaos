// =============================================================================
// app/(main)/orders/[id]/page.tsx
// Dettaglio ordine d'acquisto con storico stati — Server Component.
// =============================================================================

import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getOrder, getOrderHistory } from '@/modules/ordering/service';
import { changeOrderStatusAction, cancelOrderAction } from '@/modules/ordering/actions';
import { IDLE_STATE, UNIT_LABELS } from '@/lib/utils';
import type { OrderStatus } from '@/modules/ordering/types';
import { StatusBadge } from '@/components/ui/StatusBadge';

export const metadata: Metadata = { title: 'Ordine' };

const STATUS_VARIANT: Record<OrderStatus, 'gray' | 'blue' | 'indigo' | 'green' | 'red'> = {
  draft:     'gray',
  sent:      'blue',
  confirmed: 'indigo',
  received:  'green',
  cancelled: 'red',
};

const STATUS_LABELS: Record<OrderStatus, string> = {
  draft:     'Bozza',
  sent:      'Inviato',
  confirmed: 'Confermato',
  received:  'Ricevuto',
  cancelled: 'Annullato',
};

// Pipeline lineare per lo stepper
const PIPELINE: OrderStatus[] = ['draft', 'sent', 'confirmed', 'received'];

const NEXT_ACTIONS: Partial<Record<OrderStatus, { toStatus: OrderStatus; label: string }>> = {
  draft:     { toStatus: 'sent',      label: 'Segna come inviato' },
  sent:      { toStatus: 'confirmed', label: 'Segna come confermato' },
  confirmed: { toStatus: 'received',  label: 'Segna come ricevuto' },
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
  let order, history;
  try {
    [order, history] = await Promise.all([
      getOrder(params.id),
      getOrderHistory(params.id),
    ]);
  } catch {
    notFound();
  }

  const nextAction = NEXT_ACTIONS[order.status];
  const canCancel  = order.status !== 'received' && order.status !== 'cancelled';

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
  const currentIdx = PIPELINE.indexOf(order.status);

  return (
    <div className="p-8 max-w-4xl mx-auto">
      {/* Breadcrumb + header */}
      <div className="mb-6">
        <Link href="/orders" className="text-sm text-[#6B7280] hover:text-[#1A2B4A] transition-colors">
          ← Ordini
        </Link>
        <div className="flex items-start justify-between gap-4 mt-3">
          <div>
            <h1 className="font-playfair text-3xl font-bold text-[#1A2B4A]">
              {order.supplierName}
            </h1>
            <p className="text-xs text-[#6B7280] font-mono mt-1.5">
              {formatDate(order.orderDate)}
              {order.expectedDate && ` · consegna ${formatDate(order.expectedDate)}`}
            </p>
          </div>
          <StatusBadge
            label={STATUS_LABELS[order.status]}
            variant={STATUS_VARIANT[order.status]}
            className="text-sm px-3 py-1"
          />
        </div>
      </div>

      {/* Stepper orizzontale */}
      <div className="bg-white rounded-2xl border border-[#E5DDD0] p-6 mb-6">
        <div className="flex items-center">
          {PIPELINE.map((step, idx) => {
            const isDone    = !isCancelled && idx < currentIdx;
            const isCurrent = !isCancelled && idx === currentIdx;
            const dotClass = isCancelled
              ? 'bg-[#E5DDD0] text-[#6B7280]'
              : isCurrent
              ? 'bg-[#C9962A] text-[#1A2B4A] ring-4 ring-[#C9962A]/20'
              : isDone
              ? 'bg-[#27AE60] text-white'
              : 'bg-[#F0EBE1] text-[#6B7280]';
            const labelClass = isCurrent
              ? 'text-[#1A2B4A] font-semibold'
              : isDone
              ? 'text-[#27AE60]'
              : 'text-[#6B7280]';
            return (
              <div key={step} className="flex items-center flex-1 last:flex-none">
                <div className="flex flex-col items-center gap-1.5">
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-mono font-medium ${dotClass}`}>
                    {isDone ? '✓' : idx + 1}
                  </div>
                  <span className={`text-xs ${labelClass}`}>{STATUS_LABELS[step]}</span>
                </div>
                {idx < PIPELINE.length - 1 && (
                  <div className={`flex-1 h-0.5 mx-2 -mt-5 ${!isCancelled && idx < currentIdx ? 'bg-[#27AE60]' : 'bg-[#F0EBE1]'}`} />
                )}
              </div>
            );
          })}
        </div>
        {isCancelled && (
          <p className="text-center text-xs text-[#C0392B] font-semibold mt-4">
            Questo ordine è stato annullato.
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Righe ordine */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-2xl border border-[#E5DDD0] overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-[#FAF7F2] border-b border-[#E5DDD0]">
                <tr>
                  <th className="text-left px-6 py-3.5 font-semibold text-[#6B7280] text-xs uppercase tracking-wide">Prodotto</th>
                  <th className="text-right px-6 py-3.5 font-semibold text-[#6B7280] text-xs uppercase tracking-wide">Qtà</th>
                  <th className="text-left px-6 py-3.5 font-semibold text-[#6B7280] text-xs uppercase tracking-wide">Unità</th>
                  <th className="text-right px-6 py-3.5 font-semibold text-[#6B7280] text-xs uppercase tracking-wide">€/u</th>
                  <th className="text-right px-6 py-3.5 font-semibold text-[#6B7280] text-xs uppercase tracking-wide">Totale</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F0EBE1]">
                {order.lineItems.map((li) => (
                  <tr key={li.id}>
                    <td className="px-6 py-3.5 text-[#1A1A2E]">{li.ingredientName}</td>
                    <td className="px-6 py-3.5 text-right font-mono text-[#1A2B4A]">{li.quantity}</td>
                    <td className="px-6 py-3.5 text-[#6B7280]">{UNIT_LABELS[li.unitSnapshot]}</td>
                    <td className="px-6 py-3.5 text-right font-mono text-[#6B7280]">
                      {li.unitPriceSnapshot !== null ? formatCurrency(li.unitPriceSnapshot) : '—'}
                    </td>
                    <td className="px-6 py-3.5 text-right font-mono font-medium text-[#1A2B4A]">
                      {formatCurrency(li.lineTotal)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t border-[#E5DDD0] bg-[#FAF7F2]">
                <tr>
                  <td colSpan={4} className="px-6 py-3.5 text-right text-sm font-medium text-[#6B7280]">
                    Totale ordine
                  </td>
                  <td className="px-6 py-3.5 text-right font-mono font-bold text-[#1A2B4A]">
                    {formatCurrency(order.totalAmount)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Storico stati */}
          {history.length > 0 && (
            <div className="bg-white rounded-2xl border border-[#E5DDD0] p-6">
              <h2 className="font-playfair text-base font-bold text-[#1A2B4A] mb-4">Storico stato</h2>
              <ol className="space-y-4 relative">
                {history.map((ev, idx) => (
                  <li key={ev.id} className="flex gap-3 items-start">
                    <div className={`w-2.5 h-2.5 rounded-full mt-1.5 shrink-0 ${idx === history.length - 1 ? 'bg-[#C9962A]' : 'bg-[#E5DDD0]'}`} />
                    <div>
                      <p className="text-sm text-[#1A1A2E]">
                        {ev.fromStatus
                          ? <><span className="text-[#6B7280]">{STATUS_LABELS[ev.fromStatus]}</span> → <strong>{STATUS_LABELS[ev.toStatus]}</strong></>
                          : <strong>Ordine creato ({STATUS_LABELS[ev.toStatus]})</strong>
                        }
                      </p>
                      {ev.notes && <p className="text-xs text-[#6B7280] mt-0.5">{ev.notes}</p>}
                      <p className="text-xs text-[#6B7280] font-mono mt-0.5">
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
          <div className="bg-white rounded-2xl border border-[#E5DDD0] p-5">
            <h2 className="text-[11px] font-semibold text-[#6B7280] uppercase tracking-wide mb-3">Fornitore</h2>
            <p className="text-sm font-semibold text-[#1A2B4A]">{order.supplierName}</p>
            <p className="text-sm text-[#6B7280] mt-0.5">{order.supplierEmail}</p>
          </div>

          {order.notes && (
            <div className="bg-white rounded-2xl border border-[#E5DDD0] p-5">
              <h2 className="text-[11px] font-semibold text-[#6B7280] uppercase tracking-wide mb-2">Note</h2>
              <p className="text-sm text-[#1A1A2E] whitespace-pre-wrap">{order.notes}</p>
            </div>
          )}

          {/* Azione avanzamento stato */}
          {nextAction && (
            <form action={handleAdvance}>
              <input type="hidden" name="status" value={nextAction.toStatus} />
              <button
                type="submit"
                className="w-full py-3 rounded-xl text-sm font-semibold bg-[#1A2B4A] text-white hover:bg-[#243660] transition-colors"
              >
                {nextAction.label}
              </button>
            </form>
          )}

          {/* Annulla */}
          {canCancel && (
            <form action={handleCancel}>
              <button
                type="submit"
                className="w-full py-3 border border-[#C0392B]/40 text-[#C0392B] rounded-xl text-sm font-semibold hover:bg-[#C0392B]/[0.06] transition-colors"
              >
                Annulla ordine
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
