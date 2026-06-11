// =============================================================================
// app/portal/[token]/layout.tsx
// Shell del portale fornitore: nessuna auth Supabase, il token È l'accesso.
// Mobile-first: il fornitore lo usa quasi sempre dal telefono.
// =============================================================================

import { redirect } from 'next/navigation';
import { getPortalContext } from '@/modules/portal/service';

export const dynamic = 'force-dynamic';

export default async function PortalLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { token: string };
}) {
  let ctx;
  try {
    ctx = await getPortalContext(params.token);
  } catch {
    redirect('/portal/expired');
  }

  return (
    <div className="min-h-screen bg-[#FAF7F2]">
      <header className="sticky top-0 z-40 bg-[#0F1923] text-white px-4 py-3 safe-area-pt">
        <div className="max-w-2xl mx-auto flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-bold leading-tight truncate">
              <span className="text-[#14B8A6]">Pasticceria</span>OS
            </p>
            <p className="text-[11px] text-white/60 truncate">{ctx.organizationName}</p>
          </div>
          <span className="shrink-0 text-[10px] font-semibold bg-[#14B8A6] text-[#0F1923] px-2 py-1 rounded uppercase tracking-wider">
            Portale fornitore
          </span>
        </div>
      </header>
      <main className="max-w-2xl mx-auto px-4 py-5 pb-16">
        {children}
      </main>
    </div>
  );
}
