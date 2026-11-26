-- =============================================================================
-- tenant_ledger_guards.test.sql — regressione W2 (migration 059).
--   A) un utente dell'org B NON può completare un ricevimento che punta a un
--      ordine dell'org A (FK composita + org-check della RPC, errcode esplicito);
--   B) il ruolo `authenticated` NON scrive direttamente su ledger e proiezioni;
--   C) le scritture manuali passano dalle RPC con org-check, ruolo, unità e
--      guardia di stock.
-- Transazione + ROLLBACK: non lascia dati.
-- =============================================================================
begin;

-- ── Fixture ───────────────────────────────────────────────────────────────────
insert into auth.users (instance_id, id, aud, role, email) values
  ('00000000-0000-0000-0000-000000000000', '6a000000-0000-0000-0000-0000000000a1', 'authenticated', 'authenticated', 'w2-a@test.local'),
  ('00000000-0000-0000-0000-000000000000', '6b000000-0000-0000-0000-0000000000b1', 'authenticated', 'authenticated', 'w2-b@test.local'),
  ('00000000-0000-0000-0000-000000000000', '6a000000-0000-0000-0000-0000000000a9', 'authenticated', 'authenticated', 'w2-viewer@test.local');

insert into organizations (id, name, slug, account_type) values
  ('6a000000-0000-0000-0000-00000000000a', 'W2 Org A', 'w2-org-a', 'customer'),
  ('6b000000-0000-0000-0000-00000000000b', 'W2 Org B', 'w2-org-b', 'customer');
insert into org_members (organization_id, user_id, role) values
  ('6a000000-0000-0000-0000-00000000000a', '6a000000-0000-0000-0000-0000000000a1', 'owner'),
  ('6a000000-0000-0000-0000-00000000000a', '6a000000-0000-0000-0000-0000000000a9', 'viewer'),
  ('6b000000-0000-0000-0000-00000000000b', '6b000000-0000-0000-0000-0000000000b1', 'owner');

insert into suppliers (id, organization_id, name, email) values
  ('6a000000-0000-0000-0000-0000000005a1', '6a000000-0000-0000-0000-00000000000a', 'Sup A', 'sa@test.local'),
  ('6b000000-0000-0000-0000-0000000005b1', '6b000000-0000-0000-0000-00000000000b', 'Sup B', 'sb@test.local');
insert into ingredient_products (id, organization_id, supplier_id, name, unit) values
  ('6a000000-0000-0000-0000-0000000001a1', '6a000000-0000-0000-0000-00000000000a', '6a000000-0000-0000-0000-0000000005a1', 'Farina A', 'g'),
  ('6b000000-0000-0000-0000-0000000001b1', '6b000000-0000-0000-0000-00000000000b', '6b000000-0000-0000-0000-0000000005b1', 'Farina B', 'kg');
insert into recipes (id, organization_id, name, base_portions) values
  ('6a000000-0000-0000-0000-0000000007a1', '6a000000-0000-0000-0000-00000000000a', 'Cornetto A', 10),
  ('6b000000-0000-0000-0000-0000000007b1', '6b000000-0000-0000-0000-00000000000b', 'Cornetto B', 10);

-- ordine dell'org A, confermato, 10 kg
insert into purchase_orders (id, organization_id, supplier_id, status, order_date, sent_at, created_by) values
  ('6a000000-0000-0000-0000-0000000009a1', '6a000000-0000-0000-0000-00000000000a', '6a000000-0000-0000-0000-0000000005a1',
   'confirmed', current_date, now(), '6a000000-0000-0000-0000-0000000000a1');
insert into order_line_items (id, purchase_order_id, ingredient_product_id, quantity_ordered, quantity_received, unit, unit_price_snapshot) values
  ('6a000000-0000-0000-0000-000000000ea1', '6a000000-0000-0000-0000-0000000009a1', '6a000000-0000-0000-0000-0000000001a1', 10, 0, 'kg', 1.00);

create or replace function pg_temp.act_as(p_uid uuid) returns void language plpgsql as $$
begin
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid::text, 'role', 'authenticated')::text, true);
end; $$;

create or replace function pg_temp.expect_error(p_sql text, p_state text, p_label text) returns void
language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if sqlstate = p_state then return; end if;
    raise exception '[%] atteso SQLSTATE %, ottenuto % (%)', p_label, p_state, sqlstate, sqlerrm;
  end;
  raise exception '[%] lo statement doveva fallire con % ma è passato', p_label, p_state;
end; $$;

