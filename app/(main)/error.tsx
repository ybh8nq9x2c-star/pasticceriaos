'use client';

// =============================================================================
// app/(main)/error.tsx
// Error boundary del workspace pasticceria: niente schermate rotte, niente
// numeri finti — un errore reale viene mostrato come tale, con retry.
// =============================================================================

export default function MainError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="p-8 max-w-2xl mx-auto">
      <div className="bg-white rounded-2xl border border-[#E5DDD0] p-10 text-center">
        <p className="text-4xl mb-3">⚠️</p>
        <h1 className="font-playfair text-xl font-bold text-[#1A2B4A]">
          Impossibile caricare i dati
        </h1>
        <p className="text-sm text-[#6B7280] mt-2">
          {error.message || 'Si è verificato un errore durante il caricamento.'}
        </p>
        {error.digest && (
          <p className="text-xs text-[#6B7280] font-mono mt-1">ref: {error.digest}</p>
        )}
        <button
          onClick={reset}
          className="mt-6 px-6 py-2.5 bg-[#1A2B4A] text-white rounded-xl text-sm font-semibold hover:bg-[#243660] transition-colors"
        >
          Riprova
        </button>
      </div>
    </div>
  );
}
