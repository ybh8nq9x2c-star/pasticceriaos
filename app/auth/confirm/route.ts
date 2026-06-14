// =============================================================================
// app/auth/confirm/route.ts
// Conferma email (e altri OTP via link). Robusta e config-agnostica: gestisce
// SIA il flusso `token_hash`+`type` (verifyOtp — cross-device, niente PKCE) SIA
// il flusso `code` (exchangeCodeForSession). Tutto in try/catch: in nessun caso
// l'utente vede un 500. verifyOtp/exchange creano la sessione (cookie SSR), poi
// si redirige a `next` (default onboarding). Errori → pagina /auth/error leggibile.
// =============================================================================

import { NextResponse } from 'next/server';
import type { EmailOtpType } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';

/** Solo path interni relativi (no open-redirect). */
function safeNext(raw: string | null): string {
  return raw && raw.startsWith('/') && !raw.startsWith('//') ? raw : '/onboarding';
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const tokenHash = searchParams.get('token_hash');
  const type = searchParams.get('type') as EmailOtpType | null;
  const code = searchParams.get('code');
  const next = safeNext(searchParams.get('next'));
  const errorUrl = (reason: string) => `${origin}/auth/error?reason=${encodeURIComponent(reason)}`;

  const supabase = await createClient();

  try {
    if (tokenHash && type) {
      const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
      if (error) return NextResponse.redirect(errorUrl(error.message));
      return NextResponse.redirect(`${origin}${next}`);
    }

    if (code) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) return NextResponse.redirect(errorUrl(error.message));
      return NextResponse.redirect(`${origin}${next}`);
    }
  } catch (err) {
    console.error('[auth/confirm] verifica non riuscita', err);
    return NextResponse.redirect(errorUrl('Verifica non riuscita. Il link potrebbe essere scaduto.'));
  }

  // Né token_hash né code: link incompleto o già usato.
  return NextResponse.redirect(errorUrl('Link di conferma incompleto o già utilizzato.'));
}