-- ═══════════════ A) ricevimento cross-org → ordine di un'altra org ═══════════
-- A1: B non può nemmeno CREARE un ricevimento che punta al PO di A (FK composita).
select pg_temp.act_as('6b000000-0000-0000-0000-0000000000b1');
select pg_temp.expect_error(
  $q$insert into purchase_receipts (id, organization_id, mode, purchase_order_id, status, created_by)
     values ('6b000000-0000-0000-0000-0000000008b1', '6b000000-0000-0000-0000-00000000000b', 'bakery',
             '6a000000-0000-0000-0000-0000000009a1', 'expected', '6b000000-0000-0000-0000-0000000000b1')$q$,
  '23503', 'W2-A1 ricevimento B → ordine A (FK composita)');

-- A2: difesa in profondità per i dati STORICI (FK NOT VALID non li copre):
-- simuliamo una riga legacy incoerente togliendo il vincolo SOLO in questa
-- transazione, poi B prova a completarla → la RPC rifiuta con P0045 e l'ordine
-- di A resta intatto.
reset role;
alter table purchase_receipts drop constraint purchase_receipts_order_same_org;
insert into purchase_receipts (id, organization_id, mode, purchase_order_id, status, created_by)
values ('6b000000-0000-0000-0000-0000000008b2', '6b000000-0000-0000-0000-00000000000b', 'bakery',
        '6a000000-0000-0000-0000-0000000009a1', 'expected', '6b000000-0000-0000-0000-0000000000b1');
insert into purchase_receipt_lines (receipt_id, product_id, raw_product_name, qty_expected, qty_received, qty_posted, unit, line_status, sort_order)
values ('6b000000-0000-0000-0000-0000000008b2', '6b000000-0000-0000-0000-0000000001b1', 'Farina B', 10, 10, 0, 'kg', 'matched', 0);

select pg_temp.act_as('6b000000-0000-0000-0000-0000000000b1');
select pg_temp.expect_error(
  $q$select public.complete_purchase_receipt('6b000000-0000-0000-0000-0000000008b2')$q$,
  'P0045', 'W2-A2 complete su ordine di altra org');

reset role;
do $$ declare v_status text; v_recv numeric; begin
  select status::text into v_status from purchase_orders where id = '6a000000-0000-0000-0000-0000000009a1';
  select quantity_received into v_recv from order_line_items where id = '6a000000-0000-0000-0000-000000000ea1';
  assert v_status = 'confirmed', 'W2-A2: l''ordine di A non doveva cambiare stato, ora ' || v_status;
  assert v_recv = 0, 'W2-A2: le righe di A non dovevano avanzare, quantity_received=' || v_recv;
end $$;

-- A3: riga di ricevimento con prodotto di un'altra org → rifiutata (trigger 059)
select pg_temp.act_as('6a000000-0000-0000-0000-0000000000a1');
insert into purchase_receipts (id, organization_id, mode, purchase_order_id, supplier_id, status, created_by)
values ('6a000000-0000-0000-0000-0000000008a1', '6a000000-0000-0000-0000-00000000000a', 'bakery',
        '6a000000-0000-0000-0000-0000000009a1', '6a000000-0000-0000-0000-0000000005a1', 'expected',
        '6a000000-0000-0000-0000-0000000000a1');
select pg_temp.expect_error(
  $q$insert into purchase_receipt_lines (receipt_id, product_id, raw_product_name, qty_expected, qty_received, qty_posted, unit, line_status, sort_order)
     values ('6a000000-0000-0000-0000-0000000008a1', '6b000000-0000-0000-0000-0000000001b1', 'Farina B', 1, 1, 0, 'kg', 'matched', 0)$q$,
  'P0045', 'W2-A3 riga con prodotto di altra org');

-- A4: il caso legittimo continua a funzionare (stesso tenant): 4 kg su 10
insert into purchase_receipt_lines (receipt_id, product_id, raw_product_name, qty_expected, qty_received, qty_posted, unit, line_status, sort_order)
values ('6a000000-0000-0000-0000-0000000008a1', '6a000000-0000-0000-0000-0000000001a1', 'Farina A', 10, 4, 0, 'kg', 'matched', 0);
select public.complete_purchase_receipt('6a000000-0000-0000-0000-0000000008a1');
do $$ declare v_lvl numeric; v_status text; begin
  select current_quantity into v_lvl from inventory_levels where ingredient_product_id = '6a000000-0000-0000-0000-0000000001a1';
  select status::text into v_status from purchase_orders where id = '6a000000-0000-0000-0000-0000000009a1';
  assert v_lvl = 4000, 'W2-A4: 4 kg → 4000 g a magazzino, trovato ' || v_lvl;
  assert v_status = 'partial', 'W2-A4: ordine A atteso partial, trovato ' || v_status;
end $$;

