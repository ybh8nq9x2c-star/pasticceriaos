'use client';

// =============================================================================
// app/(main)/sales/new/RecordSaleForm.tsx
// Form vendita manuale a righe dinamiche. Le righe vengono serializzate in JSON
// nel campo nascosto `lines`; il service risolve le ricette e scala i prodotti finiti (050).
// Selezionare una ricetta per riga è facoltativo: senza, il prodotto viene
// risolto per nome/mapping e — se non collegato — la vendita resta registrata
// ma non dedotta (la si collega poi da /sales).
// =============================================================================

import { useState } from 'react';
import { useFormState } from 'react-dom';
import Link from 'next/link';
import { IDLE_STATE } from '@/lib/utils';
import { recordSaleAction } from '@/modules/sales/actions';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { StickyActionBar } from '@/components/ui/StickyActionBar';

interface LineRow {
  key: number;
  externalProductRef: string;
  recipeId: string;
  quantity: string;
  unitPrice: string;
}

/** Riga di prefill (P0-C: vendita proposta dal ritiro di un ordine cliente). */
export interface InitialSaleLine {
  externalProductRef: string;
  recipeId: string;
  quantity: string;
  unitPrice: string;
}

let keyCounter = 0;
const newLine = (): LineRow => ({
  key: ++keyCounter, externalProductRef: '', recipeId: '', quantity: '1', unitPrice: '',
});

const labelClass = 'block text-sm font-medium text-ink mb-1.5';
const fieldClass =
  'w-full rounded-xl border border-border px-3 py-2.5 text-sm bg-surface-2 focus:outline-none focus:ring-2 focus:ring-primary-ring focus:border-primary';

