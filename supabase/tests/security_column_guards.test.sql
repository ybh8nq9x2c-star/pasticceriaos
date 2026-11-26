-- =============================================================================
-- security_column_guards.test.sql
-- Regressione per la migration 058 (SECURITY_REPORT.md F-02, F-03, F-07).
-- Test di NEGAZIONE: verifica che il client (role authenticated via PostgREST)
-- NON possa più riscrivere colonne di identità/stato, e che i write-path
-- canonici (RPC definer, transizioni lecite) continuino a funzionare.
--     psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/security_column_guards.test.sql
-- Gira in una transazione e fa ROLLBACK: non lascia dati.
-- =============================================================================

begin;

-- ── Fixture (ruolo migration: bypassa RLS e guard) ───────────────────────────
insert into auth.users (instance_id, id, aud, role, email) values
  ('00000000-0000-0000-0000-000000000000', '51111111-1111-1111-1111-111111111111', 'authenticated', 'authenticated', 'sec-custA@test.local'),
  ('00000000-0000-0000-0000-000000000000', '52222222-2222-2222-2222-222222222222', 'authenticated', 'authenticated', 'sec-custB@test.local'),
  ('00000000-0000-0000-0000-000000000000', '53333333-3333-3333-3333-333333333333', 'authenticated', 'authenticated', 'sec-suppS@test.local'),
  ('00000000-0000-0000-0000-000000000000', '54444444-4444-4444-4444-444444444444', 'authenticated', 'authenticated', 'sec-suppV@test.local');

insert into organizations (id, name, slug, account_type) values
  ('5aaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Sec Customer A', 'sec-cust-a', 'customer'),
  ('5bbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Sec Customer B', 'sec-cust-b', 'customer'),
  ('5ccccccc-cccc-cccc-cccc-cccccccccccc', 'Sec Supplier S', 'sec-supp-s', 'supplier'),
  ('5ddddddd-dddd-dddd-dddd-dddddddddddd', 'Sec Supplier V', 'sec-supp-v', 'supplier');
insert into org_members (organization_id, user_id, role) values
  ('5aaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '51111111-1111-1111-1111-111111111111', 'owner'),
  ('5bbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '52222222-2222-2222-2222-222222222222', 'owner'),
  ('5ccccccc-cccc-cccc-cccc-cccccccccccc', '53333333-3333-3333-3333-333333333333', 'owner'),
  ('5ddddddd-dddd-dddd-dddd-dddddddddddd', '54444444-4444-4444-4444-444444444444', 'owner');

insert into supplier_connection_keys (supplier_org_id, key_prefix, key_hash, is_active)
values ('5ccccccc-cccc-cccc-cccc-cccccccccccc', 'PSOS-SECT',
        encode(digest('PSOS-SECT-SECT-SECT', 'sha256'), 'hex'), true);

create or replace function pg_temp.act_as(p_uid uuid) returns void language plpgsql as $$
begin
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid::text, 'role', 'authenticated')::text, true);
end; $$;

-- esegue uno statement e pretende che fallisca con il SQLSTATE atteso
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

-- ── A si collega a S con la chiave (RPC definer: write-path canonico) ────────
select pg_temp.act_as('51111111-1111-1111-1111-111111111111');
select connect_supplier_by_key_hash(encode(digest('PSOS-SECT-SECT-SECT', 'sha256'), 'hex'));

-- ═════════════════════════ F-02 · connessioni ═══════════════════════════════
-- S revoca il cliente A: consentito
select pg_temp.act_as('53333333-3333-3333-3333-333333333333');
update supplier_customer_connections set status = 'revoked', revoked_at = now()
 where customer_org_id = '5aaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

-- A prova a riattivarsi da solo: NEGATO
select pg_temp.act_as('51111111-1111-1111-1111-111111111111');
select pg_temp.expect_error(
  $q$update supplier_customer_connections set status = 'active', revoked_at = null
     where customer_org_id = '5aaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'$q$,
  'P0311', 'F-02a riattivazione senza chiave');

-- A prova a ripuntare la connessione sul fornitore V: NEGATO
select pg_temp.expect_error(
  $q$update supplier_customer_connections set supplier_org_id = '5ddddddd-dddd-dddd-dddd-dddddddddddd'
     where customer_org_id = '5aaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'$q$,
  'P0310', 'F-02b ripuntamento su altro fornitore');

-- il catalogo di S resta invisibile ad A (connessione ancora revocata)
do $$ declare n int; begin
  select count(*) into n from supplier_customer_connections where status = 'active';
  assert n = 0, 'F-02: A non deve avere connessioni attive, trovate ' || n;
end $$;

