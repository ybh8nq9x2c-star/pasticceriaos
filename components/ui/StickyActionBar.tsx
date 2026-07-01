// =============================================================================
// <StickyActionBar> — barra azione primaria SEMPRE visibile su mobile, ancorata
// SOPRA la bottom tab bar (56px + safe-area), statica su desktop (lg).
// Stesso linguaggio visivo del pattern receipts/import (glass + blur + divider).
// Presentational puro: funziona in Server e Client Component.
// =============================================================================

import { cn } from '@/lib/utils';

export function StickyActionBar({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        // bottom = altezza tab bar mobile + notch; su lg torna nel flusso normale.
        'sticky bottom-[calc(56px+env(safe-area-inset-bottom))] lg:static lg:bottom-auto z-30',
        '-mx-4 px-4 py-3 sm:mx-0 sm:px-0',
        'bg-glass backdrop-blur lg:bg-transparent lg:backdrop-blur-0',
        'border-t border-divider lg:border-0',
        className,
      )}
    >
      {children}
    </div>
  );
}
