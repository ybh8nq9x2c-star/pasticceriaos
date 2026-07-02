-- =============================================================================
-- 052_marketplace_hardening.sql
-- Fix P1 della QA review "Sync ordini Pasticceria ↔ Fornitore".
--
-- P1-1 — current_organization_id() deterministica.
--   Prima: LIMIT 1 senza ORDER BY -> con un utente membro di più org, tenant e
--   account_type oscillavano tra query plan (perimetro RLS nondeterministico).
--   Ora: vince la membership più vecchia, con tie-break sull'id. Il refactor
--   vero (org attiva nel JWT claim) resta pianificato; questo elimina
--   l'oscillazione senza cambiare la firma usata da tutte le policy.
--   Guardia operativa: supabase/diagnostics/multi_org_guard.sql (target: 0 righe).
--
-- P1-3 (leak) — il fornitore non legge i draft del cliente.
--   Prima: mo_select esponeva anche status='draft' al fornitore via API diretta
--   (la UI filtrava, ma la UI non è un confine). Un draft è un'intenzione
--   d'acquisto non ancora comunicata: ora è visibile solo al cliente.
--   Le policy di lines/history passano dall'exists su marketplace_orders,
--   quindi anche righe e storia dei draft spariscono dal lato fornitore.
-- =============================================================================

-- ── P1-1: tenant deterministico ───────────────────────────────────────────────
create or replace function public.current_organization_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select organization_id
  from   org_members
  where  user_id = auth.uid()
  order  by created_at asc, organization_id asc
  limit  1;
$$;

comment on function public.current_organization_id() is
  'Org dell''utente corrente: membership più vecchia (ORDER BY deterministico). Multi-org reale richiederà l''org attiva nel JWT claim; nel frattempo la guardia multi_org_guard.sql deve restituire 0 righe.';

-- ── P1-3: il fornitore vede l'ordine solo da submitted in poi ────────────────
drop policy if exists mo_select on public.marketplace_orders;
create policy mo_select on public.marketplace_orders for select
  using (
    customer_org_id = public.current_organization_id()
    or (supplier_org_id = public.current_organization_id() and status <> 'draft')
  );
