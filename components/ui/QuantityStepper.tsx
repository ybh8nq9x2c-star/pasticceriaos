'use client';

// =============================================================================
// <QuantityStepper> — contatore touch-first (− / valore / +) per quantità intere
// (infornate, pezzi). Target 44×44 sui bottoni; il valore resta digitabile
// (tastiera numerica). Il valore viaggia come STRINGA per integrarsi 1:1 con gli
// state dei form esistenti (batchCount ecc.) senza conversioni nel chiamante.
// =============================================================================

import { Minus, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';

export function QuantityStepper({
  value,
  onChange,
  min = 1,
  label,
  className,
}: {
  value: string;
  onChange: (next: string) => void;
  min?: number;
  /** Contesto per gli aria-label (es. "batch Cornetti"). */
  label?: string;
  className?: string;
}) {
  const n = parseInt(value, 10);
  const current = Number.isFinite(n) ? n : min;

  function step(delta: number) {
    onChange(String(Math.max(min, current + delta)));
  }

  const btn =
    'flex items-center justify-center w-11 h-11 shrink-0 text-ink-muted ' +
    'hover:text-ink hover:bg-surface-offset transition-colors ' +
    'disabled:opacity-40 disabled:pointer-events-none';

  return (
    <div
      className={cn(
        'inline-flex items-stretch rounded-xl border border-border bg-surface-2 overflow-hidden',
        className,
      )}
    >
      <button
        type="button"
        onClick={() => step(-1)}
        disabled={current <= min}
        aria-label={`Diminuisci${label ? ` ${label}` : ''}`}
        className={btn}
      >
        <Minus size={16} aria-hidden="true" />
      </button>
      <input
        type="number"
        min={min}
        inputMode="numeric"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label ?? 'Quantità'}
        className="w-12 text-center font-mono text-base bg-transparent border-x border-border focus:outline-none focus:ring-1 focus:ring-primary-ring [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
      />
      <button
        type="button"
        onClick={() => step(1)}
        aria-label={`Aumenta${label ? ` ${label}` : ''}`}
        className={btn}
      >
        <Plus size={16} aria-hidden="true" />
      </button>
    </div>
  );
}
