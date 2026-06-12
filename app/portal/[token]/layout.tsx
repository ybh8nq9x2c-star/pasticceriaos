// =============================================================================
// app/portal/[token]/layout.tsx
// Shell del portale fornitore: nessuna auth Supabase, il token È l'accesso.
// Mobile-first: il fornitore lo usa quasi sempre dal telefono.
// =============================================================================

import { redirect } from 'next/navigation';
import { getPortalContext } from '@/modules/portal/service';
import { Logo } from '@/components/shared/Logo';
import { Badge } from '@/components/ui/Badge';

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
    <div className="min-h-screen bg-bg flex flex-col">
      <header className="sticky top-0 z-40 bg-surface border-b border-border px-4 py-3 safe-area-pt">
        <div className="max-w-2xl mx-auto flex items-center justify-between gap-3">
          <div className="min-w-0">
            <Logo size={20} />
            <p className="text-xs text-ink-muted truncate mt-0.5">
              Ordini da {ctx.organizationName}
            </p>
          </div>
          <Badge variant="primary">Portale fornitore</Badge>
        </div>
      </header>
      <main className="w-full max-w-2xl mx-auto px-4 py-5 pb-16 flex-1">
        {children}
      </main>
      <footer className="py-4 text-center text-xs text-ink-faint">
        Powered by BakeryOs
      </footer>
    </div>
  );
}
