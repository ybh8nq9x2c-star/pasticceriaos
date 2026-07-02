-- =============================================================================
-- marketplace_rls.test.sql
-- Critical-path RLS / tenant-isolation test for the marketplace.
-- Run AFTER migrations 012–016 are applied:
--     psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/marketplace_rls.test.sql
-- Runs in a transaction and ROLLS BACK — it leaves no data behind.
-- Each assertion RAISEs on failure (ON_ERROR_STOP makes the run fail).
-- =============================================================================

begin;

-- Fixtures (created as the migration/service role, which bypasses RLS).
-- 3 users: customerA, customerB, supplierS
insert into auth.users (instance_id, id, aud, role, email)
values
  ('00000000-0000-0000-0000-000000000000', '11111111-1111-1111-1111-111111111111', 'authenticated', 'authenticated', 'custA@test.local'),
  ('00000000-0000-0000-0000-000000000000', '22222222-2222-2222-2222-222222222222', 'authenticated', 'authenticated', 'custB@test.local'),
  ('00000000-0000-0000-0000-000000000000', '33333333-3333-3333-3333-333333333333', 'authenticated', 'authenticated', 'suppS@test.local');

-- 3 orgs + memberships
insert into organizations (id, name, slug, account_type) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Customer A', 'rls-cust-a', 'customer'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Customer B', 'rls-cust-b', 'customer'),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'Supplier S', 'rls-supp-s', 'supplier');
insert into org_members (organization_id, user_id, role) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'owner'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '22222222-2222-2222-2222-222222222222', 'owner'),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', '33333333-3333-3333-3333-333333333333', 'owner');

-- Supplier S issues a key (hash of 'PSOS-TEST-TEST-TEST').
insert into supplier_connection_keys (id, supplier_org_id, key_prefix, key_hash, is_active)
values ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'PSOS-TEST',
        encode(digest('PSOS-TEST-TEST-TEST', 'sha256'), 'hex'), true);

-- helper to "log in" as a user inside this session
create or replace function pg_temp.act_as(p_uid uuid) returns void language plpgsql as $$
begin
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid::text, 'role', 'authenticated')::text, true);
end; $$;

-- ── Customer A connects to Supplier S via the key (uses the SECURITY DEFINER RPC)
select pg_temp.act_as('11111111-1111-1111-1111-111111111111');
select connect_supplier_by_key_hash(encode(digest('PSOS-TEST-TEST-TEST', 'sha256'), 'hex'));

do $$
declare n int;
begin
  -- A sees exactly one connected supplier
  select count(*) into n from supplier_customer_connections where status='active';
  assert n = 1, 'A should see 1 connection, saw ' || n;
end $$;

-- duplicate connection prevention: connecting again is an idempotent upsert
select connect_supplier_by_key_hash(encode(digest('PSOS-TEST-TEST-TEST', 'sha256'), 'hex'));
do $$
declare n int;
begin
  select count(*) into n from supplier_customer_connections
  where customer_org_id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' and supplier_org_id='cccccccc-cccc-cccc-cccc-cccccccccccc';
  -- bypass RLS view via the policy: A only sees its own; still must be exactly 1 row
  assert n = 1, 'duplicate connect must upsert to 1 row, found ' || n;
end $$;

-- A places an order to S
reset role;  -- insert order + line as service role to seed deterministically
insert into marketplace_orders (id, customer_org_id, supplier_org_id, connection_id, status)
select 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'cccccccc-cccc-cccc-cccc-cccccccccccc', id, 'submitted'
from supplier_customer_connections
where customer_org_id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
insert into marketplace_order_lines (order_id, name_snapshot, unit, quantity)
values ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'Farina', 'kg', 10);

-- ── Assertions: visibility ───────────────────────────────────────────────────
-- Customer A sees its order
select pg_temp.act_as('11111111-1111-1111-1111-111111111111');
do $$ declare n int; begin
  select count(*) into n from marketplace_orders;
  assert n = 1, 'Customer A must see its 1 order, saw ' || n;
end $$;

