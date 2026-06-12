// =============================================================================
// <Stepper> — progress lifecycle (es. Creato → Inviato → In consegna → Ricevuto).
// =============================================================================

import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

export function Stepper({
  steps,
  currentIndex,
  cancelled = false,
  className,
}: {
  steps: string[];
  /** indice dello step corrente (-1 se nessuno) */
  currentIndex: number;
  /** stato annullato: stepper neutro */
  cancelled?: boolean;
  className?: string;
}) {
  return (
    <ol className={cn('flex items-center', className)} aria-label="Avanzamento">
      {steps.map((step, idx) => {
        const done = !cancelled && idx < currentIndex;
        const current = !cancelled && idx === currentIndex;
        return (
          <li key={step} className="flex items-center flex-1 last:flex-none min-w-0">
            <div className="flex flex-col items-center gap-1.5 min-w-0">
              <span
                className={cn(
                  'flex items-center justify-center w-7 h-7 rounded-full text-xs font-medium tnum border transition-colors duration-150',
                  cancelled && 'bg-surface-offset text-ink-faint border-border',
                  done && 'bg-primary text-primary-fg border-transparent',
                  current && 'bg-primary-light text-primary border-transparent ring-2 ring-[color:var(--color-primary)]/25',
                  !done && !current && !cancelled && 'bg-surface-offset text-ink-muted border-border',
                )}
                aria-current={current ? 'step' : undefined}
              >
                {done ? <Check size={14} aria-hidden="true" /> : idx + 1}
              </span>
              <span
                className={cn(
                  'text-xs truncate max-w-[72px] sm:max-w-none',
                  current ? 'text-ink font-medium' : done ? 'text-primary' : 'text-ink-muted',
                )}
              >
                {step}
              </span>
            </div>
            {idx < steps.length - 1 && (
              <span
                className={cn('flex-1 h-px mx-2 -mt-5', done ? 'bg-primary' : 'bg-border')}
                aria-hidden="true"
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}
