// =============================================================================
// <CloseDayCard> — il rito serale in UN posto (P0-A).
// Riceve i passi già calcolati da buildCloseDaySteps (puro, testato): ogni
// passo = titolo da mestiere + conseguenza pratica + un tap. Se non c'è nulla
// da chiudere, il chiamante non la monta proprio.
// =============================================================================

import Link from 'next/link';
import { Moon } from 'lucide-react';
import type { CloseDayStep } from '@/lib/close-day';

export function CloseDayCard({ steps }: { steps: CloseDayStep[] }) {
  if (steps.length === 0) return null;

  return (
    <section
      aria-label="Chiudi la giornata"
      data-testid="close-day-card"
      className="rounded-2xl border border-primary-soft bg-primary-light/40 overflow-hidden"
    >
      <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-primary-soft/60">
        <span className="w-8 h-8 rounded-full bg-primary-light flex items-center justify-center shrink-0">
          <Moon className="size-4 text-primary" aria-hidden="true" />
        </span>
        <div>
          <h2 className="text-sm font-bold text-ink">Chiudi la giornata</h2>
          <p className="text-xs text-ink-muted">
            {steps.length === 1 ? 'Manca una cosa' : `Mancano ${steps.length} cose`} perché i numeri di
            domani dicano la verità.
          </p>
        </div>
      </div>
      <ol className="divide-y divide-primary-soft/40">
        {steps.map((s, i) => (
          <li key={s.key}>
            <Link
              href={s.href}
              className="flex items-center gap-3 px-5 py-3 hover:bg-primary-light/60 transition-colors group"
            >
              <span
                aria-hidden="true"
                className="w-6 h-6 rounded-full bg-surface-2 border border-primary-soft flex items-center justify-center text-xs font-bold text-primary shrink-0"
              >
                {i + 1}
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-semibold text-ink">{s.title}</span>
                <span className="block text-xs text-ink-muted mt-0.5">{s.consequence}</span>
              </span>
              <span className="shrink-0 text-xs font-semibold text-primary group-hover:underline">
                {s.cta} →
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}
