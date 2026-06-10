-- =============================================================================
-- 012_marketplace_account_type.sql
-- Dual-workspace foundation: organizations get an account_type (customer|supplier).
--
-- ADDITIVE & SAFE:
--   * New enum `account_type`.
--   * New column organizations.account_type NOT NULL DEFAULT 'customer'
--     -> all existing orgs (internal bakery app) become CUSTOMER. No data loss.
--   * New SECURITY DEFINER helper current_account_type() for RLS / guards.
--   * create_organization() extended with an optional account type (default
--     'customer' keeps the previous signature behaviour for any old caller).
--
-- Reversible: see 016_marketplace_down.sql
-- =============================================================================

-- ── Enum ─────────────────────────────────────────────────────────────────────
do $$
begin
  if not exists (select 1 from pg_type where typname = 'account_type') then
    create type account_type as enum ('customer', 'supplier');
  end if;
end$$;

-- ── Column ───────────────────────────────────────────────────────────────────
alter table public.organizations
  add column if not exists account_type account_type not null default 'customer';

comment on column public.organizations.account_type is
  'Workspace kind. CUSTOMER = bakery/laboratory buyer. SUPPLIER = wholesaler seller. Immutable after creation (no UPDATE policy exposes it).';

-- ── Helper: account type of the caller''s organization ───────────────────────
-- SECURITY DEFINER (bypasses RLS on its own read) + pinned search_path, exactly
-- like current_organization_id(). Used by RLS policies and TS guards.
create or replace function public.current_account_type()
returns account_type
language sql
stable
security definer
set search_path = public
as $$
  select o.account_type
  from organizations o
  where o.id = public.current_organization_id()
  limit 1;
$$;

comment on function public.current_account_type() is
  'Returns the account_type of the authenticated user''s organization, or NULL if none.';

-- ── create_organization(): capture the chosen account type at onboarding ─────
-- Adding p_account_type changes the signature (4 -> 5 args), so we DROP the old
-- overload first (otherwise Postgres keeps both). The default keeps call sites
-- that omit the type working ('customer').
drop function if exists public.create_organization(text, text, text, text);

create or replace function public.create_organization(
  p_name         text,
  p_slug         text,
  p_city         text DEFAULT NULL,
  p_email        text DEFAULT NULL,
  p_account_type account_type DEFAULT 'customer'
)
returns table(organization_id uuid, member_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id      uuid;
  v_org_id       uuid;
  v_member_id    uuid;
  v_existing_org uuid;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'create_organization: utente non autenticato' using errcode = 'P0001';
  end if;

  select om.organization_id into v_existing_org
  from org_members om where om.user_id = v_user_id limit 1;
  if v_existing_org is not null then
    raise exception 'create_organization: utente già associato a un organizzazione (id: %)', v_existing_org using errcode = 'P0002';
  end if;

  if p_name is null or char_length(trim(p_name)) = 0 then
    raise exception 'create_organization: p_name non può essere vuoto' using errcode = 'P0003';
  end if;
  if p_slug is null or char_length(trim(p_slug)) = 0 then
    raise exception 'create_organization: p_slug non può essere vuoto' using errcode = 'P0004';
  end if;
  if p_slug !~ '^[a-z0-9][a-z0-9\-]*[a-z0-9]$' then
    raise exception 'create_organization: p_slug non valido' using errcode = 'P0005';
  end if;

  insert into organizations (name, slug, city, email, account_type)
  values (
    trim(p_name),
    trim(p_slug),
    nullif(trim(coalesce(p_city, '')), ''),
    nullif(trim(coalesce(p_email, '')), ''),
    coalesce(p_account_type, 'customer')
  )
  returning id into v_org_id;

  insert into org_members (organization_id, user_id, role)
  values (v_org_id, v_user_id, 'owner')
  returning id into v_member_id;

  return query select v_org_id, v_member_id;
end;
$$;

-- Match the base grant pattern: only authenticated users may call it.
grant execute on function public.create_organization(text, text, text, text, account_type) to authenticated;