// Default leggibile per l'ID scontrino (l'idempotenza è su org+source+id).
const defaultSaleId = () => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `SC-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
};

export function RecordSaleForm({
  recipes,
  initialLines,
  contextBanner,
}: {
  recipes: { id: string; name: string }[];
  initialLines?: InitialSaleLine[];
  contextBanner?: string;
}) {
  const [state, formAction] = useFormState(recordSaleAction, IDLE_STATE);
  const [lines, setLines] = useState<LineRow[]>(() =>
    initialLines && initialLines.length > 0
      ? initialLines.map((l) => ({ key: ++keyCounter, ...l }))
      : [newLine()],
  );

  function update(key: number, field: keyof LineRow, value: string) {
    setLines((prev) =>
      prev.map((l) => {
        if (l.key !== key) return l;
        const next = { ...l, [field]: value };
        // Scegliendo una ricetta, precompila il nome prodotto se vuoto.
        if (field === 'recipeId' && value && !l.externalProductRef) {
          const r = recipes.find((x) => x.id === value);
          if (r) next.externalProductRef = r.name;
        }
        return next;
      }),
    );
  }

  function handleSubmit(formData: FormData) {
    formData.set(
      'lines',
      JSON.stringify(
        lines
          .filter((l) => l.externalProductRef.trim())
          .map((l) => ({
            externalProductRef: l.externalProductRef.trim(),
            productName: l.externalProductRef.trim(),
            recipeId: l.recipeId || undefined,
            quantity: l.quantity,
            unitPrice: l.unitPrice ? l.unitPrice.replace(',', '.') : undefined,
          })),
      ),
    );
    formAction(formData);
  }

  const total = lines.reduce((s, l) => {
    const q = parseFloat(l.quantity.replace(',', '.')) || 0;
    const p = parseFloat(l.unitPrice.replace(',', '.')) || 0;
    return s + q * p;
  }, 0);

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-2xl mx-auto">
      <div className="mb-6">
        <Link href="/sales" className="text-sm text-ink-muted hover:text-ink transition-colors">
          ← Vendite
        </Link>
        <h1 className="text-3xl font-bold text-ink mt-3">Registra vendita</h1>
        <p className="text-sm text-ink-muted mt-1">
          Alla conferma, i prodotti finiti vengono scalati automaticamente (le materie prime si consumano in produzione).
        </p>
      </div>

      {/* P0-C: contesto del ritiro — dice cosa succede confermando e come uscirne. */}
      {contextBanner && (
        <div role="status" className="mb-4 rounded-xl bg-primary-light border border-primary-soft p-3 text-sm text-ink">
          🎂 {contextBanner}
        </div>
      )}

      {state.status === 'success' && (
        <div className="mb-4 rounded-xl bg-success-light border border-success-soft p-3 text-sm text-success-strong">
          {state.message} <Link href="/sales" className="underline font-semibold">Vai alle vendite</Link>
        </div>
      )}

      <form action={handleSubmit} className="space-y-6">
        {state.status === 'error' && (
          <div className="rounded-xl bg-danger-light border border-danger-soft p-3 text-sm text-danger">
            {state.error}
          </div>
        )}

        <div className="bg-surface-2 rounded-2xl border border-border p-4 sm:p-6 space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>ID scontrino <span className="text-danger">*</span></label>
              <input name="externalSaleId" type="text" required defaultValue={defaultSaleId()} className={fieldClass} />
            </div>
            <div>
              <label className={labelClass}>Data/ora</label>
              <input name="soldAt" type="datetime-local" className={fieldClass} />
            </div>
          </div>
          <div>
            <label className={labelClass}>Note</label>
            <textarea name="notes" rows={2} maxLength={2000} className={`${fieldClass} resize-none`} />
          </div>
        </div>

        {/* Righe vendita */}
        <div className="bg-surface-2 rounded-2xl border border-border p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-bold text-ink">Prodotti venduti <span className="text-danger">*</span></h2>
            <button
              type="button"
              onClick={() => setLines((p) => [...p, newLine()])}
              className="min-h-[44px] px-3 -my-2 -mr-3 text-xs font-semibold text-primary hover:underline"
            >
              + Aggiungi riga
            </button>
          </div>

          <div className="space-y-3">
            {lines.map((line, idx) => (
              <div key={line.key} className="rounded-xl border border-divider p-3 space-y-2">
                {/* Riga 1: prodotto + rimuovi (tap target 44px) */}
                <div className="flex items-center gap-2">
                  <span className="w-5 font-mono text-xs text-ink-muted">{idx + 1}</span>
                  <input
                    type="text"
                    placeholder="Nome/codice prodotto — es. Cannoncino"
                    value={line.externalProductRef}
                    onChange={(e) => update(line.key, 'externalProductRef', e.target.value)}
                    className="flex-1 min-w-0 h-11 rounded-lg border border-border px-3 text-sm bg-surface-2 focus:outline-none focus:ring-2 focus:ring-primary-ring"
                  />
                  {lines.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setLines((p) => p.filter((l) => l.key !== line.key))}
                      aria-label={`Rimuovi riga ${idx + 1}`}
                      className="shrink-0 w-11 h-11 -mr-1 flex items-center justify-center rounded-lg text-ink-faint hover:text-danger hover:bg-danger-light text-xl leading-none transition-colors"
                    >
                      ×
                    </button>
                  )}
                </div>
                {/* Riga 2: quantità + prezzo unitario */}
                <div className="flex items-center gap-2 pl-7">
                  <input
                    type="number" min="0" step="0.001" inputMode="decimal"
                    aria-label="Quantità"
                    value={line.quantity}
                    onChange={(e) => update(line.key, 'quantity', e.target.value)}
                    className="w-24 h-11 rounded-lg border border-border px-2 text-sm text-center font-mono focus:outline-none focus:ring-2 focus:ring-primary-ring"
                  />
                  <input
                    type="number" step="0.01" min="0" inputMode="decimal" placeholder="€ unitario"
                    aria-label="Prezzo unitario"
                    value={line.unitPrice}
                    onChange={(e) => update(line.key, 'unitPrice', e.target.value)}
                    className="flex-1 min-w-0 h-11 rounded-lg border border-border px-2 text-sm text-center font-mono focus:outline-none focus:ring-2 focus:ring-primary-ring"
                  />
                </div>
                <select
                  value={line.recipeId}
                  onChange={(e) => update(line.key, 'recipeId', e.target.value)}
                  className="w-full h-11 rounded-lg border border-border px-2 text-sm bg-surface-2 text-ink-muted focus:outline-none focus:ring-2 focus:ring-primary-ring"
                >
                  <option value="">Ricetta: auto (per nome/collegamento)…</option>
                  {recipes.map((r) => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>

          {total > 0 && (
            <div className="mt-4 pt-4 border-t border-divider flex justify-end text-sm">
              <span className="text-ink-muted">Totale:&nbsp;</span>
              <span className="font-mono font-semibold text-ink">
                {new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(total)}
              </span>
            </div>
          )}
        </div>

        {/* CTA sempre visibile su mobile (sopra la tab bar), statica su desktop */}
        <StickyActionBar>
          <div className="flex gap-3">
            <Link href="/sales" className="flex-1 h-12 flex items-center justify-center rounded-xl border border-border text-sm font-semibold text-ink bg-surface-2 hover:bg-surface-offset">
              Annulla
            </Link>
            <SubmitButton
              pendingLabel="Registrazione…"
              className="flex-[2] h-12 bg-primary text-primary-fg rounded-xl text-sm font-semibold hover:bg-primary-hover transition-colors"
            >
              Registra vendita
            </SubmitButton>
          </div>
        </StickyActionBar>
      </form>
    </div>
  );
}
