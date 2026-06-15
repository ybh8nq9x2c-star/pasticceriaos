'use client';

// =============================================================================
// <QuickProduceForm> — scarico produzione rapido. "Ho prodotto N infornate di
// questa ricetta" → scala il magazzino secondo la ricetta. Anteprima SOLA LETTURA
// (si scala esattamente la ricetta, con consumo lotti FEFO): nessun secondo
// sistema di scarico, riusa il path canonico piano→completamento. Mobile-first.
// =============================================================================

import { useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ChefHat, ArrowDownToLine } from 'lucide-react';
import { quickProduceAction } from '@/modules/production/actions';
import { IDLE_STATE, UNIT_SHORT } from '@/lib/utils';
import type { UnitOfMeasure } from '@/lib/database.types';

interface RecipeOpt {
  id: string;
  name: string;
  basePortions: number;
}
export interface SelectedRecipe {
  id: string;
  name: string;
  basePortions: number;
  ingredients: { name: string; quantity: number; unit: UnitOfMeasure }[];
}

function fmtQty(n: number): string {
  return (Number.isInteger(n) ? String(n) : String(Math.round(n * 1000) / 1000)).replace('.', ',');
}

function SubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={disabled || pending}
      className="w-full py-3 bg-primary text-primary-fg rounded-xl text-sm font-semibold hover:bg-primary-hover disabled:opacity-60 inline-flex items-center justify-center gap-2 transition-colors"
    >
      <ArrowDownToLine size={16} aria-hidden="true" />
      {pending ? 'Registrazione…' : 'Conferma scarico e aggiorna magazzino'}
    </button>
  );
}

export function QuickProduceForm({ recipes, selected }: { recipes: RecipeOpt[]; selected: SelectedRecipe | null }) {
  const router = useRouter();
  const [state, formAction] = useFormState(quickProduceAction, IDLE_STATE);
  const [batches, setBatches] = useState('1');
  const n = Math.max(1, Math.floor(Number(batches)) || 1);

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-2xl mx-auto space-y-5">
      <div>
        <Link href="/recipes" className="text-sm text-ink-muted hover:text-ink transition-colors">
          ← Ricette
        </Link>
        <h1 className="text-2xl sm:text-3xl font-bold text-ink mt-2 flex items-center gap-2">
          <ChefHat size={24} aria-hidden="true" /> Scarico produzione
        </h1>
        <p className="text-sm text-ink-muted mt-1">
          Segna cosa hai prodotto: il magazzino scala gli ingredienti secondo la ricetta.
        </p>
      </div>

      <div className="bg-surface-2 rounded-2xl border border-border p-5 space-y-4">
        <div>
          <label className="block text-sm font-medium text-ink mb-1.5">Ricetta prodotta</label>
          <select
            value={selected?.id ?? ''}
            onChange={(e) => {
              if (e.target.value) router.push(`/production/quick?recipe=${e.target.value}`);
            }}
            className="w-full rounded-xl border border-border px-3 py-2.5 text-sm bg-surface-2 focus:outline-none focus:ring-2 focus:ring-primary-ring"
          >
            <option value="">— Scegli una ricetta —</option>
            {recipes.map((r) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
        </div>

        {selected ? (
          <form action={formAction} className="space-y-4">
            <input type="hidden" name="recipeId" value={selected.id} />

            <div>
              <label className="block text-sm font-medium text-ink mb-1.5">Quantità prodotta (infornate)</label>
              <input
                name="batchCount"
                type="number"
                min={1}
                step={1}
                inputMode="numeric"
                value={batches}
                onChange={(e) => setBatches(e.target.value)}
                className="w-32 rounded-xl border border-border px-3 py-2.5 text-sm text-center font-mono bg-surface-2 focus:outline-none focus:ring-2 focus:ring-primary-ring"
              />
              <p className="mt-1 text-xs text-ink-muted">
                1 infornata = {selected.basePortions} porzioni · totale ≈ <strong>{n * selected.basePortions}</strong> porzioni
              </p>
            </div>

            {/* Anteprima sola lettura di ciò che verrà scalato */}
            <div className="rounded-xl border border-divider overflow-hidden">
              <div className="px-3 py-2 bg-bg border-b border-divider text-xs font-semibold uppercase tracking-wide text-ink-muted">
                Verrà scalato dal magazzino
              </div>
              {selected.ingredients.length === 0 ? (
                <p className="px-3 py-3 text-sm text-ink-muted">Questa ricetta non ha ingredienti: nulla da scalare.</p>
              ) : (
                <ul className="divide-y divide-divider">
                  {selected.ingredients.map((i, idx) => (
                    <li key={idx} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                      <span className="text-ink truncate">{i.name}</span>
                      <span className="font-mono text-ink shrink-0">{fmtQty(i.quantity * n)} {UNIT_SHORT[i.unit]}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {state.status === 'error' && (
              <p role="alert" className="rounded-md bg-danger-light px-3 py-2 text-sm text-danger">{state.error}</p>
            )}
            {state.status === 'success' && (
              <p role="status" className="rounded-md bg-success-light px-3 py-2 text-sm text-success-strong">
                {state.message}{' '}
                <Link href="/inventory" className="font-semibold underline">Vai al magazzino →</Link>
              </p>
            )}

            <SubmitButton disabled={selected.ingredients.length === 0} />
            <p className="text-xs text-ink-muted text-center">
              L&apos;anteprima è sola lettura: si scala esattamente la ricetta (consumo lotti FEFO).
            </p>
          </form>
        ) : (
          <p className="text-sm text-ink-muted">Scegli una ricetta per vedere cosa verrà scalato e confermare.</p>
        )}
      </div>
    </div>
  );
}
