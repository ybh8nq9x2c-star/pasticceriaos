-- =============================================================================
-- receipt_unit_guard.test.sql
-- Regression test per 054 (guardia unità in complete_purchase_receipt):
--   1. conversione compatibile: riga 25 kg su prodotto in g → +25000 g (non 25 g)
--   2. nessuna mutazione silenziosa: riga stessa-unità → qty invariata
--   3. path "ricevuto tutto"/complete: qty_received=qty_expected poi complete →
--      convertito correttamente; secondo complete = idempotente (0 nuovi movimenti)
--   4. unità incompatibile (pz su prodotto kg) → errore P0212, rollback totale
-- Run AFTER migrations 001–054:
--     psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/receipt_unit_guard.test.sql
-- Gira in transazione e fa ROLLBACK: non lascia dati.
-- =============================================================================

begin;

-- ── Fixtures (service role, bypassa RLS) ─────────────────────────────────────
insert into auth.users (instance_id, id, aud, role, email)
values ('00000000-0000-0000-0000-000000000000', '66666666-6666-6666-6666-666666666666', 'authenticated', 'authenticated', 'op@unit.local');

insert into organizations (id, name, slug) values
  ('f1f1f1f1-f1f1-f1f1-f1f1-f1f1f1f1f1f1', 'Unit Guard Org', 'unit-guard');
insert into org_members (organization_id, user_id, role) values
  ('f1f1f1f1-f1f1-f1f1-f1f1-f1f1f1f1f1f1', '66666666-6666-6666-6666-666666666666', 'owner');

-- Prodotti: farina in GRAMMI, uova in PZ, latte in KG (per il caso incompatibile).
insert into ingredient_products (id, organization_id, name, unit) values
  ('a2a2a2a2-a2a2-a2a2-a2a2-a2a2a2a2a2a2', 'f1f1f1f1-f1f1-f1f1-f1f1-f1f1f1f1f1f1', 'Farina Guard', 'g'),
  ('b2b2b2b2-b2b2-b2b2-b2b2-b2b2b2b2b2b2', 'f1f1f1f1-f1f1-f1f1-f1f1-f1f1f1f1f1f1', 'Uova Guard', 'pz'),
  ('c2c2c2c2-c2c2-c2c2-c2c2-c2c2c2c2c2c2', 'f1f1f1f1-f1f1-f1f1-f1f1-f1f1f1f1f1f1', 'Latte Guard', 'kg');

create or replace function pg_temp.act_as(p_uid uuid) returns void language plpgsql as $$
begin
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid::text, 'role', 'authenticated')::text, true);
end; $$;

-- ── Receipt 1: conversione compatibile + stessa unità ────────────────────────
insert into purchase_receipts (id, organization_id, mode, status, created_by)
values ('e3e3e3e3-e3e3-e3e3-e3e3-e3e3e3e3e3e3', 'f1f1f1f1-f1f1-f1f1-f1f1-f1f1f1f1f1f1', 'bakery', 'draft', '66666666-6666-6666-6666-666666666666');

insert into purchase_receipt_lines (id, receipt_id, product_id, raw_product_name, qty_received, qty_posted, unit, line_status, lot_number, expiry_date, sort_order) values
  -- caso audit: 25 kg ricevuti, prodotto censito in grammi
  ('11113333-3333-3333-3333-333333333301', 'e3e3e3e3-e3e3-e3e3-e3e3-e3e3e3e3e3e3', 'a2a2a2a2-a2a2-a2a2-a2a2-a2a2a2a2a2a2', 'Farina 25kg', 25, 0, 'kg', 'matched', 'L-25', current_date + 30, 0),
  -- stessa unità: 3 pz → 3 pz, nessuna mutazione
  ('11113333-3333-3333-3333-333333333302', 'e3e3e3e3-e3e3-e3e3-e3e3-e3e3e3e3e3e3', 'b2b2b2b2-b2b2-b2b2-b2b2-b2b2b2b2b2b2', 'Uova x3', 3, 0, 'pz', 'matched', null, null, 1);