-- con una chiave valida (RPC definer) A si ricollega: write-path canonico OK
select connect_supplier_by_key_hash(encode(digest('PSOS-SECT-SECT-SECT', 'sha256'), 'hex'));
do $$ declare n int; begin
  select count(*) into n from supplier_customer_connections where status = 'active';
  assert n = 1, 'F-02: la riconnessione via chiave deve funzionare, attive ' || n;
end $$;

-- S prova a ripuntare la connessione su un altro cliente (B): NEGATO
select pg_temp.act_as('53333333-3333-3333-3333-333333333333');
select pg_temp.expect_error(
  $q$update supplier_customer_connections set customer_org_id = '5bbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
     where customer_org_id = '5aaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'$q$,
  'P0310', 'F-02c fornitore ripunta su altro cliente');

-- ═════════════════════════ F-03 · ordini marketplace ════════════════════════
reset role;
insert into marketplace_orders (id, customer_org_id, supplier_org_id, connection_id, status)
select '5eeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', '5aaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
       '5ccccccc-cccc-cccc-cccc-cccccccccccc', id, 'submitted'
from supplier_customer_connections
where customer_org_id = '5aaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
  and supplier_org_id = '5ccccccc-cccc-cccc-cccc-cccccccccccc';

-- S prova a spostare l'ordine nel workspace di B: NEGATO
select pg_temp.act_as('53333333-3333-3333-3333-333333333333');
select pg_temp.expect_error(
  $q$update marketplace_orders set customer_org_id = '5bbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
     where id = '5eeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'$q$,
  'P0204', 'F-03a fornitore sposta ordine su altro cliente');

-- A prova a dirottare l'ordine verso V (non collegato): NEGATO
select pg_temp.act_as('51111111-1111-1111-1111-111111111111');
select pg_temp.expect_error(
  $q$update marketplace_orders set supplier_org_id = '5ddddddd-dddd-dddd-dddd-dddddddddddd'
     where id = '5eeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'$q$,
  'P0204', 'F-03b cliente dirotta ordine su altro fornitore');

-- transizione lecita (S accetta) con timestamp forgiato: passa, ma il timestamp
-- lo decide il guard di stato, non il client
select pg_temp.act_as('53333333-3333-3333-3333-333333333333');
update marketplace_orders set status = 'accepted', accepted_at = '2000-01-01T00:00:00Z'
 where id = '5eeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
do $$ declare v_status text; v_at timestamptz; begin
  select status::text, accepted_at into v_status, v_at
  from marketplace_orders where id = '5eeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
  assert v_status = 'accepted', 'F-03: la transizione lecita deve passare, stato ' || v_status;
  assert v_at > '2020-01-01'::timestamptz, 'F-03: accepted_at forgiato dal client: ' || v_at;
end $$;

-- ═════════════════════════ F-07 · ledger / proiezioni ═══════════════════════
reset role;
insert into ingredient_products (id, organization_id, name, unit)
values ('5fffffff-ffff-ffff-ffff-ffffffffffff', '5aaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Farina sec-test', 'kg');
insert into inventory_levels (organization_id, ingredient_product_id, current_quantity, min_threshold, unit)
values ('5aaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '5fffffff-ffff-ffff-ffff-ffffffffffff', 10, 1, 'kg');
insert into sales (id, organization_id, external_sale_id, source, sold_at)
values ('50000000-0000-0000-0000-00000000aaaa', '5aaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'SEC-1', 'manual', now());

select pg_temp.act_as('51111111-1111-1111-1111-111111111111');

-- la soglia resta modificabile dal client (uso reale di modules/inventory)
update inventory_levels set min_threshold = 5
 where ingredient_product_id = '5fffffff-ffff-ffff-ffff-ffffffffffff';
do $$ declare v numeric; begin
  select min_threshold into v from inventory_levels where ingredient_product_id = '5fffffff-ffff-ffff-ffff-ffffffffffff';
  assert v = 5, 'F-07: min_threshold deve restare modificabile, vale ' || v;
end $$;

-- la giacenza NO: si cambia solo con un movimento. Dalla 059 il client non ha
-- nemmeno il privilegio UPDATE sulla colonna (42501) — il trigger 058 (P0213)
-- resta come seconda linea per chi avesse privilegi di tabella.
select pg_temp.expect_error(
  $q$update inventory_levels set current_quantity = 999999
     where ingredient_product_id = '5fffffff-ffff-ffff-ffff-ffffffffffff'$q$,
  '42501', 'F-07a scrittura diretta della giacenza');

-- le vendite non si cancellano dal client (nessuna policy DELETE ⇒ 0 righe)
delete from sales where id = '50000000-0000-0000-0000-00000000aaaa';
do $$ declare n int; begin
  select count(*) into n from sales where id = '50000000-0000-0000-0000-00000000aaaa';
  assert n = 1, 'F-07b: la vendita è stata cancellata dal client';
end $$;

reset role;
do $$ begin raise notice 'security_column_guards: OK'; end $$;
rollback;
