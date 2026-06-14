// =============================================================================
// app/auth/callback/route.ts
// Callback OAuth/magic-link: scambia il codice con una sessione, poi reindirizza.
// Robusto: ogni fallimento → pagina /auth/error leggibile, mai un 500.
// (La conferma email dei nuovi account passa invece da /auth/confirm.)
// Redirect sull'origin PUBBLICO (dietro proxy Railway request.url è localhost).
// =============================================================================

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { publicOrigin } from '@/lib/public-origin';

function safeNext(raw: string | null): string {
  return raw && raw.startsWith('/') && !raw.startsWith('//') ? raw : '/dashboard';
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const origin = publicOrigin(request);
  const code = searchParams.get('code');
  const next = safeNext(searchParams.get('next'));
  const errorUrl = (reason: string) => `${origin}/auth/error?reason=${encodeURIComponent(reason)}`;

  if (!code) return NextResponse.redirect(errorUrl('Codice di accesso mancante.'));

  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      console.error('[auth/callback] exchangeCodeForSession', error.message);
      return NextResponse.redirect(errorUrl('Accesso non riuscito: riprova dal login.'));
    }
    return NextResponse.redirect(`${origin}${next}`);
  } catch (err) {
    console.error('[auth/callback] exchangeCodeForSession (throw)', err);
    return NextResponse.redirect(errorUrl('Accesso non riuscito: riprova dal login.'));
  }
}