select pg_temp.act_as('66666666-6666-6666-6666-666666666666');
do $$
declare v_status receipt_status; v_qty numeric; v_unit text; v_lvl numeric; v_batch numeric; v_note text; n int;
begin
  select complete_purchase_receipt('e3e3e3e3-e3e3-e3e3-e3e3-e3e3e3e3e3e3') into v_status;
  assert v_status = 'completed', 'receipt must complete, got ' || v_status;

  -- 1) 25 kg → 25000 g nell'unità del PRODOTTO
  select quantity_delta, unit::text, notes into v_qty, v_unit, v_note
  from inventory_movements
  where reference_type = 'purchase_receipt' and reference_id = 'e3e3e3e3-e3e3-e3e3-e3e3-e3e3e3e3e3e3'
    and ingredient_product_id = 'a2a2a2a2-a2a2-a2a2-a2a2-a2a2a2a2a2a2';
  assert v_qty = 25000, '25 kg must post as 25000 g, got ' || v_qty;
  assert v_unit = 'g', 'movement must use PRODUCT unit g, got ' || v_unit;
  -- (numeric(12,4) si formatta '25.0000': pattern tollerante sui decimali)
  assert v_note like '%convertito da 25%kg%', 'movement note must declare the conversion, got ' || v_note;

  select current_quantity into v_lvl from inventory_levels
  where ingredient_product_id = 'a2a2a2a2-a2a2-a2a2-a2a2-a2a2a2a2a2a2';
  assert v_lvl = 25000, 'level projection must be 25000 g, got ' || v_lvl;

  -- lotto nell'unità del prodotto
  select quantity_remaining into v_batch from ingredient_batches
  where receipt_line_id = '11113333-3333-3333-3333-333333333301';
  assert v_batch = 25000, 'batch must be 25000 g, got ' || v_batch;

  -- 2) stessa unità: 3 pz invariati (identità, nessuna mutazione silenziosa)
  select quantity_delta, unit::text into v_qty, v_unit
  from inventory_movements
  where reference_type = 'purchase_receipt' and reference_id = 'e3e3e3e3-e3e3-e3e3-e3e3-e3e3e3e3e3e3'
    and ingredient_product_id = 'b2b2b2b2-b2b2-b2b2-b2b2-b2b2b2b2b2b2';
  assert v_qty = 3 and v_unit = 'pz', 'same-unit line must stay 3 pz, got ' || v_qty || ' ' || v_unit;

  -- bookkeeping della riga resta nella SUA unità (25 kg, non 25000)
  select qty_posted into v_qty from purchase_receipt_lines where id = '11113333-3333-3333-3333-333333333301';
  assert v_qty = 25, 'line qty_posted stays in LINE unit (25 kg), got ' || v_qty;

  -- 3b) secondo complete = idempotente: la RPC non ha delta da postare
  begin
    perform complete_purchase_receipt('e3e3e3e3-e3e3-e3e3-e3e3-e3e3e3e3e3e3');
  exception when others then null; -- già completed: l'errore P0040 è accettabile
  end;
  select count(*) into n from inventory_movements
  where reference_type = 'purchase_receipt' and reference_id = 'e3e3e3e3-e3e3-e3e3-e3e3-e3e3e3e3e3e3';
  assert n = 2, 'no duplicate movements on re-complete, got ' || n;
end $$;

-- ── Receipt 2: path "ricevuto tutto" (qty_received = qty_expected) ───────────
reset role;
insert into purchase_receipts (id, organization_id, mode, status, created_by)
values ('e4e4e4e4-e4e4-e4e4-e4e4-e4e4e4e4e4e4', 'f1f1f1f1-f1f1-f1f1-f1f1-f1f1f1f1f1f1', 'bakery', 'expected', '66666666-6666-6666-6666-666666666666');
insert into purchase_receipt_lines (id, receipt_id, product_id, raw_product_name, qty_expected, qty_received, qty_posted, unit, line_status, sort_order)
values ('11114444-4444-4444-4444-444444444401', 'e4e4e4e4-e4e4-e4e4-e4e4-e4e4e4e4e4e4', 'a2a2a2a2-a2a2-a2a2-a2a2-a2a2a2a2a2a2', 'Farina attesa 2kg', 2, 0, 0, 'kg', 'matched', 0);

