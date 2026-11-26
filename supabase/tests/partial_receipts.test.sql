-- =============================================================================
-- partial_receipts.test.sql — regressione W4 (migration 061, ADR 002).
--   1) apertura sessione: find-or-create → stessa sessione, righe collegate al residuo;
--   2) stesso prodotto su più righe d'ordine → avanza SOLO la riga ricevuta;
--   3) eccedenza oltre il residuo → P0046, nessun movimento, ordine invariato;
--   4) parziale + completamento = somma esatta a magazzino, ordine received;
--   5) riga non collegata senza residuo → P0046; merce non ordinata → entra a
--      magazzino senza avanzare l'ordine.
-- (La concorrenza tra sessioni è in tests/concurrency/receipts_concurrency.sh.)
-- Transazione + ROLLBACK.
-- =============================================================================
begin;

insert into auth.users (instance_id, id, aud, role, email) values
  ('00000000-0000-0000-0000-000000000000', '8a000000-0000-0000-0000-0000000000a1', 'authenticated', 'authenticated', 'w4@test.local');
insert into organizations (id, name, slug, account_type) values
  ('8a000000-0000-0000-0000-00000000000a', 'W4 Org', 'w4-org', 'customer');
insert into org_members (organization_id, user_id, role) values
  ('8a000000-0000-0000-0000-00000000000a', '8a000000-0000-0000-0000-0000000000a1', 'owner');
insert into suppliers (id, organization_id, name, email) values
  ('8a000000-0000-0000-0000-0000000005a1', '8a000000-0000-0000-0000-00000000000a', 'Sup W4', 'w4s@test.local');
insert into ingredient_products (id, organization_id, supplier_id, name, unit) values
  ('8a000000-0000-0000-0000-0000000001a1', '8a000000-0000-0000-0000-00000000000a', '8a000000-0000-0000-0000-0000000005a1', 'Burro W4', 'kg'),
  ('8a000000-0000-0000-0000-0000000001a2', '8a000000-0000-0000-0000-00000000000a', '8a000000-0000-0000-0000-0000000005a1', 'Uova W4', 'pz'),
  ('8a000000-0000-0000-0000-0000000001a3', '8a000000-0000-0000-0000-00000000000a', '8a000000-0000-0000-0000-0000000005a1', 'Panna W4', 'l');

-- ordine: Burro su DUE righe (5 kg + 5 kg) + Uova 30 pz
insert into purchase_orders (id, organization_id, supplier_id, status, order_date, sent_at, created_by) values
  ('8a000000-0000-0000-0000-0000000009a1', '8a000000-0000-0000-0000-00000000000a', '8a000000-0000-0000-0000-0000000005a1',
   'confirmed', current_date, now(), '8a000000-0000-0000-0000-0000000000a1');
insert into order_line_items (id, purchase_order_id, ingredient_product_id, quantity_ordered, quantity_received, unit) values
  ('8a000000-0000-0000-0000-000000000e01', '8a000000-0000-0000-0000-0000000009a1', '8a000000-0000-0000-0000-0000000001a1', 5, 0, 'kg'),
  ('8a000000-0000-0000-0000-000000000e02', '8a000000-0000-0000-0000-0000000009a1', '8a000000-0000-0000-0000-0000000001a1', 5, 0, 'kg'),
  ('8a000000-0000-0000-0000-000000000e03', '8a000000-0000-0000-0000-0000000009a1', '8a000000-0000-0000-0000-0000000001a2', 30, 0, 'pz');

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

select pg_temp.act_as('8a000000-0000-0000-0000-0000000000a1');

-- ═══ 1) find-or-create ═══════════════════════════════════════════════════════
create temp table w4 as
select public.open_receipt_for_order('8a000000-0000-0000-0000-0000000009a1') as rid;
do $$ declare r1 uuid; r2 uuid; n int; nlinked int; begin
  select rid into r1 from w4;
  r2 := public.open_receipt_for_order('8a000000-0000-0000-0000-0000000009a1');
  assert r1 = r2, 'W4-1: la seconda apertura deve restituire la STESSA sessione';
  select count(*), count(order_line_item_id) into n, nlinked from purchase_receipt_lines where receipt_id = r1;
  assert n = 3 and nlinked = 3, 'W4-1: 3 righe dal residuo, tutte collegate; trovate ' || n || '/' || nlinked;
end $$;

-- ═══ 2) stesso prodotto su due righe: avanza solo la riga ricevuta ═══════════
update purchase_receipt_lines set qty_received = 3
where receipt_id = (select rid from w4) and order_line_item_id = '8a000000-0000-0000-0000-000000000e01';
select public.complete_purchase_receipt((select rid from w4));
do $$ declare q1 numeric; q2 numeric; v_lvl numeric; v_po text; begin
  select quantity_received into q1 from order_line_items where id = '8a000000-0000-0000-0000-000000000e01';
  select quantity_received into q2 from order_line_items where id = '8a000000-0000-0000-0000-000000000e02';
  select current_quantity into v_lvl from inventory_levels where ingredient_product_id = '8a000000-0000-0000-0000-0000000001a1';
  select status::text into v_po from purchase_orders where id = '8a000000-0000-0000-0000-0000000009a1';
  assert q1 = 3, 'W4-2: la riga ricevuta avanza a 3, trovato ' || q1;
  assert q2 = 0, 'W4-2: l''ALTRA riga dello stesso prodotto NON deve avanzare, trovato ' || q2;
  assert v_lvl = 3, 'W4-2: stock burro 3 kg, trovato ' || v_lvl;
  assert v_po = 'partial', 'W4-2: ordine partial, trovato ' || v_po;
