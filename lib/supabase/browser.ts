// =============================================================================
// lib/supabase/browser.ts
// Client Supabase per componenti Client (browser).
// Usato in: 'use client' components, hooks.
// NON usare in Server Components, Server Actions o middleware.
// =============================================================================
import { createBrowserClient } from '@supabase/ssr';
import type { Database } from '@/lib/database.types';

/**
 * Singleton browser client.
 * Sicuro da chiamare più volte: @supabase/ssr deduplicates internamente.
 */
export function createClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      'Missing Supabase env vars: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY ' +
        'must be set at build time (Railway → Variables) and the app rebuilt.',
    );
  }
  return createBrowserClient<Database>(supabaseUrl, supabaseAnonKey);
}
