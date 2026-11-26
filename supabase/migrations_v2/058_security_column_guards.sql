-- =============================================================================
-- 058_security_column_guards.sql
-- Fix dei finding F-02, F-03, F-07 di SECURITY_REPORT.md (audit 2026-11).
--
-- Problema comune: le policy RLS di UPDATE limitano QUALI righe si toccano, non
-- QUALI colonne. Con PostgREST un utente autenticato poteva riscrivere colonne di
-- identità/tenant (spostare righe tra tenant) o colonne di stato derivate.
--
-- Principio dei guard: si applicano SOLO quando la scrittura arriva direttamente
-- dal client (current_user = 'authenticated' / 'anon', cioè PostgREST o un RPC
-- SECURITY INVOKER). Le RPC SECURITY DEFINER (current_user = owner) e il service
-- role restano i write-path canonici e NON vengono toccati: nessun cambiamento
-- di comportamento per i flussi esistenti dell'app.
--
--   F-02  supplier_customer_connections: colonne di identità immutabili;
--         il client può solo REVOCARE. Riattivare = solo via
--         connect_supplier_by_key_hash (definer, richiede una chiave valida).
--   F-03  marketplace_orders: customer/supplier/connection/idempotency immutabili;
--         i timestamp di ciclo vita li scrive solo il guard di stato (014).
--   F-07  inventory_levels: il client può cambiare SOLO min_threshold (la giacenza
--         la scrive solo il trigger dal ledger). sales / sale_lines / pos_events:
--         niente più DELETE dal client (storia append-only; storni = movimenti).
--
-- Additiva e idempotente. Rollback: drop dei trigger/funzioni qui sotto e
-- ricreazione delle policy *_write FOR ALL di 042/044.
-- =============================================================================

-- ── helper: la scrittura arriva direttamente dal client? ──────────────────────
-- SECURITY INVOKER (default) di proposito: deve vedere il current_user reale.
create or replace function public.is_direct_client_write()
returns boolean
language sql
stable
set search_path = public
as $$
  select current_user in ('authenticated', 'anon');
$$;

comment on function public.is_direct_client_write() is
  'true se la scrittura arriva dal client (PostgREST/RPC invoker). Le RPC SECURITY DEFINER e il service role risultano false.';

-- =============================================================================
-- F-02 · supplier_customer_connections
-- =============================================================================
create or replace function public.fn_connection_column_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not public.is_direct_client_write() then
    return new;
  end if;

  -- colonne di identità: mai modificabili dal client
  if new.supplier_org_id   is distinct from old.supplier_org_id
  or new.customer_org_id   is distinct from old.customer_org_id
  or new.connection_key_id is distinct from old.connection_key_id
  or new.created_by        is distinct from old.created_by
  or new.created_at        is distinct from old.created_at then
    raise exception 'connessione: le parti del collegamento non sono modificabili'
      using errcode = 'P0310';
  end if;

  -- stato: il client può solo revocare. La riattivazione passa da una chiave valida.
  if new.status is distinct from old.status and new.status <> 'revoked' then
    raise exception 'connessione: per ricollegarsi serve una nuova chiave del fornitore'
      using errcode = 'P0311';
  end if;

  -- una connessione già revocata non si "ritocca" (revoked_at/by restano storici)
  if old.status = 'revoked'
     and (new.revoked_at is distinct from old.revoked_at
          or new.revoked_by is distinct from old.revoked_by) then
    raise exception 'connessione già revocata' using errcode = 'P0312';
  end if;

  return new;
end;
$$;

revoke all on function public.fn_connection_column_guard() from public, anon, authenticated;

drop trigger if exists trg_connection_column_guard on public.supplier_customer_connections;
create trigger trg_connection_column_guard
  before update on public.supplier_customer_connections
  for each row execute function public.fn_connection_column_guard();

