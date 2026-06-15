'use client';

// =============================================================================
// <StockAdjustPanel> — rettifica stock al volo dalla scheda ingrediente.
// "Io adesso conto X" → porta il sistema a X registrando un movimento di
// rettifica tracciato. Owner/baker possono rettificare; il viewer vede solo il
// valore. Mobile-first, conferma esplicita prima di scrivere.
// =============================================================================

import { useEffect, useState } from 'react';
import { Boxes } from 'lucide-react';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { adjustStockAction } from '@/modules/inventory/actions';
import { IDLE_STATE, UNIT_LABELS } from '@/lib/utils';
import type { UnitOfMeasure } from '@/lib/database.types';

function fmt(n: number): string {
  return (Number.isInteger(n) ? String(n) : String(Math.round(n * 1000) / 1000)).replace('.', ',');
}

export function StockAdjustPanel({
  ingredientId,
  ingredientName,
  unit,
}: {
  ingredientId: string;
  ingredientName: string;
  unit: UnitOfMeasure;
}) {
  const [current, setCurrent] = useState<number | null>(null);
  const [canAdjust, setCanAdjust] = useState(false);
  const [loading, setLoading] = useState(true);
  const [counted, setCounted] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    let active = true;
    fetch(`/api/inventory/level/${ingredientId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (active && d) {
          setCurrent(d.currentQuantity);
          setCanAdjust(d.canAdjust);
        }
      })
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [ingredientId]);

  const countedNum = parseFloat(counted.replace(',', '.'));
  const valid = counted.trim() !== '' && !Number.isNaN(countedNum) && countedNum >= 0;
  const diff = valid && current !== null ? Math.round((countedNum - current) * 1000) / 1000 : 0;
  const willChange = valid && current !== null && diff !== 0;

  async function submit() {
    setPending(true);
    setFeedback(null);
    const fd = new FormData();
    fd.set('ingredientProductId', ingredientId);
    fd.set('countedQuantity', counted.replace(',', '.'));
    fd.set('unit', unit);
    const res = await adjustStockAction(IDLE_STATE, fd);
    setPending(false);
    if (res.status === 'success') {
      setCurrent(countedNum); // la rettifica porta lo stock al conteggio reale
      setCounted('');
      setFeedback({ kind: 'success', text: res.message ?? 'Stock allineato.' });
    } else if (res.status === 'error') {
      setFeedback({ kind: 'error', text: res.error });
    }
  }

  return (
    <div className="mt-8 rounded-2xl border border-border bg-surface-2 p-6">
      <h3 className="text-base font-bold text-ink mb-1 flex items-center gap-2">
        <Boxes size={18} aria-hidden="true" /> Rettifica stock
      </h3>
      <p className="text-xs text-ink-muted mb-4">
        Allinea il magazzino al conteggio fisico reale. Viene registrato un movimento di rettifica tracciato.
      </p>

      {loading ? (
        <div className="h-12 rounded-xl bg-surface-offset animate-pulse" />
      ) : (
        <>
          <div className="flex items-baseline justify-between rounded-xl bg-bg border border-divider px-4 py-3 mb-4">
            <span className="text-sm text-ink-muted">Stock attuale (sistema)</span>
            <span className="font-mono text-lg font-semibold text-ink">
              {current !== null ? fmt(current) : '—'}{' '}
              <span className="text-sm font-sans text-ink-muted">{UNIT_LABELS[unit]}</span>
            </span>
          </div>

          {feedback && (
            <p
              role={feedback.kind === 'error' ? 'alert' : 'status'}
              className={`mb-3 rounded-md px-3 py-2 text-sm ${
                feedback.kind === 'error' ? 'bg-danger-light text-danger' : 'bg-success-light text-success-strong'
              }`}
            >
              {feedback.text}
            </p>
          )}

          {canAdjust ? (
            <div>
              <label className="block text-sm font-medium text-ink mb-1.5">Conteggio reale</label>
              <div className="flex items-stretch gap-2">
                <input
                  value={counted}
                  onChange={(e) => setCounted(e.target.value)}
                  inputMode="decimal"
                  placeholder={current !== null ? fmt(current) : '0'}
                  className="w-36 rounded-xl border border-border px-3 py-2.5 text-sm font-mono text-center bg-surface-2 focus:outline-none focus:ring-2 focus:ring-primary-ring"
                />
                <span className="flex items-center px-2 text-sm text-ink-muted shrink-0">{UNIT_LABELS[unit]}</span>
                <button
                  type="button"
                  disabled={!willChange || pending}
                  onClick={() => setConfirmOpen(true)}
                  className="flex-1 py-2.5 bg-primary text-primary-fg rounded-xl text-sm font-semibold hover:bg-primary-hover disabled:opacity-60 transition-colors"
                >
                  {pending ? 'Allineo…' : 'Allinea'}
                </button>
              </div>
              {valid && current !== null && (
                <p className="mt-1.5 text-xs text-ink-muted">
                  {willChange ? (
                    <>
                      Differenza:{' '}
                      <strong className={diff > 0 ? 'text-success-strong' : 'text-danger'}>
                        {diff > 0 ? '+' : ''}
                        {fmt(diff)} {UNIT_LABELS[unit]}
                      </strong>
                    </>
                  ) : (
                    'Già allineato: nessun movimento da registrare.'
                  )}
                </p>
              )}
            </div>
          ) : (
            <p className="text-xs text-ink-muted">
              Solo il titolare o il responsabile possono rettificare lo stock.
            </p>
          )}
        </>
      )}

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Confermi la rettifica?"
        description={
          current !== null && valid
            ? `Stai portando lo stock di ${ingredientName} da ${fmt(current)} a ${fmt(countedNum)} ${UNIT_LABELS[unit]}. Verrà registrato un movimento di rettifica.`
            : undefined
        }
        confirmLabel="Allinea stock"
        confirmVariant="primary"
        onConfirm={submit}
      />
    </div>
  );
}
