// =============================================================================
// lib/supabase/org-scope.ts — guardrail per query SERVICE-ROLE (P0-G).
//
// Il client service-role BYPASSA la RLS: ogni query DEVE filtrare per
// organization_id, e prima la sicurezza dipendeva dal ricordarsi il .eq a mano.
// Questo wrapper rende lo scoping impossibile da dimenticare "by construction":
//   const org = orgScoped(admin, orgId);
//   org.select('pos_events', 'id,status')  → .eq('organization_id', orgId) SEMPRE
//   org.update('pos_events', patch)        → idem
//   org.insert/upsert('pos_events', row)   → organization_id INIETTATO nella riga
// Le query cross-org legittime (es. risoluzione org dal webhook) NON passano da
// qui e restano riconoscibili a colpo d'occhio (client nudo).
//
// TIPIZZAZIONE: il ritorno è il builder supabase "loose" (any) — il compito del
// wrapper è la SICUREZZA dello scoping, non ri-derivare i generics di
// supabase-js (che con i nomi-tabella dinamici degenerano in instantiation
// troppo profonde). I call-site tipizzano i risultati come già fanno altrove.
// =============================================================================

import type { SupabaseClient } from '@supabase/supabase-js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any, any, any>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type OrgQuery = any;

export interface OrgScoped {
  readonly orgId: string;
  /** SELECT già filtrata per organization_id. */
  select(table: string, columns: string): OrgQuery;
  /** SELECT head-count già filtrata. */
  count(table: string): OrgQuery;
  /** UPDATE già filtrato per organization_id (aggiungi altri .eq a valle). */
  update(table: string, patch: Record<string, unknown>): OrgQuery;
  /** INSERT con organization_id iniettato (sovrascrive qualsiasi valore passato). */
  insert(table: string, row: Record<string, unknown>): OrgQuery;
  /** UPSERT con organization_id iniettato. */
  upsert(
    table: string,
    row: Record<string, unknown>,
    options?: { onConflict?: string; ignoreDuplicates?: boolean },
  ): OrgQuery;
}

export function orgScoped(client: AnyClient, orgId: string): OrgScoped {
  if (!orgId) {
    throw new Error('orgScoped: organization_id mancante — mai query service-role senza org.');
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c = client as any;
  return {
    orgId,
    select: (table, columns) => c.from(table).select(columns).eq('organization_id', orgId),
    count: (table) =>
      c.from(table).select('id', { count: 'exact', head: true }).eq('organization_id', orgId),
    update: (table, patch) => c.from(table).update(patch).eq('organization_id', orgId),
    insert: (table, row) => c.from(table).insert({ ...row, organization_id: orgId }),
    upsert: (table, row, options) => c.from(table).upsert({ ...row, organization_id: orgId }, options),
  };
}
