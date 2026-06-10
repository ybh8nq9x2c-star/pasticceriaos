-- =============================================================================
-- 017_marketplace_down.sql  (ROLLBACK for 012–016)
-- Run only to fully revert the marketplace feature. Order matters (FK deps).
-- account_type column is dropped LAST; create_organization is restored to its
-- 4-arg form.
-- =============================================================================

drop function if exists public.connect_supplier_by_key_hash(text);

drop table if exists public.marketplace_order_status_history cascade;
drop table if exists public.marketplace_order_lines          cascade;
drop table if exists public.marketplace_orders               cascade;
drop function if exists public.fn_marketplace_order_status_log() cascade;
drop function if exists public.fn_marketplace_order_status_guard() cascade;
drop function if exists public.marketplace_order_actor_for_transition(marketplace_order_status, marketplace_order_status);
drop type if exists marketplace_order_status;

drop table if exists public.supplier_catalog_items          cascade;
drop table if exists public.supplier_customer_connections   cascade;
drop table if exists public.supplier_connection_keys        cascade;
drop function if exists public.assert_org_is_supplier(uuid);
drop type if exists connection_status;

drop table if exists public.audit_logs cascade;

drop function if exists public.current_account_type();

-- drop the 5-arg variant (references account_type) before restoring the 4-arg
drop function if exists public.create_organization(text, text, text, text, account_type);

-- restore the original 4-arg create_organization
create or replace function public.create_organization(
  p_name text, p_slug text, p_city text DEFAULT NULL, p_email text DEFAULT NULL
)
returns table(organization_id uuid, member_id uuid)
language plpgsql security definer set search_path = public
as $$
declare v_user_id uuid; v_org_id uuid; v_member_id uuid; v_existing_org uuid;
begin
  v_user_id := auth.uid();
  if v_user_id is null then raise exception 'create_organization: utente non autenticato' using errcode='P0001'; end if;
  select om.organization_id into v_existing_org from org_members om where om.user_id = v_user_id limit 1;
  if v_existing_org is not null then raise exception 'create_organization: utente già associato a un organizzazione (id: %)', v_existing_org using errcode='P0002'; end if;
  if p_name is null or char_length(trim(p_name)) = 0 then raise exception 'p_name vuoto' using errcode='P0003'; end if;
  if p_slug is null or char_length(trim(p_slug)) = 0 then raise exception 'p_slug vuoto' using errcode='P0004'; end if;
  if p_slug !~ '^[a-z0-9][a-z0-9\-]*[a-z0-9]$' then raise exception 'p_slug non valido' using errcode='P0005'; end if;
  insert into organizations (name, slug, city, email)
  values (trim(p_name), trim(p_slug), nullif(trim(coalesce(p_city,'')),''), nullif(trim(coalesce(p_email,'')),''))
  returning id into v_org_id;
  insert into org_members (organization_id, user_id, role) values (v_org_id, v_user_id, 'owner') returning id into v_member_id;
  return query select v_org_id, v_member_id;
end; $$;

alter table public.organizations drop column if exists account_type;
drop type if exists account_type;
