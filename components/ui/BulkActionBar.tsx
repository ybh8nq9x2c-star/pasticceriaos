'use client';

// =============================================================================
// <BulkActionBar> — barra azioni massive (grammatica bulk unica).
// Sticky in basso su mobile (sopra la tab bar + safe area), statica su desktop.
// Compare solo con selezione > 0. Presentational: mostra "N selezionati" +
// "Deseleziona" + lo slot azioni (children); la logica sta nel chiamante.
// Coerente col linguaggio visivo di StickyActionBar / CompleteReceiptBar.
// =============================================================================

import { cn } from '@/lib/utils';

export function BulkActionBar({
  count,
  onClear,
  children,
  noun = 'selezionat',
  className,
}: {
  count: number;
  onClear: () => void;
  children: React.ReactNode;
  /** Radice del sostantivo: "selezionat" → "1 selezionato" / "3 selezionati". */
  noun?: string;
  className?: string;
}) {
  if (count === 0) return null;
  return (
    <div
      className={cn(
        // Ancorata SOPRA la bottom tab bar (56px) + notch; statica da lg.
        'fixed inset-x-0 bottom-[calc(56px+env(safe-area-inset-bottom))] z-30 border-t border-divider bg-glass backdrop-blur px-4 py-3',
        'lg:static lg:bottom-auto lg:mt-4 lg:rounded-2xl lg:border lg:border-border lg:bg-surface-2 lg:backdrop-blur-0',
        className,
      )}
    >
      <div className="mx-auto flex max-w-5xl flex-col gap-2 sm:flex-row sm:items-center">
        <div className="flex items-center justify-between gap-3 sm:justify-start">
          <span className="text-sm font-semibold text-ink whitespace-nowrap">
            {count} {noun}{count === 1 ? 'o' : 'i'}
          </span>
          <button
            type="button"
            onClick={onClear}
            className="text-xs font-semibold text-ink-muted hover:text-ink underline sm:hidden"
          >
            Deseleziona
          </button>
        </div>
        <div className="flex flex-1 items-center gap-2">{children}</div>
        <button
          type="button"
          onClick={onClear}
          className="hidden sm:inline text-xs font-semibold text-ink-muted hover:text-ink underline shrink-0"
        >
          Deseleziona
        </button>
      </div>
    </div>
  );
}
