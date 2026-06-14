// =============================================================================
// app/auth/callback/route.ts
// Callback OAuth/magic-link: scambia il codice con una sessione, poi reindirizza.
// Robusto: ogni fallimento → pagina /auth/error leggibile, mai un 500.
// (La conferma email dei nuovi account passa invece da /auth/confirm.)
// =============================================================================

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

function safeNext(raw: string | null): string {
  return raw && raw.startsWith('/') && !raw.startsWith('//') ? raw : '/dashboard';
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = safeNext(searchParams.get('next'));
  const errorUrl = (reason: string) => `${origin}/auth/error?reason=${encodeURIComponent(reason)}`;

  if (!code) return NextResponse.redirect(errorUrl('Codice di accesso mancante.'));

  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) return NextResponse.redirect(errorUrl(error.message));
    return NextResponse.redirect(`${origin}${next}`);
  } catch (err) {
    console.error('[auth/callback] exchangeCodeForSession fallito', err);
    return NextResponse.redirect(errorUrl('Accesso non riuscito. Riprova dal login.'));
  }
}
