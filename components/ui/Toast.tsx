// =============================================================================
// <ToastProvider> + useToast — feedback azioni non critiche.
// Top-right su desktop, top-center su mobile. Auto-dismiss 4s con progress
// bar e chiusura manuale sempre disponibile. Gli errori critici vanno inline.
// =============================================================================

'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';
import { CheckCircle2, AlertCircle, AlertTriangle, Info, X } from 'lucide-react';
import { cn } from '@/lib/utils';

type ToastVariant = 'success' | 'error' | 'warning' | 'info';

interface ToastItem {
  id: number;
  variant: ToastVariant;
  message: string;
}

interface ToastContextValue {
  toast: (message: string, variant?: ToastVariant) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const ICONS: Record<ToastVariant, typeof Info> = {
  success: CheckCircle2,
  error: AlertCircle,
  warning: AlertTriangle,
  info: Info,
};

const ACCENT: Record<ToastVariant, string> = {
  success: 'text-success',
  error: 'text-danger',
  warning: 'text-warning',
  info: 'text-info',
};

const BAR: Record<ToastVariant, string> = {
  success: 'bg-success',
  error: 'bg-danger',
  warning: 'bg-warning',
  info: 'bg-info',
};

const AUTO_DISMISS_MS = 4000;
let nextId = 1;

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast richiede <ToastProvider> nell\'albero.');
  return ctx;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: number) => {
    setItems((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    (message: string, variant: ToastVariant = 'info') => {
      const id = nextId++;
      setItems((prev) => [...prev.slice(-3), { id, variant, message }]);
      window.setTimeout(() => dismiss(id), AUTO_DISMISS_MS);
    },
    [dismiss],
  );

  const value = useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {/* Viewport: top-center mobile, top-right desktop */}
      <div
        aria-live="polite"
        className="fixed z-[70] top-3 inset-x-3 flex flex-col items-center gap-2 pointer-events-none sm:items-end sm:inset-x-auto sm:right-4 sm:top-4"
      >
        {items.map((t) => {
          const Icon = ICONS[t.variant];
          return (
            <div
              key={t.id}
              role="status"
              className={cn(
                'pointer-events-auto w-full max-w-sm overflow-hidden rounded-lg border border-border bg-surface-2 shadow-lg',
                'motion-safe:[animation:bk-toast-in-top_200ms_cubic-bezier(0.16,1,0.3,1)_both]',
                'sm:motion-safe:[animation:bk-toast-in-right_200ms_cubic-bezier(0.16,1,0.3,1)_both]',
              )}
            >
              <div className="flex items-start gap-2.5 px-3.5 py-3">
                <Icon size={16} className={cn('mt-0.5 shrink-0', ACCENT[t.variant])} aria-hidden="true" />
                <p className="flex-1 text-sm text-ink">{t.message}</p>
                <button
                  type="button"
                  onClick={() => dismiss(t.id)}
                  aria-label="Chiudi notifica"
                  className="shrink-0 -m-1 p-1 rounded-sm text-ink-faint hover:text-ink transition-colors"
                >
                  <X size={14} aria-hidden="true" />
                </button>
              </div>
              <div
                className={cn('h-0.5', BAR[t.variant])}
                style={{ animation: `bk-toast-progress ${AUTO_DISMISS_MS}ms linear forwards` }}
              />
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}
