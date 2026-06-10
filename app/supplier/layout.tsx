// =============================================================================
// app/supplier/layout.tsx
// SUPPLIER workspace shell. requireSupplierSession() redirects customers to
// their own workspace and unauthenticated users to /login before any render.
// =============================================================================

import Link from 'next/link';
import { requireSupplierSession } from '@/modules/identity/workspace';
import { signOutAction } from '@/modules/identity/actions';
import { MobileChrome } from '@/components/layout/MobileChrome';

const NAV = [
  { href: '/supplier',           label: 'Ordini in arrivo', emoji: '📥' },
  { href: '/supplier/customers', label: 'Clienti collegati', emoji: '🤝' },
  { href: '/supplier/catalog',   label: 'Catalogo',          emoji: '📦' },
  { href: '/supplier/keys',      label: 'Chiavi di accesso', emoji: '🔑' },
];

export default async function SupplierLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSupplierSession();

  return (
    <div className="flex min-h-screen bg-[#0F1923] text-white">
      <aside className="hidden lg:flex w-64 shrink-0 bg-[#0B131C] flex-col min-h-screen">
        <div className="px-6 pt-6 pb-5 border-b border-white/10">
          <div className="text-xl font-bold">
            <span className="text-[#14B8A6]">Pasticceria</span>OS
            <span className="ml-1.5 text-[10px] font-semibold bg-teal-600 px-1.5 py-0.5 rounded uppercase tracking-wider">Fornitore</span>
          </div>
          <div className="text-xs text-white/50 mt-1 truncate">{session.organizationName}</div>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-white/70 hover:bg-white/10 hover:text-white transition-colors">
              <span>{n.emoji}</span>{n.label}
            </Link>
          ))}
        </nav>
        <div className="px-3 pb-4 border-t border-white/10 pt-3 flex items-center gap-2">
          <span className="flex-1 truncate text-xs text-white/60 px-2">{session.email}</span>
          <form action={signOutAction}>
            <button type="submit" title="Esci" className="text-white/40 hover:text-white text-xs">↩</button>
          </form>
        </div>
      </aside>
      <main className="flex-1 min-h-screen overflow-y-auto bg-[#FAF7F2] text-[#1A2B4A] min-w-0">
        <MobileChrome variant="supplier" orgName={session.organizationName} userEmail={session.email} />
        <div className="pb-24 lg:pb-0">{children}</div>
      </main>
    </div>
  );
}
