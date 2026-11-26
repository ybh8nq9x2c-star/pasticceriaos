-- =============================================================================
-- marketplace_line_snapshot.test.sql — regressione F-08 (migration 064).
--   1) il cliente che scrive le righe da PostgREST NON decide prezzo/nome/unità:
--      lo snapshot viene ricalcolato dal catalogo del fornitore;
--   2) riga senza prodotto, prodotto di un altro fornitore o disattivato → P0305;
--   3) il percorso canonico place_marketplace_order continua a funzionare.
-- Transazione + ROLLBACK.
-- =============================================================================
begin;

insert into auth.users (instance_id, id, aud, role, email) values
  ('00000000-0000-0000-0000-000000000000', 'f8000000-0000-0000-0000-0000000000c1', 'authenticated', 'authenticated', 'f8-cust@test.local'),
  ('00000000-0000-0000-0000-000000000000', 'f8000000-0000-0000-0000-0000000000e1', 'authenticated', 'authenticated', 'f8-supp@test.local');
insert into organizations (id, name, slug, account_type) values
  ('f8000000-0000-0000-0000-00000000000c', 'F8 Cliente',   'f8-cust',  'customer'),
  ('f8000000-0000-0000-0000-00000000000e', 'F8 Fornitore', 'f8-supp',  'supplier'),
  ('f8000000-0000-0000-0000-00000000000f', 'F8 Altro',     'f8-other', 'supplier');
insert into org_members (organization_id, user_id, role) values
  ('f8000000-0000-0000-0000-00000000000c', 'f8000000-0000-0000-0000-0000000000c1', 'owner'),
  ('f8000000-0000-0000-0000-00000000000e', 'f8000000-0000-0000-0000-0000000000e1', 'owner');

insert into supplier_customer_connections (id, supplier_org_id, customer_org_id, status) values
  ('f8000000-0000-0000-0000-0000000000a1', 'f8000000-0000-0000-0000-00000000000e', 'f8000000-0000-0000-0000-00000000000c', 'active');
insert into supplier_catalog_items (id, supplier_org_id, name, sku, unit, unit_price, is_active) values
  ('f8000000-0000-0000-0000-000000000b01', 'f8000000-0000-0000-0000-00000000000e', 'Burro 82%',  'BU-1', 'kg', 9.50, true),
  ('f8000000-0000-0000-0000-000000000b02', 'f8000000-0000-0000-0000-00000000000e', 'Panna vecchia', 'PA-1', 'l', 4.00, false),
  ('f8000000-0000-0000-0000-000000000b03', 'f8000000-0000-0000-0000-00000000000f', 'Burro altrui', 'X-1', 'kg', 1.00, true);

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

select pg_temp.act_as('f8000000-0000-0000-0000-0000000000c1');

-- ═══ 1) scrittura diretta con prezzo e nome forgiati → snapshot dal catalogo ═══
insert into marketplace_orders (id, customer_org_id, supplier_org_id, connection_id, status)
values ('f8000000-0000-0000-0000-000000000d01', 'f8000000-0000-0000-0000-00000000000c',
        'f8000000-0000-0000-0000-00000000000e', 'f8000000-0000-0000-0000-0000000000a1', 'draft');
insert into marketplace_order_lines (order_id, catalog_item_id, name_snapshot, sku_snapshot, unit, quantity, unit_price_snapshot)
values ('f8000000-0000-0000-0000-000000000d01', 'f8000000-0000-0000-0000-000000000b01',
        'Burro OMAGGIO', 'FAKE', 'g', 10, 0.01);
do $$ declare v record; begin
  select name_snapshot, sku_snapshot, unit::text as unit, unit_price_snapshot, quantity into v
  from marketplace_order_lines where order_id = 'f8000000-0000-0000-0000-000000000d01';
  assert v.unit_price_snapshot = 9.50, 'F-08/1: prezzo dal catalogo (9.50), trovato ' || v.unit_price_snapshot;
  assert v.name_snapshot = 'Burro 82%' and v.sku_snapshot = 'BU-1' and v.unit = 'kg',
    'F-08/1: nome/sku/unità dal catalogo, trovato ' || v.name_snapshot || '/' || v.sku_snapshot || '/' || v.unit;
  assert v.quantity = 10, 'F-08/1: la quantità resta quella scelta dal cliente';
end $$;

-- anche un UPDATE successivo del prezzo viene riallineato al catalogo
update marketplace_order_lines set unit_price_snapshot = 0.01, name_snapshot = 'Sconto'
where order_id = 'f8000000-0000-0000-0000-000000000d01';
do $$ declare v numeric; begin
  select unit_price_snapshot into v from marketplace_order_lines where order_id = 'f8000000-0000-0000-0000-000000000d01';
  assert v = 9.50, 'F-08/1b: update del prezzo riallineato al catalogo, trovato ' || v;
end $$;

-- ═══ 2) righe non valide ════════════════════════════════════════════════════
select pg_temp.expect_error(
  $q$insert into marketplace_order_lines (order_id, name_snapshot, unit, quantity, unit_price_snapshot)
     values ('f8000000-0000-0000-0000-000000000d01', 'Libera', 'kg', 1, 0.01)$q$,
  'P0305', 'F-08/2a riga senza prodotto del catalogo');
select pg_temp.expect_error(
  $q$insert into marketplace_order_lines (order_id, catalog_item_id, name_snapshot, unit, quantity)
     values ('f8000000-0000-0000-0000-000000000d01', 'f8000000-0000-0000-0000-000000000b03', 'x', 'kg', 1)$q$,
  'P0305', 'F-08/2b prodotto di un altro fornitore');
select pg_temp.expect_error(
  $q$insert into marketplace_order_lines (order_id, catalog_item_id, name_snapshot, unit, quantity)
     values ('f8000000-0000-0000-0000-000000000d01', 'f8000000-0000-0000-0000-000000000b02', 'x', 'l', 1)$q$,
  'P0305', 'F-08/2c prodotto disattivato');

-- ═══ 3) percorso canonico invariato ═════════════════════════════════════════
do $$ declare v_id uuid; v_price numeric; v_status text; begin
  v_id := public.place_marketplace_order(
    'f8000000-0000-0000-0000-0000000000a1',
    '[{"catalog_item_id":"f8000000-0000-0000-0000-000000000b01","quantity":3}]'::jsonb,
    null, 'f8-idem-1');
  select unit_price_snapshot into v_price from marketplace_order_lines where order_id = v_id;
  select status::text into v_status from marketplace_orders where id = v_id;
  assert v_price = 9.50, 'F-08/3: place_marketplace_order con prezzo dal catalogo, trovato ' || v_price;
  assert v_status = 'submitted', 'F-08/3: ordine submitted, trovato ' || v_status;
end $$;

reset role;
do $$ begin raise notice 'marketplace_line_snapshot: OK'; end $$;
rollback;
