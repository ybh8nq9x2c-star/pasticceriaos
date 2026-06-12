// =============================================================================
// app/(main)/layout.tsx
// Layout condiviso per tutte le pagine autenticate.
// Legge la sessione server-side e inietta orgName/email nella sidebar.
// =============================================================================

import { requireCustomerSession } from '@/modules/identity/workspace';
import { getLowStockAlerts } from '@/modules/inventory/service';
import { AppSidebar } from '@/components/layout/AppSidebar';
import { AppTopbar } from '@/components/layout/AppTopbar';
import { MobileChrome } from '@/components/layout/MobileChrome';

export default async function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Authoritative customer-workspace guard: redirects suppliers to /supplier and
  // unauthenticated users to /login BEFORE any customer data is rendered.
  const session = await requireCustomerSession();

  // Conta alert stock basso (best-effort: se fallisce non blocca il layout)
  let lowStockCount = 0;
  try {
    const alerts = await getLowStockAlerts();
    lowStockCount = alerts.length;
  } catch {
    // silently ignore
  }

  return (
    <div className="flex min-h-screen bg-bg">
      <AppSidebar
        orgName={session.organizationName}
        userEmail={session.email}
        lowStockCount={lowStockCount}
      />
      <main className="flex-1 flex flex-col min-h-screen overflow-y-auto min-w-0">
        <AppTopbar lowStockCount={lowStockCount} />
        <MobileChrome
          variant="customer"
          orgName={session.organizationName}
          userEmail={session.email}
          lowStockCount={lowStockCount}
        />
        <div className="flex-1 pb-24 lg:pb-0">
          {children}
        </div>
      </main>
    </div>
  );
}
