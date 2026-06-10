-- =============================================================================
-- 013_marketplace_connections_catalog.sql
-- Supplier connection keys, customer<->supplier connections, supplier catalog.
--
-- KEY SECURITY MODEL ("public prefix + secret token"):
--   * A connection key is a high-entropy human-shareable string, e.g.
--       PSOS-K7Q4-9ZB2-XR3M   (prefix "PSOS-K7Q4" is shown to identify the key)
--   * We NEVER store the plaintext key. We store:
--       - key_prefix : the first public segment, for the supplier's UI list
--       - key_hash   : sha256(full_key) hex, used to look the key up on connect
--   * On connect the customer submits the full key; the backend hashes it and
--     matches an ACTIVE key by hash. Revocation = is_active=false. Rotation =
--     issue a new key + revoke the old one. ~80 bits of entropy in the secret
--     part -> not guessable.
-- =============================================================================

-- ── Enum: connection status ──────────────────────────────────────────────────
do $$
begin
  if not exists (select 1 from pg_type where typname = 'connection_status') then
    create type connection_status as enum ('active', 'revoked');
  end if;
end$$;

-- ── supplier_connection_keys ─────────────────────────────────────────────────
create table if not exists public.supplier_connection_keys (
  id                uuid primary key default gen_random_uuid(),
  supplier_org_id   uuid not null references public.organizations(id) on delete cascade,
  label             text,                              -- optional human note ("for Bar Centrale")
  key_prefix        text not null,                     -- public, displayed (e.g. "PSOS-K7Q4")
  key_hash          text not null,                     -- sha256(full key) hex; secret material never stored
  is_active         boolean not null default true,
  created_by        uuid references auth.users(id),
  created_at        timestamptz not null default now(),
  revoked_at        timestamptz,
  revoked_by        uuid references auth.users(id),
  constraint supplier_connection_keys_key_hash_key unique (key_hash),
  constraint supplier_connection_keys_prefix_chk check (char_length(key_prefix) between 4 and 32)
);

comment on table public.supplier_connection_keys is
  'Revocable, rotatable connection keys owned by a SUPPLIER org. Only the sha256 hash is stored.';

-- Only supplier orgs may own keys (defense in depth alongside RLS/service checks).
create or replace function public.assert_org_is_supplier(p_org_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if (select account_type from organizations where id = p_org_id) is distinct from 'supplier' then
    raise exception 'organization % is not a supplier', p_org_id using errcode = 'P0100';
  end if;
end;
$$;

-- ── supplier_customer_connections (the real org<->org relationship) ──────────
create table if not exists public.supplier_customer_connections (
  id                uuid primary key default gen_random_uuid(),
  supplier_org_id   uuid not null references public.organizations(id) on delete cascade,
  customer_org_id   uuid not null references public.organizations(id) on delete cascade,
  connection_key_id uuid references public.supplier_connection_keys(id) on delete set null,
  status            connection_status not null default 'active',
  created_by        uuid references auth.users(id),
  created_at        timestamptz not null default now(),
  revoked_at        timestamptz,
  revoked_by        uuid references auth.users(id),
  -- one canonical row per (supplier, customer) pair -> prevents duplicate connections.
  constraint supplier_customer_connections_pair_key unique (supplier_org_id, customer_org_id),
  -- a connection cannot link an org to itself.
  constraint supplier_customer_connections_distinct_orgs check (supplier_org_id <> customer_org_id)
);

comment on table public.supplier_customer_connections is
  'Canonical persistent relationship between a customer org and a supplier org. Reconnect = UPSERT to status=active.';

-- ── supplier_catalog_items (supplier-owned, customer reads via connection) ───
create table if not exists public.supplier_catalog_items (
  id                uuid primary key default gen_random_uuid(),
  supplier_org_id   uuid not null references public.organizations(id) on delete cascade,
  name              text not null check (char_length(trim(name)) > 0),
  sku               text,
  unit              unit_of_measure not null,
  unit_price        numeric check (unit_price is null or unit_price >= 0),
  is_active         boolean not null default true,
  created_by        uuid references auth.users(id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

comment on table public.supplier_catalog_items is
  'Items a supplier offers. Visible to connected customers via the customer-side RLS read policy.';

drop trigger if exists supplier_catalog_items_set_updated_at on public.supplier_catalog_items;
create trigger supplier_catalog_items_set_updated_at
  before update on public.supplier_catalog_items
  for each row execute function public.set_updated_at();