end $$;

-- ═══ 3) eccedenza → P0046, nessuna scrittura ═════════════════════════════════
update purchase_receipt_lines set qty_received = 31
where receipt_id = (select rid from w4) and order_line_item_id = '8a000000-0000-0000-0000-000000000e03';
select pg_temp.expect_error(
  $q$select public.complete_purchase_receipt((select rid from w4))$q$, 'P0046', 'W4-3 eccedenza uova 31/30');
do $$ declare n int; q3 numeric; begin
  select count(*) into n from inventory_movements where ingredient_product_id = '8a000000-0000-0000-0000-0000000001a2';
  select quantity_received into q3 from order_line_items where id = '8a000000-0000-0000-0000-000000000e03';
  assert n = 0, 'W4-3: nessun movimento per l''eccedenza, trovati ' || n;
  assert q3 = 0, 'W4-3: riga uova invariata, trovato ' || q3;
end $$;

-- ═══ 4) completamento: somma esatta, ordine received ════════════════════════
update purchase_receipt_lines set qty_received = 30
where receipt_id = (select rid from w4) and order_line_item_id = '8a000000-0000-0000-0000-000000000e03';
update purchase_receipt_lines set qty_received = 5
where receipt_id = (select rid from w4) and order_line_item_id in ('8a000000-0000-0000-0000-000000000e01', '8a000000-0000-0000-0000-000000000e02');
select public.complete_purchase_receipt((select rid from w4));
do $$ declare v_burro numeric; v_uova numeric; v_po text; v_sum numeric; begin
  select current_quantity into v_burro from inventory_levels where ingredient_product_id = '8a000000-0000-0000-0000-0000000001a1';
  select current_quantity into v_uova  from inventory_levels where ingredient_product_id = '8a000000-0000-0000-0000-0000000001a2';
  select status::text into v_po from purchase_orders where id = '8a000000-0000-0000-0000-0000000009a1';
  select sum(quantity_delta) into v_sum from inventory_movements
  where reference_id = (select rid from w4) and ingredient_product_id = '8a000000-0000-0000-0000-0000000001a1';
  assert v_burro = 10, 'W4-4: burro 3 (parziale) + 7 = 10 kg, trovato ' || v_burro;
  assert v_sum = 10,   'W4-4: somma dei movimenti burro = 10, trovato ' || v_sum;
  assert v_uova = 30,  'W4-4: uova 30, trovato ' || v_uova;
  assert v_po = 'received', 'W4-4: ordine received, trovato ' || v_po;
end $$;

-- ═══ 5) righe fuori ordine (sessione nuova su un secondo ordine) ═════════════
reset role;
insert into purchase_orders (id, organization_id, supplier_id, status, order_date, sent_at, created_by) values
  ('8a000000-0000-0000-0000-0000000009a2', '8a000000-0000-0000-0000-00000000000a', '8a000000-0000-0000-0000-0000000005a1',
   'confirmed', current_date, now(), '8a000000-0000-0000-0000-0000000000a1');
insert into order_line_items (id, purchase_order_id, ingredient_product_id, quantity_ordered, quantity_received, unit) values
  ('8a000000-0000-0000-0000-000000000e04', '8a000000-0000-0000-0000-0000000009a2', '8a000000-0000-0000-0000-0000000001a1', 2, 0, 'kg');
select pg_temp.act_as('8a000000-0000-0000-0000-0000000000a1');
create temp table w4b as
select public.open_receipt_for_order('8a000000-0000-0000-0000-0000000009a2') as rid;

-- 5a) riga NON collegata dello stesso prodotto oltre il residuo (2 + 1 extra) → P0046
update purchase_receipt_lines set qty_received = 2 where receipt_id = (select rid from w4b);
insert into purchase_receipt_lines (receipt_id, product_id, raw_product_name, qty_received, unit, line_status, sort_order)
values ((select rid from w4b), '8a000000-0000-0000-0000-0000000001a1', 'Burro (scansione extra)', 1, 'kg', 'matched', 9);
select pg_temp.expect_error(
  $q$select public.complete_purchase_receipt((select rid from w4b))$q$, 'P0046', 'W4-5a riga non collegata senza residuo');
delete from purchase_receipt_lines where receipt_id = (select rid from w4b) and sort_order = 9;

-- 5b) merce NON ordinata (panna): entra a magazzino, l'ordine avanza solo col burro
insert into purchase_receipt_lines (receipt_id, product_id, raw_product_name, qty_received, unit, line_status, sort_order)
values ((select rid from w4b), '8a000000-0000-0000-0000-0000000001a3', 'Panna', 1, 'l', 'matched', 9);
select public.complete_purchase_receipt((select rid from w4b));
do $$ declare v_panna numeric; v_po text; begin
  select current_quantity into v_panna from inventory_levels where ingredient_product_id = '8a000000-0000-0000-0000-0000000001a3';
  select status::text into v_po from purchase_orders where id = '8a000000-0000-0000-0000-0000000009a2';
  assert v_panna = 1, 'W4-5b: la panna non ordinata entra a magazzino (1 l), trovato ' || v_panna;
  assert v_po = 'received', 'W4-5b: il secondo ordine è evaso dal burro, trovato ' || v_po;
end $$;

reset role;
do $$ begin raise notice 'partial_receipts: OK'; end $$;
rollback;