-- =============================================================================
-- F-03 · marketplace_orders
-- Nome scelto perché i BEFORE trigger girano in ordine alfabetico:
--   marketplace_orders_set_updated_at  <  trg_marketplace_order_immutable_cols
--   <  trg_marketplace_order_status_guard
-- Questo guard deve girare PRIMA del guard di stato: azzera i timestamp forniti
-- dal client, così è il guard di stato (014) a stamparli.
-- =============================================================================
create or replace function public.fn_marketplace_order_immutable_cols()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not public.is_direct_client_write() then
    return new;
  end if;

  if new.customer_org_id is distinct from old.customer_org_id
  or new.supplier_org_id is distinct from old.supplier_org_id
  or new.connection_id   is distinct from old.connection_id
  or new.idempotency_key is distinct from old.idempotency_key
  or new.created_by      is distinct from old.created_by
  or new.created_at      is distinct from old.created_at then
    raise exception 'ordine marketplace: cliente, fornitore e connessione non sono modificabili'
      using errcode = 'P0204';
  end if;

  -- i timestamp di ciclo vita appartengono al guard di stato, non al client
  new.submitted_at := old.submitted_at;
  new.accepted_at  := old.accepted_at;
  new.shipped_at   := old.shipped_at;
  new.delivered_at := old.delivered_at;
  new.cancelled_at := old.cancelled_at;

  return new;
end;
$$;

revoke all on function public.fn_marketplace_order_immutable_cols() from public, anon, authenticated;

drop trigger if exists trg_marketplace_order_immutable_cols on public.marketplace_orders;
create trigger trg_marketplace_order_immutable_cols
  before update on public.marketplace_orders
  for each row execute function public.fn_marketplace_order_immutable_cols();

-- =============================================================================
-- F-07a · inventory_levels: dal client solo la soglia
-- (la policy inventory_levels_update resta: serve a modules/inventory per
--  min_threshold. La giacenza la scrive SOLO update_inventory_level_from_movement,
--  che è SECURITY DEFINER e quindi non passa da questo guard.)
-- =============================================================================
create or replace function public.fn_inventory_levels_client_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not public.is_direct_client_write() then
    return new;
  end if;

  if (to_jsonb(new) - 'min_threshold' - 'last_updated_at')
     is distinct from
     (to_jsonb(old) - 'min_threshold' - 'last_updated_at') then
    raise exception 'magazzino: la giacenza si modifica solo con un movimento (rettifica), non direttamente'
      using errcode = 'P0213';
  end if;

  return new;
end;
$$;

revoke all on function public.fn_inventory_levels_client_guard() from public, anon, authenticated;

drop trigger if exists trg_inventory_levels_client_guard on public.inventory_levels;
create trigger trg_inventory_levels_client_guard
  before update on public.inventory_levels
  for each row execute function public.fn_inventory_levels_client_guard();

-- =============================================================================
-- F-07b · sales / sale_lines / pos_events: niente DELETE dal client
-- Le policy FOR ALL di 042/044 diventano INSERT + UPDATE (stesse condizioni);
-- le SELECT restano invariate. Le RPC (ingest/reverse/relink) sono definer e
-- il webhook usa il service role: nessun impatto. L'app oggi non cancella mai
-- da queste tabelle (verificato: nessun .delete() in modules/).
-- =============================================================================
drop policy if exists sales_write on public.sales;
drop policy if exists sales_insert on public.sales;
drop policy if exists sales_update on public.sales;
create policy sales_insert on public.sales for insert
  with check (organization_id = current_organization_id());
create policy sales_update on public.sales for update
  using (organization_id = current_organization_id())
  with check (organization_id = current_organization_id());

drop policy if exists sale_lines_write on public.sale_lines;
drop policy if exists sale_lines_insert on public.sale_lines;
drop policy if exists sale_lines_update on public.sale_lines;
create policy sale_lines_insert on public.sale_lines for insert
  with check (organization_id = current_organization_id());
create policy sale_lines_update on public.sale_lines for update
  using (organization_id = current_organization_id())
  with check (organization_id = current_organization_id());

drop policy if exists pos_events_write on public.pos_events;
drop policy if exists pos_events_insert on public.pos_events;
drop policy if exists pos_events_update on public.pos_events;
create policy pos_events_insert on public.pos_events for insert
  with check (organization_id = current_organization_id());
create policy pos_events_update on public.pos_events for update
  using (organization_id = current_organization_id())
  with check (organization_id = current_organization_id());
