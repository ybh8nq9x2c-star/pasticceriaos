-- =============================================================================
-- 014_marketplace_orders.sql
-- ONE canonical cross-org order shared by both workspaces (no duplication).
--   marketplace_orders            : the order header (buyer org + seller org)
--   marketplace_order_lines        : immutable line snapshots
--   marketplace_order_status_history : append-only audit of every transition
--
-- The customer creates & submits; the supplier drives fulfilment. Both sides
-- read the SAME row (scoped by RLS). Transitions + which-side-may-act are
-- enforced at the DB (trigger, defense in depth) and the service layer.
-- =============================================================================

do $$
begin
  if not exists (select 1 from pg_type where typname = 'marketplace_order_status') then
    create type marketplace_order_status as enum (
      'draft', 'submitted', 'accepted', 'in_preparation', 'shipped', 'delivered', 'cancelled'
    );
  end if;
end$$;

-- ── Order header ─────────────────────────────────────────────────────────────
create table if not exists public.marketplace_orders (
  id               uuid primary key default gen_random_uuid(),
  customer_org_id  uuid not null references public.organizations(id) on delete restrict,  -- buyer
  supplier_org_id  uuid not null references public.organizations(id) on delete restrict,  -- seller
  connection_id    uuid not null references public.supplier_customer_connections(id) on delete restrict,
  status           marketplace_order_status not null default 'draft',
  notes            text,
  -- idempotency for create (client-provided): same key -> same logical order.
  idempotency_key  text,
  created_by       uuid references auth.users(id),
  submitted_at     timestamptz,
  accepted_at      timestamptz,
  shipped_at       timestamptz,
  delivered_at     timestamptz,
  cancelled_at     timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint marketplace_orders_distinct_orgs check (customer_org_id <> supplier_org_id)
);

-- idempotent create per customer org (NULLs allowed & distinct in Postgres).
create unique index if not exists marketplace_orders_idem_uq
  on public.marketplace_orders (customer_org_id, idempotency_key)
  where idempotency_key is not null;

comment on table public.marketplace_orders is
  'Canonical cross-organization purchase order. customer_org_id = buyer, supplier_org_id = seller. Single shared row.';

drop trigger if exists marketplace_orders_set_updated_at on public.marketplace_orders;
create trigger marketplace_orders_set_updated_at
  before update on public.marketplace_orders
  for each row execute function public.set_updated_at();

-- ── Order lines (immutable snapshots) ────────────────────────────────────────
create table if not exists public.marketplace_order_lines (
  id                   uuid primary key default gen_random_uuid(),
  order_id             uuid not null references public.marketplace_orders(id) on delete cascade,
  catalog_item_id      uuid references public.supplier_catalog_items(id) on delete set null,
  name_snapshot        text not null check (char_length(trim(name_snapshot)) > 0),
  sku_snapshot         text,
  unit                 unit_of_measure not null,
  quantity             numeric not null check (quantity > 0),
  unit_price_snapshot  numeric check (unit_price_snapshot is null or unit_price_snapshot >= 0),
  sort_order           integer not null default 0
);

comment on table public.marketplace_order_lines is
  'Line items captured as snapshots at order time so historical orders never drift when the catalog changes.';

-- ── Status history (append-only audit) ───────────────────────────────────────
create table if not exists public.marketplace_order_status_history (
  id                uuid primary key default gen_random_uuid(),
  order_id          uuid not null references public.marketplace_orders(id) on delete cascade,
  from_status       marketplace_order_status,
  to_status         marketplace_order_status not null,
  changed_by        uuid references auth.users(id),
  changed_by_org_id uuid references public.organizations(id),
  note              text,
  created_at        timestamptz not null default now()
);

-- ── Transition map + side enforcement (DB-level guard) ───────────────────────
-- Returns the account_type permitted to perform from->to, or raises if invalid.
create or replace function public.marketplace_order_actor_for_transition(
  p_from marketplace_order_status,
  p_to   marketplace_order_status
)
returns account_type
language plpgsql
immutable
as $$
begin
  -- customer-driven
  if p_from = 'draft'      and p_to = 'submitted'      then return 'customer'; end if;
  if p_from = 'draft'      and p_to = 'cancelled'      then return 'customer'; end if;
  if p_from = 'submitted'  and p_to = 'cancelled'      then return 'customer'; end if;
  -- supplier-driven
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

create or replace function public.fn_marketplace_order_status_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_required account_type;
  v_actor    account_type;
  v_org      uuid;
begin
  if new.status = old.status then
    return new;
  end if;

  v_required := public.marketplace_order_actor_for_transition(old.status, new.status);
  v_actor    := public.current_account_type();
  v_org      := public.current_organization_id();

  if v_actor is distinct from v_required then
    raise exception 'solo un account % può eseguire la transizione % -> %', v_required, old.status, new.status using errcode = 'P0201';
  end if;
  -- the actor must be the correct *party* of this very order.
  if v_required = 'customer' and v_org is distinct from new.customer_org_id then
    raise exception 'non sei il cliente di questo ordine' using errcode = 'P0202';
  end if;
  if v_required = 'supplier' and v_org is distinct from new.supplier_org_id then
    raise exception 'non sei il fornitore di questo ordine' using errcode = 'P0203';
  end if;

  -- stamp lifecycle timestamps
  new.submitted_at := coalesce(new.submitted_at, case when new.status = 'submitted'      then now() end);
  new.accepted_at  := coalesce(new.accepted_at,  case when new.status = 'accepted'       then now() end);
  new.shipped_at   := coalesce(new.shipped_at,   case when new.status = 'shipped'        then now() end);
  new.delivered_at := coalesce(new.delivered_at, case when new.status = 'delivered'      then now() end);
  new.cancelled_at := coalesce(new.cancelled_at, case when new.status = 'cancelled'      then now() end);
  return new;
end;
$$;

drop trigger if exists trg_marketplace_order_status_guard on public.marketplace_orders;
create trigger trg_marketplace_order_status_guard
  before update on public.marketplace_orders
  for each row execute function public.fn_marketplace_order_status_guard();

-- Append-only history on insert + every status change.
create or replace function public.fn_marketplace_order_status_log()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into marketplace_order_status_history (order_id, from_status, to_status, changed_by, changed_by_org_id)
    values (new.id, null, new.status, auth.uid(), public.current_organization_id());
  elsif tg_op = 'UPDATE' and new.status is distinct from old.status then
    insert into marketplace_order_status_history (order_id, from_status, to_status, changed_by, changed_by_org_id)
    values (new.id, old.status, new.status, auth.uid(), public.current_organization_id());
  end if;
  return null;
end;
$$;

drop trigger if exists trg_marketplace_order_status_log on public.marketplace_orders;
create trigger trg_marketplace_order_status_log
  after insert or update on public.marketplace_orders
  for each row execute function public.fn_marketplace_order_status_log();
