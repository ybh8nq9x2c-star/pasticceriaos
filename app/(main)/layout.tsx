// =============================================================================
// app/(main)/layout.tsx
// Layout condiviso per tutte le pagine autenticate.
// Legge la sessione server-side e inietta orgName/email nella sidebar.
// =============================================================================

import { redirect } from 'next/navigation';
import { requireSession } from '@/modules/identity/service';
import { getLowStockAlerts } from '@/modules/inventory/service';
import { AppSidebar } from '@/components/layout/AppSidebar';
import { AppTopbar } from '@/components/layout/AppTopbar';

export default async function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // requireSession lancia AuthError → il middleware ha già gestito il redirect,
  // ma lasciamo il fallback esplicito per sicurezza.
  let session;
  try {
    session = await requireSession();
  } catch {
    redirect('/login');
  }

  // Conta alert stock basso (best-effort: se fallisce non blocca il layout)
  let lowStockCount = 0;
  try {
    const alerts = await getLowStockAlerts();
    lowStockCount = alerts.length;
  } catch {
    // silently ignore
  }

  return (
    <div className="flex min-h-screen bg-[#FAF7F2]">
      <AppSidebar
        orgName={session.organizationName}
        userEmail={session.email}
        lowStockCount={lowStockCount}
      />
      <main className="flex-1 flex flex-col min-h-screen overflow-y-auto">
        <AppTopbar lowStockCount={lowStockCount} />
        <div className="flex-1">
          {children}
        </div>
      </main>
    </div>
  );
}
