import { createBrowserClient } from "@supabase/ssr";

/**
 * Client-side Supabase client — use in Client Components.
 * Reads from NEXT_PUBLIC_* env vars (safe to expose).
 */
export function createClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      'Missing Supabase env vars: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY ' +
        'must be set at build time (Railway → Variables) and the app rebuilt.'
    );
  }
  return createBrowserClient(supabaseUrl, supabaseAnonKey);
}