select pg_temp.act_as('66666666-6666-6666-6666-666666666666');
do $$
declare v_status receipt_status; v_qty numeric; v_lvl numeric;
begin
  -- come receiveAllAndComplete: riempi al previsto, poi completa (stessa unità riga)
  update purchase_receipt_lines set qty_received = qty_expected, line_status = 'received'
  where id = '11114444-4444-4444-4444-444444444401';

  select complete_purchase_receipt('e4e4e4e4-e4e4-e4e4-e4e4-e4e4e4e4e4e4') into v_status;
  assert v_status = 'completed', 'receive-all receipt must complete, got ' || v_status;

  select quantity_delta into v_qty from inventory_movements
  where reference_type = 'purchase_receipt' and reference_id = 'e4e4e4e4-e4e4-e4e4-e4e4-e4e4e4e4e4e4';
  assert v_qty = 2000, 'receive-all 2 kg must post 2000 g, got ' || v_qty;

  select current_quantity into v_lvl from inventory_levels
  where ingredient_product_id = 'a2a2a2a2-a2a2-a2a2-a2a2-a2a2a2a2a2a2';
  assert v_lvl = 27000, 'level must accumulate 25000 + 2000 = 27000 g, got ' || v_lvl;
end $$;

-- ── Receipt 3: unità incompatibile (pz su prodotto in kg) → P0212 + rollback ─
reset role;
insert into purchase_receipts (id, organization_id, mode, status, created_by)
values ('e5e5e5e5-e5e5-e5e5-e5e5-e5e5e5e5e5e5', 'f1f1f1f1-f1f1-f1f1-f1f1-f1f1f1f1f1f1', 'bakery', 'draft', '66666666-6666-6666-6666-666666666666');
insert into purchase_receipt_lines (id, receipt_id, product_id, raw_product_name, qty_received, qty_posted, unit, line_status, sort_order)
values ('11115555-5555-5555-5555-555555555501', 'e5e5e5e5-e5e5-e5e5-e5e5-e5e5e5e5e5e5', 'c2c2c2c2-c2c2-c2c2-c2c2-c2c2c2c2c2c2', 'Latte 6 cartoni', 6, 0, 'pz', 'matched', 0);

select pg_temp.act_as('66666666-6666-6666-6666-666666666666');
do $$
declare failed boolean := false; n int; v_status text;
begin
  begin
    perform complete_purchase_receipt('e5e5e5e5-e5e5-e5e5-e5e5-e5e5e5e5e5e5');
  exception when others then
    failed := true;
    assert sqlstate = 'P0212', 'expected P0212 for incompatible unit, got ' || sqlstate;
  end;
  assert failed, 'incompatible unit must raise (no silent fallback)';

  -- rollback totale: nessun movimento, nessun lotto, riga non contabilizzata
  select count(*) into n from inventory_movements
  where reference_type = 'purchase_receipt' and reference_id = 'e5e5e5e5-e5e5-e5e5-e5e5-e5e5e5e5e5e5';
  assert n = 0, 'failed complete must leave NO movements, got ' || n;
  select count(*) into n from inventory_movements
  where ingredient_product_id = 'c2c2c2c2-c2c2-c2c2-c2c2-c2c2c2c2c2c2';
  assert n = 0, 'no stock on the kg product, got ' || n;
  select qty_posted::int into n from purchase_receipt_lines where id = '11115555-5555-5555-5555-555555555501';
  assert n = 0, 'line must stay unposted, got ' || n;
  select status::text into v_status from purchase_receipts where id = 'e5e5e5e5-e5e5-e5e5-e5e5-e5e5e5e5e5e5';
  assert v_status = 'draft', 'receipt must stay draft after failed complete, got ' || v_status;
end $$;

reset role;
select 'ALL RECEIPT UNIT GUARD ASSERTIONS PASSED' as result;

rollback;
