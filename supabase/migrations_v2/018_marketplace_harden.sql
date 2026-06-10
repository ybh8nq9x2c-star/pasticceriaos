-- =============================================================================
-- 018_marketplace_harden.sql
-- Security hardening discovered during the staging advisor review (all items
-- were WARN-level; none were exploitable because the helpers fail safe for
-- anon). Two classes of fix:
--
--   1. Pin search_path on the two functions that were missing it
--      (set_updated_at, marketplace_order_actor_for_transition) — matches the
--      pattern already used by every other function in this feature.
--   2. Revoke EXECUTE from PUBLIC/anon/authenticated on the INTERNAL helpers and
--      TRIGGER functions so they are not reachable as PostgREST RPCs. Trigger
--      functions run under the table owner during the trigger, so revoking the
--      callable grant does NOT affect the triggers themselves.
--
-- Intentionally NOT changed: current_organization_id(), current_account_type(),
-- is_org_owner(), create_organization(), connect_supplier_by_key_hash().
-- The first three are evaluated inside RLS policies (the `authenticated` role
-- must keep EXECUTE); create_organization and connect_supplier_by_key_hash are
-- meant to be called by signed-in users and self-guard (an anon caller has no
-- org, so they raise instead of leaking). Those advisor entries are accepted.
--
-- Forward-only hardening. A full feature rollback (017) drops these functions
-- entirely, which also removes the grants/search_path set here.
-- =============================================================================

-- 1a. set_updated_at: pin search_path (body unchanged; create-or-replace keeps
--     every existing trigger binding intact).
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- 1b. marketplace_order_actor_for_transition: pin search_path (body unchanged).
create or replace function public.marketplace_order_actor_for_transition(
  p_from marketplace_order_status,
  p_to   marketplace_order_status
)
returns account_type
language plpgsql
immutable
set search_path = public
as $$
begin
  if p_from = 'draft'      and p_to = 'submitted'      then return 'customer'; end if;
  if p_from = 'draft'      and p_to = 'cancelled'      then return 'customer'; end if;
  if p_from = 'submitted'  and p_to = 'cancelled'      then return 'customer'; end if;
  if p_from = 'submitted'      and p_to = 'accepted'       then return 'supplier'; end if;
  if p_from = 'submitted'      and p_to = 'cancelled'      then return 'supplier'; end if;
  if p_from = 'accepted'       and p_to = 'in_preparation' then return 'supplier'; end if;
  if p_from = 'accepted'       and p_to = 'cancelled'      then return 'supplier'; end if;
  if p_from = 'in_preparation' and p_to = 'shipped'        then return 'supplier'; end if;
  if p_from = 'in_preparation' and p_to = 'cancelled'      then return 'supplier'; end if;
  if p_from = 'shipped'        and p_to = 'delivered'      then return 'supplier'; end if;

  raise exception 'transizione ordine non consentita: % -> %', p_from, p_to using errcode = 'P0200';
end;
$$;

-- 2. Lock down internal + trigger functions from direct (RPC) execution.
--    Revoking from a role that has no grant is a harmless no-op.
revoke all on function public.assert_org_is_supplier(uuid)
  from public, anon, authenticated;
revoke all on function public.marketplace_order_actor_for_transition(marketplace_order_status, marketplace_order_status)
  from public, anon, authenticated;
revoke all on function public.fn_marketplace_order_status_guard()
  from public, anon, authenticated;
revoke all on function public.fn_marketplace_order_status_log()
  from public, anon, authenticated;

-- 3. These two RPCs are authenticated-only actions (onboarding / a signed-in
--    customer connecting a supplier). They already self-guard (an anon caller
--    has no auth.uid()/org and raises), but anon has no business calling them.
--    create_organization still carries the implicit PUBLIC execute grant, so
--    anon inherits it via PUBLIC — revoke PUBLIC (and anon) while keeping the
--    explicit `authenticated` grant (from 012 / 015). Revoking a non-existent
--    grant is a harmless no-op.
revoke all on function public.create_organization(text, text, text, text, account_type)
  from public, anon;
revoke all on function public.connect_supplier_by_key_hash(text)
  from public, anon;
