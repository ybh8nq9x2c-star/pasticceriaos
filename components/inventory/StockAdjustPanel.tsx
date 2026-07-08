'use client';

// =============================================================================
// <StockAdjustPanel> — rettifica stock al volo dalla scheda ingrediente.
// Due modalità (audit/UX #3):
//  • "Aggiungi / Togli" (DEFAULT): il pasticcere pensa in DELTA ("ho messo +2 kg").
//    Registra un movimento manual_adjustment col delta firmato (no conversione mentale).
//  • "Conteggio": "adesso conto X" → porta lo stock a X (delta calcolato server-side).
// Owner/baker possono rettificare; il viewer vede solo il valore. Mobile-first,
// conferma esplicita prima di scrivere.
// =============================================================================

import { useState } from 'react';
import { Boxes, Plus, Minus } from 'lucide-react';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { adjustStockAction, recordMovementAction } from '@/modules/inventory/actions';
import { IDLE_STATE, UNIT_LABELS } from '@/lib/utils';
import type { UnitOfMeasure } from '@/lib/database.types';

function fmt(n: number): string {
  return (Number.isInteger(n) ? String(n) : String(Math.round(n * 1000) / 1000)).replace('.', ',');
}

type Mode = 'delta' | 'absolute';

// Motivi predefiniti della rettifica → finiscono nella nota del movimento
// manual_adjustment (audit trail semantico, zero campi obbligatori in più).
const REASONS = ['Conteggio fisico', 'Spreco', 'Correzione'] as const;

