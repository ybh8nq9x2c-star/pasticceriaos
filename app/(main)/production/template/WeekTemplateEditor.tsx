'use client';

// =============================================================================
// app/(main)/production/template/WeekTemplateEditor.tsx
// Editor "settimana tipo": 7 giorni (Lun–Dom), righe ricetta + batch per giorno.
// "Applica alla settimana" salva e crea i piani giornalieri MANCANTI dei prossimi
// 7 giorni (i giorni già pianificati non vengono toccati).
// =============================================================================

import { useState } from 'react';
import { useFormState } from 'react-dom';
import Link from 'next/link';
import { CalendarDays } from 'lucide-react';
import { IDLE_STATE } from '@/lib/utils';
import { saveWeekTemplateAction, applyWeekTemplateAction } from '@/modules/production/actions';
import { SubmitButton } from '@/components/ui/SubmitButton';

interface Recipe { id: string; name: string }
interface Row { key: number; recipeId: string; batchCount: string }
interface DayState { weekday: number; rows: Row[] }
interface TemplateDay { weekday: number; items: { recipeId: string; recipeName: string; batchCount: number }[] }

// Visualizzazione Lun→Dom (weekday JS: 0=dom..6=sab).
const DISPLAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
const DAY_LABELS: Record<number, string> = {
  1: 'Lunedì', 2: 'Martedì', 3: 'Mercoledì', 4: 'Giovedì', 5: 'Venerdì', 6: 'Sabato', 0: 'Domenica',
};

let seq = 0;

