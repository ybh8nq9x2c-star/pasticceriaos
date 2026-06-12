// =============================================================================
// app/portal/expired/page.tsx
// Link portale scaduto, revocato o manomesso.
// =============================================================================

export const metadata = { title: 'Link non valido' };

export default function PortalExpiredPage() {
  return (
    <div className="min-h-screen bg-bg flex items-center justify-center p-6">
      <div className="max-w-sm w-full bg-surface-2 rounded-2xl border border-border p-8 text-center">
        <p className="text-4xl mb-3">🔒</p>
        <h1 className="text-xl font-bold text-ink">
          Link scaduto o non valido
        </h1>
        <p className="text-sm text-ink-muted mt-2">
          Questo link al portale fornitore non è più attivo. Contatta la
          pasticceria per ricevere un nuovo link di accesso.
        </p>
      </div>
    </div>
  );
}
