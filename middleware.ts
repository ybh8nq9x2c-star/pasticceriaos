// =============================================================================
// middleware.ts
// Route protection per PasticceriaOS MVP.
//
// Struttura route:
//   /login           → pubblico (solo se non autenticato)
//   /signup          → pubblico (solo se non autenticato)
//   /auth/callback   → pubblico (handler OAuth/magic link)
//   /onboarding      → autenticato, senza organizzazione
//   /dashboard/*     → autenticato + organizzazione
//   tutto il resto   → autenticato + organizzazione
//
// Flusso:
//   1. Refresh sessione Supabase (obbligatorio su ogni request)
//   2. Non autenticato + route protetta → /login
//   3. Autenticato + route auth → /dashboard (se ha org) o /onboarding
//   4. Autenticato + /onboarding + ha già org → /dashboard
//   5. Autenticato + route principale + nessuna org → /onboarding
// =============================================================================

import { NextResponse, type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

// Route che non richiedono autenticazione
const PUBLIC_ROUTES = ['/login', '/signup', '/auth/callback'];
// Route che richiedono autenticazione ma non un'organizzazione
const SEMI_AUTH_ROUTES = ['/onboarding'];

export async function middleware(request: NextRequest) {
  const { supabaseResponse, user, supabase } = await updateSession(request);
  const { pathname } = request.nextUrl;

  // Asset statici: lascia passare
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon') ||
    /\.(?:svg|png|jpg|jpeg|gif|webp|ico)$/.test(pathname)
  ) {
    return supabaseResponse;
  }

  const isPublicRoute   = PUBLIC_ROUTES.some((r) => pathname === r || pathname.startsWith(r + '/'));
  const isSemiAuthRoute = SEMI_AUTH_ROUTES.some((r) => pathname === r || pathname.startsWith(r + '/'));

  // ── Utente non autenticato ─────────────────────────────────────────────────
  if (!user) {
    if (isPublicRoute || isSemiAuthRoute) return supabaseResponse;

    // Qualsiasi altra route → login
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('next', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // ── Utente autenticato ─────────────────────────────────────────────────────

  // Controlla se l'utente ha un'organizzazione
  const { data: member } = await supabase
    .from('org_members')
    .select('organization_id')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle();

  const hasOrg = !!member?.organization_id;

  // Autenticato su route di autenticazione (login/signup) → redirect
  if (isPublicRoute) {
    const dest = hasOrg ? '/dashboard' : '/onboarding';
    return NextResponse.redirect(new URL(dest, request.url));
  }

  // Autenticato + /onboarding + ha già org → /dashboard
  if (isSemiAuthRoute && hasOrg) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  // Autenticato + route principale + nessuna org → /onboarding
  if (!isSemiAuthRoute && !isPublicRoute && !hasOrg) {
    return NextResponse.redirect(new URL('/onboarding', request.url));
  }

  // Root / → redirect appropriato
  if (pathname === '/') {
    const dest = hasOrg ? '/dashboard' : '/onboarding';
    return NextResponse.redirect(new URL(dest, request.url));
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
