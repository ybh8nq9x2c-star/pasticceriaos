// =============================================================================
// modules/marketplace/db.ts
// Cookie-bound Supabase client for the marketplace tables (RLS-enforced).
//
// Types come from the generated `lib/database.types.ts` (regenerated after
// migrations 012–016 were applied). The marketplace tables, enums and RPCs are
// part of the single canonical `Database` type, so the client is fully typed;
// the service layer still re-shapes every result at its public boundary.
// =============================================================================

import { createClient } from '@/lib/supabase/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';

// Connection-key crypto lives in ./keys (pure, unit-testable); re-exported here.
export { generateConnectionKey, hashConnectionKey, type GeneratedKey } from './keys';

/** A Supabase client typed against the full application schema. */
export type MarketplaceClient = SupabaseClient<Database>;

/**
 * Cookie-bound Supabase client (RLS-enforced) for the marketplace tables.
 * The user JWT (anon key) is used, so these RLS policies are the real backend
 * boundary; the service layer mirrors them for UX only.
 */
export async function createMarketplaceClient(): Promise<MarketplaceClient> {
  return createClient<Database>();
}
