// =============================================================================
// modules/identity/workspace.ts
// Account-type / workspace authorization. These guards run server-side at the
// top of each workspace's layout, so a wrong-workspace user is redirected
// BEFORE any page data is fetched or rendered (no data leak).
//
// Layered defense:  middleware (fast gate) -> these guards (authoritative)
//                   -> RLS (DB boundary).
// =============================================================================

import { redirect } from 'next/navigation';
import { createMarketplaceClient } from '@/modules/marketplace/db';
import { requireSession } from './service';
import type { AccountType } from '@/modules/marketplace/types';

/** Home route for each workspace. */
export function workspaceHome(accountType: AccountType): string {
  return accountType === 'supplier' ? '/supplier' : '/dashboard';
}

/** account_type of the current user's org (null if unauthenticated / no org). */
export async function getAccountType(): Promise<AccountType | null> {
  const supabase = await createMarketplaceClient();
  const { data, error } = await supabase.rpc('current_account_type');
  if (error) return null;
  return (data as AccountType | null) ?? null;
}

export interface WorkspaceSession {
  userId: string;
  email: string;
  orgId: string;
  organizationName: string;
  accountType: AccountType;
}

async function requireWorkspace(expected: AccountType): Promise<WorkspaceSession> {
  // requireSession() throws AuthError if unauthenticated or without an org.
  // We translate that into a /login redirect here so callers never need a
  // try/catch (which would otherwise swallow the NEXT_REDIRECT below).
  const session = await requireSession().catch((): never => redirect('/login'));
  const accountType = await getAccountType();

  if (accountType !== expected) {
    // Redirect to the user's OWN workspace (or unauthorized if undetermined).
    if (accountType) redirect(workspaceHome(accountType));
    redirect(`/unauthorized?from=${expected}`);
  }

  return {
    userId: session.userId,
    email: session.email,
    orgId: session.organizationId,
    organizationName: session.organizationName,
    accountType: expected,
  };
}

/** Allow only CUSTOMER-org users. Redirects others away before render. */
export function requireCustomerSession(): Promise<WorkspaceSession> {
  return requireWorkspace('customer');
}

/** Allow only SUPPLIER-org users. Redirects others away before render. */
export function requireSupplierSession(): Promise<WorkspaceSession> {
  return requireWorkspace('supplier');
}
