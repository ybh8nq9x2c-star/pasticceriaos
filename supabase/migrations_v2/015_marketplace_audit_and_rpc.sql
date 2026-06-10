-- =============================================================================
-- 015_marketplace_audit_and_rpc.sql
-- Audit trail + the secure connection RPC.
-- =============================================================================

-- ── audit_logs (append-only) ─────────────────────────────────────────────────
create table if not exists public.audit_logs (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations(id) on delete cascade,
  actor_user_id uuid references auth.users(id),
  action        text not null,                    -- e.g. 'connection.created', 'order.status_changed'
  entity_type   text not null,                    -- e.g. 'connection', 'marketplace_order'
  entity_id     uuid,
  metadata      jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);
create index if not exists audit_logs_org_created_idx on public.audit_logs (org_id, created_at desc);

comment on table public.audit_logs is 'Append-only audit trail scoped per organization.';

-- ── connect_supplier_by_key_hash() ───────────────────────────────────────────
-- The customer's app computes sha256(plaintext key) in Node and passes the hex
-- hash here. SECURITY DEFINER lets us resolve the supplier (which the customer
-- cannot read directly under RLS), validate, upsert the connection and audit it
-- atomically. Plaintext keys never reach the database.
create or replace function public.connect_supplier_by_key_hash(p_key_hash text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer_org uuid;
  v_supplier_org uuid;
  v_key_id       uuid;
  v_conn_id      uuid;
begin
  if public.current_account_type() is distinct from 'customer' then
    raise exception 'solo un account cliente può collegare un fornitore' using errcode = 'P0300';
  end if;

  v_customer_org := public.current_organization_id();
  if v_customer_org is null then
    raise exception 'organizzazione non trovata' using errcode = 'P0301';
  end if;

  select k.id, k.supplier_org_id into v_key_id, v_supplier_org
  from supplier_connection_keys k
  where k.key_hash = p_key_hash and k.is_active = true
  limit 1;

  if v_key_id is null then
    raise exception 'chiave fornitore non valida o revocata' using errcode = 'P0302';
  end if;
  if v_supplier_org = v_customer_org then
    raise exception 'non puoi collegarti alla tua stessa organizzazione' using errcode = 'P0303';
  end if;

  -- upsert: reconnecting after a revoke reactivates the same canonical row.
  insert into supplier_customer_connections
    (supplier_org_id, customer_org_id, connection_key_id, status, created_by)
  values (v_supplier_org, v_customer_org, v_key_id, 'active', auth.uid())
  on conflict (supplier_org_id, customer_org_id)
  do update set status = 'active',
               connection_key_id = excluded.connection_key_id,
               revoked_at = null,
               revoked_by = null
  returning id into v_conn_id;

  -- audit on both sides for traceability.
  insert into audit_logs (org_id, actor_user_id, action, entity_type, entity_id, metadata)
  values
    (v_customer_org, auth.uid(), 'connection.created', 'connection', v_conn_id,
       jsonb_build_object('supplier_org_id', v_supplier_org, 'key_id', v_key_id)),
    (v_supplier_org, auth.uid(), 'connection.received', 'connection', v_conn_id,
       jsonb_build_object('customer_org_id', v_customer_org, 'key_id', v_key_id));

  return v_conn_id;
end;
$$;

revoke all on function public.connect_supplier_by_key_hash(text) from public;
grant execute on function public.connect_supplier_by_key_hash(text) to authenticated;
