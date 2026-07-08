// =============================================================================
// <ActivationChecklist> — giorno-1 (P0-E). Il sistema nuovo sembra calmo ma è
// vuoto: questa card dice COSA caricare e COSA si sblocca. Collassabile,
// sparisce da sola al 100%. Niente tour, niente popup.
// =============================================================================

import Link from 'next/link';
import { Check, ChevronDown, Rocket } from 'lucide-react';
import type { ActivationTask } from '@/lib/activation';

export function ActivationChecklist({ tasks, pct }: { tasks: ActivationTask[]; pct: number }) {
  if (pct >= 100) return null;
  const next = tasks.find((t) => !t.done);

  return (
    <details
      className="group rounded-2xl border border-border bg-surface-2 overflow-hidden"
      data-testid="activation-checklist"
      open={pct < 50}
    >
      <summary className="flex items-center gap-3 px-5 py-3.5 cursor-pointer list-none select-none [&::-webkit-details-marker]:hidden min-h-[56px]">
        <span className="w-8 h-8 rounded-full bg-primary-light flex items-center justify-center shrink-0">
          <Rocket className="size-4 text-primary" aria-hidden="true" />
        </span>
        <span className="flex-1 min-w-0">
          <span className="block text-sm font-bold text-ink">Attiva la tua pasticceria — {pct}%</span>
          {next && <span className="block text-xs text-ink-muted truncate">Prossimo passo: {next.title}</span>}
        </span>
        <span className="w-24 h-1.5 rounded-full bg-surface-offset overflow-hidden shrink-0" aria-hidden="true">
          <span className="block h-full bg-primary rounded-full" style={{ width: `${pct}%` }} />
        </span>
        <ChevronDown size={16} aria-hidden="true" className="text-ink-faint transition-transform group-open:rotate-180 shrink-0" />
      </summary>
      <ul className="divide-y divide-divider border-t border-divider">
        {tasks.map((t) => (
          <li key={t.key}>
            <Link
              href={t.href}
              className={`flex items-start gap-3 px-5 py-3 transition-colors ${t.done ? 'opacity-60' : 'hover:bg-surface-offset'}`}
            >
              <span
                aria-hidden="true"
                className={`mt-0.5 w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${
                  t.done ? 'bg-success-light text-success-strong' : 'border border-border text-transparent'
                }`}
              >
                <Check className="size-3" />
              </span>
              <span className="min-w-0">
                <span className={`block text-sm font-medium ${t.done ? 'text-ink-muted line-through' : 'text-ink'}`}>
                  {t.title}
                </span>
                {!t.done && <span className="block text-xs text-ink-muted mt-0.5">{t.unlocks}</span>}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </details>
  );
}
