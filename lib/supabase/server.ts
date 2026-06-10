// =============================================================================
// lib/supabase/server.ts
// Client Supabase per Server Components e Server Actions.
// =============================================================================
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { Database } from '@/lib/database.types';

type CookieToSet = { name: string; value: string; options?: Record<string, unknown> };

/**
 * Crea un client Supabase server-side con Database generic type.
 * Usare in Server Components, Server Actions e Route Handlers.
 */
export async function createClient<DB = Database>() {
  const cookieStore = await cookies();

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      'Missing Supabase env vars: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY ' +
        'must be set at build time (Railway → Variables) and the app rebuilt.',
    );
  }

  return createServerClient<DB>(
    supabaseUrl,
    supabaseAnonKey,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }: CookieToSet) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // In Server Components i cookie non possono essere impostati.
            // Il middleware gestisce il refresh della sessione.
          }
        },
      },
    },
  );
}
