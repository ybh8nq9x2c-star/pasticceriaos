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

const PUBLIC_ROUTES = ['/login', '/signup', '/auth/callback', '/auth/confirm', '/auth/error'];
const SEMI_AUTH_ROUTES = ['/onboarding'];
const SUPPLIER_PREFIX = '/supplier';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Portale fornitore via link JWT: NESSUNA auth Supabase. Il token nel path
  // è verificato dal layout/service del portale; il middleware non deve
  // toccare la sessione (early return PRIMA di updateSession: zero overhead).
  if (pathname === '/portal' || pathname.startsWith('/portal/')) {
    return NextResponse.next();
  }

  const { supabaseResponse, user, supabase } = await updateSession(request);

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

  // account_type via SECURITY DEFINER RPC (typed: current_account_type è in
  // database.types). MAI staccare .rpc dall'istanza: il metodo usa `this.rest`
  // e una chiamata unbound crasha a runtime con
  // "Cannot read properties of undefined (reading 'rest')" (500 in prod).
  // Se l'RPC fallisce: accountTypeKnown resta false e il workspace gating viene
  // saltato (fail-open SOLO sul gating) — i layout guard
  // (requireCustomerSession / requireSupplierSession) + RLS restano i layer
  // autoritativi. Auth e onboarding (sotto) restano fail-closed.
  let accountType: 'customer' | 'supplier' | null = null;
  let accountTypeKnown = false;
  if (hasOrg) {
    try {
      const { data, error } = await supabase.rpc('current_account_type');
      if (!error) {
        accountType = (data as 'customer' | 'supplier' | null) ?? null;
        accountTypeKnown = true;
      } else {
        console.error('[middleware] current_account_type failed', error.code, error.message);
      }
    } catch (error) {
      console.error('[middleware] current_account_type failed', error);
    }
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
  // Redirect role-based SOLO se il tipo è stato risolto con certezza: con
  // accountTypeKnown=false si passa oltre e decidono i layout guard (nessun
  // 500, nessun redirect loop, nessun leak — il fetch dati è dopo i guard).
  if (accountTypeKnown && accountType === 'supplier' && !isSupplierRoute) {
    return NextResponse.redirect(new URL(SUPPLIER_PREFIX, request.url));
  }
  if (accountTypeKnown && accountType !== 'supplier' && isSupplierRoute) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  if (pathname === '/') {
    return NextResponse.redirect(new URL(home, request.url));
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    // Esclusi: asset statici, manifest e il portale fornitore token-based.
    '/((?!_next/static|_next/image|favicon.ico|manifest.json|portal/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