export function WeekTemplateEditor({ template, recipes }: { template: TemplateDay[]; recipes: Recipe[] }) {
  const [days, setDays] = useState<DayState[]>(
    DISPLAY_ORDER.map((wd) => {
      const t = template.find((d) => d.weekday === wd);
      return {
        weekday: wd,
        rows: (t?.items ?? []).map((it) => ({ key: ++seq, recipeId: it.recipeId, batchCount: String(it.batchCount) })),
      };
    }),
  );
  const [saveState, saveAction] = useFormState(saveWeekTemplateAction, IDLE_STATE);
  const [applyState, applyAction] = useFormState(applyWeekTemplateAction, IDLE_STATE);

  function addRow(wd: number) {
    setDays((p) => p.map((d) => (d.weekday === wd ? { ...d, rows: [...d.rows, { key: ++seq, recipeId: '', batchCount: '1' }] } : d)));
  }
  function removeRow(wd: number, key: number) {
    setDays((p) => p.map((d) => (d.weekday === wd ? { ...d, rows: d.rows.filter((r) => r.key !== key) } : d)));
  }
  function updateRow(wd: number, key: number, field: 'recipeId' | 'batchCount', value: string) {
    setDays((p) => p.map((d) => (d.weekday === wd ? { ...d, rows: d.rows.map((r) => (r.key === key ? { ...r, [field]: value } : r)) } : d)));
  }

  /** Righe valide, deduplicate per (giorno, ricetta) — la prima vince. */
  function buildItems() {
    const seen = new Set<string>();
    const items: { weekday: number; recipeId: string; batchCount: number }[] = [];
    for (const d of days) {
      for (const r of d.rows) {
        const n = parseInt(r.batchCount) || 0;
        if (!r.recipeId || n <= 0) continue;
        const k = `${d.weekday}:${r.recipeId}`;
        if (seen.has(k)) continue;
        seen.add(k);
        items.push({ weekday: d.weekday, recipeId: r.recipeId, batchCount: n });
      }
    }
    return items;
  }
  function withItems(action: (fd: FormData) => void) {
    return (fd: FormData) => {
      fd.set('items', JSON.stringify(buildItems()));
      action(fd);
    };
  }

  const total = days.reduce((n, d) => n + d.rows.filter((r) => r.recipeId).length, 0);

  // L'ultimo esito (apply prevale su save) come messaggio inline.
  const feedback =
    applyState.status === 'error' ? { kind: 'error' as const, text: applyState.error }
    : applyState.status === 'success' ? { kind: 'success' as const, text: applyState.message ?? 'Fatto.' }
    : saveState.status === 'error' ? { kind: 'error' as const, text: saveState.error }
    : saveState.status === 'success' ? { kind: 'success' as const, text: saveState.message ?? 'Salvato.' }
    : null;

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <div className="mb-6">
        <Link href="/production" className="text-sm text-ink-muted hover:text-ink transition-colors">← Produzione</Link>
        <h1 className="text-3xl font-bold text-ink mt-3 flex items-center gap-2">
          <CalendarDays className="size-7 text-primary" aria-hidden="true" /> Settimana tipo
        </h1>
        <p className="text-sm text-ink-muted mt-1">
          Imposta cosa produci di solito ogni giorno. Poi <strong>“Applica alla settimana”</strong> crea i piani dei
          prossimi 7 giorni — i giorni già pianificati restano come sono.
        </p>
      </div>

      {feedback && (
        <div
          className={`mb-4 rounded-xl px-4 py-3 text-sm ${
            feedback.kind === 'error'
              ? 'bg-danger-light border border-danger-soft text-danger'
              : 'bg-success-light border border-success-soft text-success-strong'
          }`}
        >
          {feedback.text}
        </div>
      )}

      <div className="space-y-3">
        {days.map((d) => (
          <section key={d.weekday} className="bg-surface-2 rounded-2xl border border-border p-4">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-bold text-ink">{DAY_LABELS[d.weekday]}</h2>
              <button type="button" onClick={() => addRow(d.weekday)} className="text-xs font-semibold text-primary hover:underline">
                + Ricetta
              </button>
            </div>
            {d.rows.length === 0 ? (
              <p className="text-xs text-ink-faint">Niente di fisso questo giorno.</p>
            ) : (
              <div className="space-y-2">
                {d.rows.map((r) => (
                  <div key={r.key} className="flex items-center gap-2">
                    <select
                      value={r.recipeId}
                      onChange={(e) => updateRow(d.weekday, r.key, 'recipeId', e.target.value)}
                      aria-label="Ricetta"
                      className="flex-1 rounded-lg border border-border bg-surface-2 px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-ring"
                    >
                      <option value="">Seleziona ricetta…</option>
                      {recipes.map((rec) => (
                        <option key={rec.id} value={rec.id}>{rec.name}</option>
                      ))}
                    </select>
                    <input
                      type="number"
                      min={1}
                      value={r.batchCount}
                      onChange={(e) => updateRow(d.weekday, r.key, 'batchCount', e.target.value)}
                      aria-label="Infornate"
                      className="w-16 rounded-lg border border-border px-2 py-2 text-sm text-center font-mono focus:outline-none focus:ring-2 focus:ring-primary-ring"
                    />
                    <button
                      type="button"
                      onClick={() => removeRow(d.weekday, r.key)}
                      className="text-ink-faint hover:text-danger text-lg leading-none"
                      aria-label="Rimuovi"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
        ))}
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mt-6">
        <form action={withItems(saveAction)} className="sm:flex-1">
          <SubmitButton
            pendingLabel="Salvataggio…"
            className="w-full py-3 rounded-xl border border-border text-sm font-semibold text-ink hover:bg-surface-offset transition-colors"
          >
            Salva settimana tipo
          </SubmitButton>
        </form>
        <form action={withItems(applyAction)} className="sm:flex-1">
          <SubmitButton
            disabled={total === 0}
            pendingLabel="Applico…"
            className="w-full py-3 bg-primary text-primary-fg rounded-xl text-sm font-semibold hover:bg-primary-hover disabled:opacity-60 transition-colors"
          >
            Applica alla settimana
          </SubmitButton>
        </form>
      </div>
    </div>
  );
}
