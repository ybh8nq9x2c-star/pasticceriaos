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
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
