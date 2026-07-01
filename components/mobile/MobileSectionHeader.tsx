// =============================================================================
// <MobileSectionHeader> — intestazione sezione compatta (stile canonico delle
// h2 di dashboard) con slot destro opzionale (conteggio, link "Tutti →").
// =============================================================================

import { cn } from '@/lib/utils';

export function MobileSectionHeader({
  children,
  right,
  className,
}: {
  children: React.ReactNode;
  right?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex items-center justify-between mb-3', className)}>
      <h2 className="font-semibold text-sm text-ink-muted uppercase tracking-wide">{children}</h2>
      {right}
    </div>
  );
}