export function StockAdjustPanel({
  ingredientId,
  ingredientName,
  unit,
  initialQuantity,
  canAdjust,
}: {
  ingredientId: string;
  ingredientName: string;
  unit: UnitOfMeasure;
  /** Giacenza corrente caricata dal SERVER (P0-1: niente fetch client muta). */
  initialQuantity: number;
  /** Ruolo verificato dal server: viewer = sola lettura. */
  canAdjust: boolean;
}) {
  const [current, setCurrent] = useState<number | null>(initialQuantity);
  const [mode, setMode] = useState<Mode>('delta');
  const [sign, setSign] = useState<1 | -1>(1); // delta: aggiungi (+) / togli (−)
  const [reason, setReason] = useState<string>(REASONS[0]); // motivo rettifica (audit trail)
  const [note, setNote] = useState(''); // nota libera, solo se serve
  const [value, setValue] = useState(''); // magnitudine (delta) o conteggio (absolute)
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  const num = parseFloat(value.replace(',', '.'));
  const hasNum = value.trim() !== '' && !Number.isNaN(num);
  // delta: il valore è una magnitudine ≥ 0; absolute: un conteggio ≥ 0.
  const valid = mode === 'delta' ? hasNum && num > 0 : hasNum && num >= 0;
  const delta =
    mode === 'delta'
      ? sign * Math.round(num * 1000) / 1000
      : valid && current !== null
        ? Math.round((num - current) * 1000) / 1000
        : 0;
  const newStock = current !== null ? Math.round((current + delta) * 1000) / 1000 : null;
  const willChange = valid && current !== null && delta !== 0;

  function reset() {
    setValue('');
  }

  async function submit() {
    setPending(true);
    setFeedback(null);
    const fd = new FormData();
    let res;
    if (mode === 'delta') {
      // Delta diretto come movimento di rettifica (manual_adjustment richiede una nota).
      fd.set('ingredientProductId', ingredientId);
      fd.set('movementType', 'manual_adjustment');
      fd.set('quantityDelta', String(delta));
      fd.set('unit', unit);
      fd.set('notes', `${reason}: ${delta > 0 ? '+' : ''}${fmt(delta)} ${UNIT_LABELS[unit]}${note.trim() ? ` — ${note.trim()}` : ''}`);
      res = await recordMovementAction(IDLE_STATE, fd);
    } else {
      fd.set('ingredientProductId', ingredientId);
      fd.set('countedQuantity', value.replace(',', '.'));
      fd.set('unit', unit);
      res = await adjustStockAction(IDLE_STATE, fd);
    }
    setPending(false);
    if (res.status === 'success') {
      if (newStock !== null) setCurrent(newStock);
      reset();
      setFeedback({ kind: 'success', text: res.status === 'success' ? (res.message ?? 'Stock aggiornato.') : '' });
    } else if (res.status === 'error') {
      setFeedback({ kind: 'error', text: res.error });
    }
  }

  const tab = (m: Mode, label: string) => (
    <button
      type="button"
      onClick={() => {
        setMode(m);
        reset();
      }}
      className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-colors ${
        mode === m ? 'bg-primary text-primary-fg' : 'text-ink-muted hover:text-ink'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="mt-8 rounded-2xl border border-border bg-surface-2 p-6">
      <h3 className="text-base font-bold text-ink mb-1 flex items-center gap-2">
        <Boxes size={18} aria-hidden="true" /> Rettifica stock
      </h3>
      <p className="text-xs text-ink-muted mb-4">
        Aggiungi o togli quantità, oppure allinea al conteggio fisico. Viene registrato un movimento tracciato.
      </p>

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
              {/* Toggle modalità */}
              <div className="flex gap-1 p-1 rounded-xl bg-bg border border-divider mb-3">
                {tab('delta', 'Aggiungi / Togli')}
                {tab('absolute', 'Conteggio')}
              </div>

              {mode === 'delta' ? (
                <div className="space-y-2">
                  <div className="flex items-stretch gap-2">
                    <div className="flex rounded-xl border border-border overflow-hidden shrink-0">
                      <button
                        type="button"
                        aria-label="Togli"
                        onClick={() => setSign(-1)}
                        className={`px-3 ${sign === -1 ? 'bg-danger text-white' : 'bg-surface-2 text-ink-muted hover:text-ink'}`}
                      >
                        <Minus size={16} />
                      </button>
                      <button
                        type="button"
                        aria-label="Aggiungi"
                        onClick={() => setSign(1)}
                        className={`px-3 ${sign === 1 ? 'bg-success text-white' : 'bg-surface-2 text-ink-muted hover:text-ink'}`}
                      >
                        <Plus size={16} />
                      </button>
                    </div>
                    <input
                      value={value}
                      onChange={(e) => setValue(e.target.value)}
                      inputMode="decimal"
                      placeholder="0"
                      aria-label="Quantità da aggiungere o togliere"
                      className="w-28 rounded-xl border border-border px-3 py-2.5 text-sm font-mono text-center bg-surface-2 focus:outline-none focus:ring-2 focus:ring-primary-ring"
                    />
                    <span className="flex items-center px-1 text-sm text-ink-muted shrink-0">{UNIT_LABELS[unit]}</span>
                    <button
                      type="button"
                      disabled={!willChange || pending}
                      onClick={() => setConfirmOpen(true)}
                      className="flex-1 py-2.5 bg-primary text-primary-fg rounded-xl text-sm font-semibold hover:bg-primary-hover disabled:opacity-60 transition-colors"
                    >
                      {pending ? 'Registro…' : 'Registra'}
                    </button>
                  </div>

                  {/* Motivo (audit trail) — chip predefinite + nota libera solo se serve */}
                  <div className="flex flex-wrap gap-1.5">
                    {REASONS.map((r) => (
                      <button
                        key={r}
                        type="button"
                        onClick={() => setReason(r)}
                        className={`px-2.5 py-1 rounded-full text-xs font-semibold transition-colors ${
                          reason === r ? 'bg-primary text-primary-fg' : 'bg-bg border border-border text-ink-muted hover:text-ink'
                        }`}
                      >
                        {r}
                      </button>
                    ))}
                    <input
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder="nota (opz.)"
                      aria-label="Nota rettifica"
                      className="flex-1 min-w-[6rem] rounded-full border border-border bg-surface-2 px-3 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary-ring"
                    />
                  </div>
                </div>
              ) : (
                <div className="flex items-stretch gap-2">
                  <input
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    inputMode="decimal"
                    placeholder={current !== null ? fmt(current) : '0'}
                    aria-label="Conteggio reale"
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
              )}

              {valid && current !== null && newStock !== null && (
                <p className="mt-1.5 text-xs text-ink-muted">
                  {willChange ? (
                    <>
                      Nuovo stock:{' '}
                      <strong className="text-ink">
                        {fmt(newStock)} {UNIT_LABELS[unit]}
                      </strong>{' '}
                      <span className={delta > 0 ? 'text-success-strong' : 'text-danger'}>
                        ({delta > 0 ? '+' : ''}
                        {fmt(delta)})
                      </span>
                    </>
                  ) : (
                    'Nessun movimento da registrare.'
                  )}
                </p>
              )}
            </div>
          ) : (
            <p className="text-xs text-ink-muted">Solo il titolare o il responsabile possono rettificare lo stock.</p>
          )}
      </>

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Confermi la rettifica?"
        description={
          current !== null && valid && newStock !== null
            ? mode === 'delta'
              ? `Registri ${delta > 0 ? '+' : ''}${fmt(delta)} ${UNIT_LABELS[unit]} su ${ingredientName}: da ${fmt(current)} a ${fmt(newStock)}.`
              : `Stai portando lo stock di ${ingredientName} da ${fmt(current)} a ${fmt(newStock)} ${UNIT_LABELS[unit]}.`
            : undefined
        }
        confirmLabel={mode === 'delta' ? 'Registra' : 'Allinea stock'}
        confirmVariant="primary"
        onConfirm={submit}
      />
    </div>
  );
}
