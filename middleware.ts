// =============================================================================
// middleware.ts
// Route protection + dual-workspace gating.
//
//   /login /signup /auth/callback       -> public
//   /onboarding                         -> authed, org optional (account-type chosen here)
//   /supplier/*                         -> authed + org + account_type = 'supplier'
//   everything else (the (main) app)    -> authed + org + account_type = 'customer'
//
// This is the FAST first-line gate. Server-component guards
// (requireCustomerSession / requireSupplierSession) are authoritative, and RLS
// is the DB boundary. A wrong-workspace user is redirected here before the page
// renders, so no data is leaked.
// =============================================================================

import { NextResponse, type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

const PUBLIC_ROUTES = ['/login', '/signup', '/auth/callback'];
const SEMI_AUTH_ROUTES = ['/onboarding'];
const SUPPLIER_PREFIX = '/supplier';

export async function middleware(request: NextRequest) {
  const { supabaseResponse, user, supabase } = await updateSession(request);
  const { pathname } = request.nextUrl;

  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon') ||
    /\.(?:svg|png|jpg|jpeg|gif|webp|ico)$/.test(pathname)
  ) {
    return supabaseResponse;
  }

  const isPublicRoute   = PUBLIC_ROUTES.some((r) => pathname === r || pathname.startsWith(r + '/'));
  const isSemiAuthRoute = SEMI_AUTH_ROUTES.some((r) => pathname === r || pathname.startsWith(r + '/'));
  const isUnauthorized  = pathname === '/unauthorized';
  const isSupplierRoute = pathname === SUPPLIER_PREFIX || pathname.startsWith(SUPPLIER_PREFIX + '/');

  // ── Unauthenticated ─────────────────────────────────────────────────────────
  if (!user) {
    if (isPublicRoute || isSemiAuthRoute) return supabaseResponse;
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('next', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // ── Authenticated: organization + account type ──────────────────────────────
  const { data: member } = await supabase
    .from('org_members')
    .select('organization_id')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle();
  const hasOrg = !!member?.organization_id;

  // account_type via SECURITY DEFINER RPC. Cast localized until database.types
  // is regenerated post-migration (then this becomes fully typed).
  let accountType: 'customer' | 'supplier' | null = null;
  if (hasOrg) {
    const rpc = supabase.rpc as unknown as (fn: string) => Promise<{ data: 'customer' | 'supplier' | null }>;
    const { data } = await rpc('current_account_type');
    accountType = data ?? null;
  }
  const home = accountType === 'supplier' ? SUPPLIER_PREFIX : '/dashboard';

  // Authed on a public (login/signup) page → push to the right place.
  if (isPublicRoute) {
    return NextResponse.redirect(new URL(hasOrg ? home : '/onboarding', request.url));
  }

  // No org yet → onboarding only.
  if (!hasOrg) {
    if (isSemiAuthRoute || isUnauthorized) return supabaseResponse;
    return NextResponse.redirect(new URL('/onboarding', request.url));
  }

  // Has org, sitting on onboarding → go home.
  if (isSemiAuthRoute) {
    return NextResponse.redirect(new URL(home, request.url));
  }

  if (isUnauthorized) return supabaseResponse;

  // ── Workspace gating ────────────────────────────────────────────────────────
  if (accountType === 'supplier' && !isSupplierRoute) {
    return NextResponse.redirect(new URL(SUPPLIER_PREFIX, request.url));
  }
  if (accountType !== 'supplier' && isSupplierRoute) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  if (pathname === '/') {
    return NextResponse.redirect(new URL(home, request.url));
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
