// =============================================================================
// app/portal/expired/page.tsx
// Link portale scaduto, revocato o manomesso.
// =============================================================================

export const metadata = { title: 'Link non valido' };

export default function PortalExpiredPage() {
  return (
    <div className="min-h-screen bg-[#FAF7F2] flex items-center justify-center p-6">
      <div className="max-w-sm w-full bg-white rounded-2xl border border-[#E5DDD0] p-8 text-center">
        <p className="text-4xl mb-3">🔒</p>
        <h1 className="font-playfair text-xl font-bold text-[#1A2B4A]">
          Link scaduto o non valido
        </h1>
        <p className="text-sm text-[#6B7280] mt-2">
          Questo link al portale fornitore non è più attivo. Contatta la
          pasticceria per ricevere un nuovo link di accesso.
        </p>
      </div>
    </div>
  );
}
