// =============================================================================
// <Modal> — dialog centrato (≥640px) / full bottom sheet (mobile).
// Esc per chiudere, click sull'overlay, scroll-lock, ruolo dialog.
// =============================================================================

'use client';

import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  size = 'md',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg';
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    // Focus iniziale nel pannello
    panelRef.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  const widths = { sm: 'sm:max-w-sm', md: 'sm:max-w-md', lg: 'sm:max-w-2xl' } as const;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className="absolute inset-0 bg-black/40 motion-safe:[animation:bk-overlay-in_160ms_both]"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        tabIndex={-1}
        className={cn(
          'relative w-full bg-surface-2 border border-border shadow-lg outline-none',
          // mobile: bottom sheet full-width
          'rounded-t-xl max-h-[88dvh] motion-safe:[animation:bk-sheet-in_200ms_cubic-bezier(0.16,1,0.3,1)_both]',
          // desktop: dialog centrato
          'sm:rounded-lg sm:max-h-[80vh] sm:motion-safe:[animation:bk-modal-in_160ms_cubic-bezier(0.16,1,0.3,1)_both]',
          widths[size],
          'flex flex-col',
        )}
      >
        <div className="flex items-center justify-between gap-4 px-5 py-4 border-b border-divider shrink-0">
          <h2 className="text-md font-semibold text-ink">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Chiudi finestra"
            className="-m-1.5 p-1.5 rounded-md text-ink-muted hover:text-ink hover:bg-surface-offset transition-colors"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>
        <div className="px-5 py-4 overflow-y-auto">{children}</div>
        {footer && (
          <div className="px-5 py-4 border-t border-divider shrink-0 flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pb-safe sm:pb-4">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
