'use client';

// =============================================================================
// app/supplier/error.tsx
// Error boundary del workspace fornitore.
// =============================================================================

export default function SupplierError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-2xl mx-auto">
      <div className="bg-surface-2 rounded-2xl border border-border p-10 text-center">
        <p className="text-4xl mb-3">⚠️</p>
        <h1 className="text-xl font-bold text-ink">
          Impossibile caricare i dati
        </h1>
        <p className="text-sm text-ink-muted mt-2">
          {error.message || 'Si è verificato un errore durante il caricamento.'}
        </p>
        {error.digest && (
          <p className="text-xs text-ink-muted font-mono mt-1">ref: {error.digest}</p>
        )}
        <button
          onClick={reset}
          className="mt-6 px-6 py-2.5 bg-primary text-primary-fg rounded-xl text-sm font-semibold hover:bg-primary-hover transition-colors"
        >
          Riprova
        </button>
      </div>
    </div>
  );
}