-- ═══════════════ B) nessuna scrittura diretta su ledger e proiezioni ═════════
select pg_temp.expect_error(
  $q$insert into inventory_movements (organization_id, ingredient_product_id, movement_type, quantity_delta, unit, notes)
     values ('6a000000-0000-0000-0000-00000000000a', '6a000000-0000-0000-0000-0000000001a1', 'manual_adjustment', 5, 'g', 'forzato')$q$,
  '42501', 'W2-B1 insert diretto inventory_movements');
select pg_temp.expect_error(
  $q$delete from inventory_movements where organization_id = '6a000000-0000-0000-0000-00000000000a'$q$,
  '42501', 'W2-B2 delete inventory_movements');
select pg_temp.expect_error(
  $q$update inventory_movements set quantity_delta = 1 where organization_id = '6a000000-0000-0000-0000-00000000000a'$q$,
  '42501', 'W2-B3 update inventory_movements');
select pg_temp.expect_error(
  $q$update inventory_levels set current_quantity = 1 where organization_id = '6a000000-0000-0000-0000-00000000000a'$q$,
  '42501', 'W2-B4 update giacenza');
select pg_temp.expect_error(
  $q$insert into finished_goods_movements (organization_id, recipe_id, movement_type, quantity_delta)
     values ('6a000000-0000-0000-0000-00000000000a', '6a000000-0000-0000-0000-0000000007a1', 'manual_adjustment', 5)$q$,
  '42501', 'W2-B5 insert diretto finished_goods_movements');
select pg_temp.expect_error(
  $q$update finished_goods_levels set current_quantity = 99 where organization_id = '6a000000-0000-0000-0000-00000000000a'$q$,
  '42501', 'W2-B6 update finished_goods_levels');
-- la soglia resta scrivibile (uso reale di modules/inventory)
update inventory_levels set min_threshold = 500 where ingredient_product_id = '6a000000-0000-0000-0000-0000000001a1';

-- ═══════════════ C) RPC dei movimenti manuali ════════════════════════════════
-- C1: rettifica in kg su prodotto in g → convertita (+1 kg = +1000 g)
select public.record_inventory_movement('6a000000-0000-0000-0000-0000000001a1', 'manual_adjustment', 1, 'kg', 'conteggio');
do $$ declare v numeric; begin
  select current_quantity into v from inventory_levels where ingredient_product_id = '6a000000-0000-0000-0000-0000000001a1';
  assert v = 5000, 'W2-C1: 4000 g + 1 kg = 5000 g, trovato ' || v;
end $$;
-- C2: scarto oltre la giacenza → P0052, nessun movimento
select pg_temp.expect_error(
  $q$select public.record_inventory_movement('6a000000-0000-0000-0000-0000000001a1', 'waste', -9, 'kg', 'troppo')$q$,
  'P0052', 'W2-C2 scarto oltre giacenza');
-- C3: tipi di dominio non si registrano a mano
select pg_temp.expect_error(
  $q$select public.record_inventory_movement('6a000000-0000-0000-0000-0000000001a1', 'production_usage', -1, 'g', 'x')$q$,
  'P0051', 'W2-C3 production_usage a mano');
-- C4: ingrediente di un'altra org
select pg_temp.expect_error(
  $q$select public.record_inventory_movement('6b000000-0000-0000-0000-0000000001b1', 'manual_adjustment', 1, 'kg', 'x')$q$,
  'P0045', 'W2-C4 ingrediente di altra org');
-- C5: unità incompatibile
select pg_temp.expect_error(
  $q$select public.record_inventory_movement('6a000000-0000-0000-0000-0000000001a1', 'manual_adjustment', 1, 'pz', 'x')$q$,
  'P0212', 'W2-C5 unità incompatibile');
-- C6: invenduto su ricetta di un'altra org
select pg_temp.expect_error(
  $q$select public.record_finished_goods_waste('6b000000-0000-0000-0000-0000000007b1', 1, 'x')$q$,
  'P0045', 'W2-C6 invenduto su ricetta di altra org');

-- C7: il viewer è sola lettura su entrambe le RPC
select pg_temp.act_as('6a000000-0000-0000-0000-0000000000a9');
select pg_temp.expect_error(
  $q$select public.record_inventory_movement('6a000000-0000-0000-0000-0000000001a1', 'manual_adjustment', 1, 'g', 'x')$q$,
  'P0050', 'W2-C7a viewer rettifica');
select pg_temp.expect_error(
  $q$select public.record_finished_goods_waste('6a000000-0000-0000-0000-0000000007a1', 1, 'x')$q$,
  'P0050', 'W2-C7b viewer invenduto');

reset role;
do $$ begin raise notice 'tenant_ledger_guards: OK'; end $$;
rollback;
