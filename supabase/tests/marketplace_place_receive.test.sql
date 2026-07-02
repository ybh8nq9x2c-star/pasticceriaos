-- =============================================================================
-- marketplace_place_receive.test.sql
-- Regression test per i fix P0/P1 della QA review sync ordini (051/052/053):
--   1. place_marketplace_order: atomico (nessun ordine incompleto sopravvive)
--   2. place_marketplace_order: retry con stessa idempotency key = successo,
--      stesso ordine, nessun duplicato
--   3. receive_marketplace_order: conversione unità metriche (kg -> g)
--   4. receive_marketplace_order: unità incompatibile = errore, rollback totale
--   5. receive_marketplace_order: doppia chiamata = stesso PO, nessun doppio
--      movimento
-- Run AFTER migrations 001–053:
--     psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/marketplace_place_receive.test.sql
-- Gira in transazione e fa ROLLBACK: non lascia dati.
-- =============================================================================

begin;

-- ── Fixtures (service role, bypassa RLS) ─────────────────────────────────────
insert into auth.users (instance_id, id, aud, role, email)
values
  ('00000000-0000-0000-0000-000000000000', '44444444-4444-4444-4444-444444444444', 'authenticated', 'authenticated', 'cust@place.local'),
  ('00000000-0000-0000-0000-000000000000', '55555555-5555-5555-5555-555555555555', 'authenticated', 'authenticated', 'supp@place.local');

insert into organizations (id, name, slug, account_type) values
  ('a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1', 'Pasticceria P', 'plc-cust', 'customer'),
  ('c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1c1c1', 'Fornitore F', 'plc-supp', 'supplier');
insert into org_members (organization_id, user_id, role) values
  ('a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1', '44444444-4444-4444-4444-444444444444', 'owner'),
  ('c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1c1c1', '55555555-5555-5555-5555-555555555555', 'owner');

insert into supplier_customer_connections (id, customer_org_id, supplier_org_id, status)
values ('b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b1b1b1', 'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1', 'c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1c1c1', 'active');

-- Catalogo del fornitore: farina venduta in kg, uova a pezzo.
insert into supplier_catalog_items (id, supplier_org_id, name, unit, unit_price, is_active) values
  ('d1d1d1d1-d1d1-d1d1-d1d1-d1d1d1d1d1d1', 'c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1c1c1', 'Farina 00', 'kg', 1.50, true),
  ('d2d2d2d2-d2d2-d2d2-d2d2-d2d2d2d2d2d2', 'c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1c1c1', 'Uova', 'pz', 0.30, true);

-- Magazzino cliente preesistente: farina tenuta in GRAMMI (unità convertibile),
-- uova tenute in KG (unità NON convertibile da 'pz' -> guardia P0212).
insert into ingredient_products (id, organization_id, name, unit) values
  ('e1e1e1e1-e1e1-e1e1-e1e1-e1e1e1e1e1e1', 'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1', 'Farina 00', 'g'),
  ('e2e2e2e2-e2e2-e2e2-e2e2-e2e2e2e2e2e2', 'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1', 'Uova', 'kg');

create or replace function pg_temp.act_as(p_uid uuid) returns void language plpgsql as $$
begin
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid::text, 'role', 'authenticated')::text, true);
end; $$;

-- ── 1+2. place_marketplace_order: atomico e idempotente ─────────────────────
select pg_temp.act_as('44444444-4444-4444-4444-444444444444');

-- happy path: header + righe + submit in una transazione
do $$
declare v_id uuid; v_retry uuid; n int; s text;
begin
  select place_marketplace_order(
    'b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b1b1b1',
    '[{"catalog_item_id":"d1d1d1d1-d1d1-d1d1-d1d1-d1d1d1d1d1d1","quantity":10}]'::jsonb,
    null, 'idem-key-1'
  ) into v_id;

  select status into s from marketplace_orders where id = v_id;
  assert s = 'submitted', 'place must land on submitted, got ' || s;
  select count(*) into n from marketplace_order_lines where order_id = v_id;
  assert n = 1, 'placed order must have its line, saw ' || n;
  select count(*) into n from marketplace_order_status_history where order_id = v_id;
  assert n = 2, 'history must record draft + submitted, saw ' || n;

  -- retry benigno (stessa key) = SUCCESSO con lo stesso ordine, non un errore
  select place_marketplace_order(
    'b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b1b1b1',
    '[{"catalog_item_id":"d1d1d1d1-d1d1-d1d1-d1d1-d1d1d1d1d1d1","quantity":10}]'::jsonb,
    null, 'idem-key-1'
  ) into v_retry;
  assert v_retry = v_id, 'retry with same key must return the SAME order';
  select count(*) into n from marketplace_orders where idempotency_key = 'idem-key-1';
  assert n = 1, 'retry must not duplicate the order, saw ' || n;
end $$;

-- atomicità: una riga invalida (item inesistente) -> NIENTE ordine superstite
do $$
declare v_id uuid; n int; failed boolean := false;
begin
  begin
    select place_marketplace_order(
      'b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b1b1b1',
      '[{"catalog_item_id":"d1d1d1d1-d1d1-d1d1-d1d1-d1d1d1d1d1d1","quantity":5},
        {"catalog_item_id":"00000000-0000-0000-0000-00000000dead","quantity":1}]'::jsonb,
      null, 'idem-key-bad'
    ) into v_id;
  exception when others then
    failed := true;
    assert sqlstate = 'P0305', 'expected P0305 for invalid line, got ' || sqlstate;
  end;
  assert failed, 'place with an invalid line must raise';
  select count(*) into n from marketplace_orders where idempotency_key = 'idem-key-bad';
  assert n = 0, 'NO incomplete order may survive a failed place (P0-1), saw ' || n;
