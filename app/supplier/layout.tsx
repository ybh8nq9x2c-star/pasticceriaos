// =============================================================================
// app/supplier/layout.tsx
// SUPPLIER workspace shell. requireSupplierSession() redirects customers to
// their own workspace and unauthenticated users to /login before any render.
// Stessa shell chiara del workspace pasticceria, nav da SUPPLIER_NAV.
// =============================================================================

import { requireSupplierSession } from '@/modules/identity/workspace';
import { AppSidebar } from '@/components/layout/AppSidebar';
import { AppTopbar } from '@/components/layout/AppTopbar';
import { MobileChrome } from '@/components/layout/MobileChrome';

export default async function SupplierLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSupplierSession();

  return (
    <div className="flex min-h-screen bg-bg">
      <AppSidebar
        variant="supplier"
        orgName={session.organizationName}
        userEmail={session.email}
      />
      <main className="flex-1 flex flex-col min-h-screen overflow-y-auto min-w-0">
        <AppTopbar variant="supplier" />
        <MobileChrome
          variant="supplier"
          orgName={session.organizationName}
          userEmail={session.email}
        />
        <div className="flex-1 pb-24 lg:pb-0">{children}</div>
      </main>
    </div>
  );
}