-- Customer B (a DIFFERENT customer) sees nothing
select pg_temp.act_as('22222222-2222-2222-2222-222222222222');
do $$ declare n int; begin
  select count(*) into n from marketplace_orders;
  assert n = 0, 'Customer B must NOT see A''s order, saw ' || n;
  select count(*) into n from supplier_customer_connections;
  assert n = 0, 'Customer B must NOT see A''s connection, saw ' || n;
end $$;

-- Supplier S sees the incoming order (seller side)
select pg_temp.act_as('33333333-3333-3333-3333-333333333333');
do $$ declare n int; begin
  select count(*) into n from marketplace_orders;
  assert n = 1, 'Supplier S must see the incoming order, saw ' || n;
  -- and the canonical lines of that shared order
  select count(*) into n from marketplace_order_lines where order_id='eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
  assert n = 1, 'Supplier S must see the order lines, saw ' || n;
end $$;

-- ── Assertions: cross-workspace write denial ─────────────────────────────────
-- A supplier cannot create a customer-side order (mo_insert requires account_type='customer')
do $$ declare ok boolean := false; begin
  begin
    insert into marketplace_orders (customer_org_id, supplier_org_id, connection_id, status)
    values ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
            'dddddddd-dddd-dddd-dddd-dddddddddddd', 'draft');
  exception when others then ok := true; end;
  assert ok, 'A supplier must NOT be able to insert a customer order';
end $$;

-- Customer cannot perform a supplier-only transition (trigger guard): submitted -> accepted by the customer
select pg_temp.act_as('11111111-1111-1111-1111-111111111111');
do $$ declare ok boolean := false; begin
  begin
    update marketplace_orders set status='accepted' where id='eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
  exception when others then ok := true; end;
  assert ok, 'Customer must NOT be able to accept an order (supplier-only transition)';
end $$;

-- Supplier CAN accept it
select pg_temp.act_as('33333333-3333-3333-3333-333333333333');
update marketplace_orders set status='accepted' where id='eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
do $$ declare s text; n int; begin
  select status into s from marketplace_orders where id='eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
  assert s = 'accepted', 'Supplier accept must succeed, status=' || s;
  -- history row was appended by the trigger
  select count(*) into n from marketplace_order_status_history where order_id='eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee' and to_status='accepted';
  assert n = 1, 'status history must record the accept';
end $$;

-- ── Assertions: draft NON visibile al fornitore (052) ────────────────────────
-- Un draft è un'intenzione d'acquisto non ancora comunicata: la policy
-- mo_select lo espone solo al cliente. Le policy di lines/history passano
-- dall'exists su marketplace_orders, quindi anche le righe spariscono.
reset role;
insert into marketplace_orders (id, customer_org_id, supplier_org_id, connection_id, status)
select 'ffffffff-ffff-ffff-ffff-ffffffffffff', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'cccccccc-cccc-cccc-cccc-cccccccccccc', id, 'draft'
from supplier_customer_connections
where customer_org_id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
insert into marketplace_order_lines (order_id, name_snapshot, unit, quantity)
values ('ffffffff-ffff-ffff-ffff-ffffffffffff', 'Zucchero', 'kg', 5);

-- Supplier S: vede ancora solo l'ordine accettato, MAI il draft né le sue righe
select pg_temp.act_as('33333333-3333-3333-3333-333333333333');
do $$ declare n int; begin
  select count(*) into n from marketplace_orders;
  assert n = 1, 'Supplier S must see only the non-draft order, saw ' || n;
  select count(*) into n from marketplace_orders where status = 'draft';
  assert n = 0, 'Supplier S must NOT see customer drafts, saw ' || n;
  select count(*) into n from marketplace_order_lines where order_id='ffffffff-ffff-ffff-ffff-ffffffffffff';
  assert n = 0, 'Supplier S must NOT see draft lines, saw ' || n;
end $$;

-- Customer A: continua a vedere il proprio draft
select pg_temp.act_as('11111111-1111-1111-1111-111111111111');
do $$ declare n int; begin
  select count(*) into n from marketplace_orders where status = 'draft';
  assert n = 1, 'Customer A must still see its own draft, saw ' || n;
end $$;

reset role;
select 'ALL MARKETPLACE RLS ASSERTIONS PASSED' as result;

rollback;