end $$;

-- ── Il fornitore porta l'ordine a delivered ──────────────────────────────────
select pg_temp.act_as('55555555-5555-5555-5555-555555555555');
do $$
declare v_id uuid;
begin
  select id into v_id from marketplace_orders where idempotency_key = 'idem-key-1';
  update marketplace_orders set status = 'accepted'       where id = v_id;
  update marketplace_orders set status = 'in_preparation' where id = v_id;
  update marketplace_orders set status = 'shipped'        where id = v_id;
  update marketplace_orders set status = 'delivered'      where id = v_id;
end $$;

-- ── 3+5. receive: conversione kg -> g e idempotenza ─────────────────────────
select pg_temp.act_as('44444444-4444-4444-4444-444444444444');
do $$
declare v_id uuid; v_po uuid; v_po2 uuid; n int; v_qty numeric; v_unit text; v_level numeric; v_price numeric;
begin
  select id into v_id from marketplace_orders where idempotency_key = 'idem-key-1';
  select receive_marketplace_order(v_id) into v_po;

  -- movimento nell'unità del PRODOTTO (g), quantità convertita: 10 kg -> 10000 g
  select quantity_delta, unit::text into v_qty, v_unit
  from inventory_movements
  where reference_type = 'purchase_order' and reference_id = v_po
    and ingredient_product_id = 'e1e1e1e1-e1e1-e1e1-e1e1-e1e1e1e1e1e1';
  assert v_qty = 10000, 'movement must be converted 10 kg -> 10000 g, got ' || v_qty;
  assert v_unit = 'g', 'movement must use the PRODUCT unit (g), got ' || v_unit;

  -- proiezione livelli coerente (trigger, nessuna scrittura diretta)
  select current_quantity into v_level from inventory_levels
  where ingredient_product_id = 'e1e1e1e1-e1e1-e1e1-e1e1-e1e1e1e1e1e1';
  assert v_level = 10000, 'level projection must be 10000 g, got ' || v_level;

  -- prezzo cache riportato all'unità prodotto: 1.50 €/kg -> 0.0015 €/g
  select unit_price into v_price from ingredient_products
  where id = 'e1e1e1e1-e1e1-e1e1-e1e1-e1e1e1e1e1e1';
  assert v_price = 0.0015, 'price cache must be per product unit, got ' || v_price;

  -- doppia ricezione = stesso PO, nessun doppio movimento
  select receive_marketplace_order(v_id) into v_po2;
  assert v_po2 = v_po, 'double receive must return the same purchase order';
  select count(*) into n from inventory_movements
  where reference_type = 'purchase_order' and reference_id = v_po;
  assert n = 1, 'double receive must NOT duplicate movements, saw ' || n;
end $$;

-- ── 4. receive: unità incompatibile ('pz' -> 'kg') = errore + rollback ───────
-- Secondo ordine con le uova (catalogo in 'pz', magazzino in 'kg').
do $$
declare v_id uuid; n int; failed boolean := false;
begin
  select place_marketplace_order(
    'b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b1b1b1',
    '[{"catalog_item_id":"d2d2d2d2-d2d2-d2d2-d2d2-d2d2d2d2d2d2","quantity":30}]'::jsonb,
    null, 'idem-key-2'
  ) into v_id;
end $$;

select pg_temp.act_as('55555555-5555-5555-5555-555555555555');
do $$
declare v_id uuid;
begin
  select id into v_id from marketplace_orders where idempotency_key = 'idem-key-2';
  update marketplace_orders set status = 'accepted'       where id = v_id;
  update marketplace_orders set status = 'in_preparation' where id = v_id;
  update marketplace_orders set status = 'shipped'        where id = v_id;
  update marketplace_orders set status = 'delivered'      where id = v_id;
end $$;

select pg_temp.act_as('44444444-4444-4444-4444-444444444444');
do $$
declare v_id uuid; n int; failed boolean := false;
begin
  select id into v_id from marketplace_orders where idempotency_key = 'idem-key-2';
  begin
    perform receive_marketplace_order(v_id);
  exception when others then
    failed := true;
    assert sqlstate = 'P0212', 'expected P0212 for incompatible unit, got ' || sqlstate;
  end;
  assert failed, 'receive with incompatible unit must raise (no silent fallback)';

  -- rollback totale: nessun PO specchio, nessun movimento sulle uova
  select count(*) into n from purchase_orders where marketplace_order_id = v_id;
  assert n = 0, 'failed receive must leave NO mirror purchase order, saw ' || n;
  select count(*) into n from inventory_movements
  where ingredient_product_id = 'e2e2e2e2-e2e2-e2e2-e2e2-e2e2e2e2e2e2';
  assert n = 0, 'failed receive must leave NO stock movement, saw ' || n;
end $$;

reset role;
select 'ALL PLACE/RECEIVE ASSERTIONS PASSED' as result;

rollback;
