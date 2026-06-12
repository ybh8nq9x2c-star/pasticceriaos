// =============================================================================
// <BottomSheet> — drawer dal basso per mobile (menu "Altro", filtri, composer).
// =============================================================================

'use client';

import { useEffect } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

export function BottomSheet({
  open,
  onClose,
  title,
  children,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  className?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60]" role="dialog" aria-modal="true" aria-label={title ?? 'Menu'}>
      <div
        className="absolute inset-0 bg-black/40 motion-safe:[animation:bk-overlay-in_160ms_both]"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        className={cn(
          'absolute inset-x-0 bottom-0 bg-surface-2 border-t border-border rounded-t-xl shadow-lg',
          'max-h-[85dvh] overflow-y-auto pb-safe',
          'motion-safe:[animation:bk-sheet-in_220ms_cubic-bezier(0.16,1,0.3,1)_both]',
          className,
        )}
      >
        <div className="sticky top-0 bg-surface-2 z-10 px-5 pt-3 pb-2 border-b border-divider">
          <div className="mx-auto h-1 w-9 rounded-full bg-ink-faint/40 mb-2.5" aria-hidden="true" />
          <div className="flex items-center justify-between">
            <p className="text-md font-semibold text-ink">{title}</p>
            <button
              type="button"
              onClick={onClose}
              aria-label="Chiudi"
              className="-m-1.5 p-1.5 rounded-md text-ink-muted hover:text-ink hover:bg-surface-offset transition-colors"
            >
              <X size={16} aria-hidden="true" />
            </button>
          </div>
        </div>
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  );
}
