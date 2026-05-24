import { createBrowserClient } from "@supabase/ssr";

/**
 * Client-side Supabase client — use in Client Components.
 * Reads from NEXT_PUBLIC_* env vars (safe to expose).
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
