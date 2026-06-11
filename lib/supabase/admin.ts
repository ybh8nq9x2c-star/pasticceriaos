// =============================================================================
// lib/supabase/admin.ts
// Client service-role: SOLO server-side. Bypassa RLS — ogni query DEVE filtrare
// esplicitamente per organization_id/supplier_id (pattern portale fornitore).
// MAI importare questo modulo da componenti client.
// =============================================================================

import 'server-only';
import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';

export function isAdminClientConfigured(): boolean {
  return Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export function createAdminClient(): SupabaseClient<Database> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) throw new Error('NEXT_PUBLIC_SUPABASE_URL mancante');
  if (!serviceKey) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY mancante: il portale fornitore non è configurato. ' +
      'Copiala dal Dashboard Supabase (Project Settings → API) in .env.local.',
    );
  }
  return createSupabaseClient<Database>(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
