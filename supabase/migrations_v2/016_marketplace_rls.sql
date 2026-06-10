-- =============================================================================
-- 016_marketplace_rls.sql
-- Row Level Security for the marketplace. Hard tenant + account-type +
-- connection scoping. The app uses the user JWT (anon key) so these policies
-- are the real backend boundary; the service layer mirrors them for UX.
--
-- Context helpers (SECURITY DEFINER): current_organization_id(), current_account_type().
-- =============================================================================

-- ── supplier_connection_keys : supplier owns its keys ────────────────────────
alter table public.supplier_connection_keys enable row level security;

drop policy if exists sck_select on public.supplier_connection_keys;
create policy sck_select on public.supplier_connection_keys for select
  using (supplier_org_id = public.current_organization_id()
         and public.current_account_type() = 'supplier');

drop policy if exists sck_insert on public.supplier_connection_keys;
create policy sck_insert on public.supplier_connection_keys for insert
  with check (supplier_org_id = public.current_organization_id()
              and public.current_account_type() = 'supplier');

drop policy if exists sck_update on public.supplier_connection_keys;
create policy sck_update on public.supplier_connection_keys for update
  using (supplier_org_id = public.current_organization_id()
         and public.current_account_type() = 'supplier')
  with check (supplier_org_id = public.current_organization_id());
-- (no DELETE: keys are revoked, not deleted)

-- ── supplier_customer_connections : both parties read; only RPC inserts ──────
alter table public.supplier_customer_connections enable row level security;

drop policy if exists scc_select on public.supplier_customer_connections;
create policy scc_select on public.supplier_customer_connections for select
  using (customer_org_id = public.current_organization_id()
         or supplier_org_id = public.current_organization_id());

-- INSERT is performed exclusively by connect_supplier_by_key_hash() (SECURITY
-- DEFINER) so there is intentionally NO insert policy here.

drop policy if exists scc_update on public.supplier_customer_connections;
create policy scc_update on public.supplier_customer_connections for update
  using (customer_org_id = public.current_organization_id()
         or supplier_org_id = public.current_organization_id())
  with check (customer_org_id = public.current_organization_id()
              or supplier_org_id = public.current_organization_id());
-- (revocation = UPDATE status='revoked'; either party may revoke their link)

-- ── supplier_catalog_items : supplier manages; connected customers read ──────
alter table public.supplier_catalog_items enable row level security;

drop policy if exists sci_select on public.supplier_catalog_items;
create policy sci_select on public.supplier_catalog_items for select
  using (
    -- owner supplier
    supplier_org_id = public.current_organization_id()
    -- or a customer with an active connection to this supplier
    or exists (
      select 1 from public.supplier_customer_connections c
      where c.supplier_org_id = supplier_catalog_items.supplier_org_id
        and c.customer_org_id = public.current_organization_id()
        and c.status = 'active'
    )
  );

drop policy if exists sci_write on public.supplier_catalog_items;
create policy sci_write on public.supplier_catalog_items for all
  using (supplier_org_id = public.current_organization_id()
         and public.current_account_type() = 'supplier')
  with check (supplier_org_id = public.current_organization_id()
              and public.current_account_type() = 'supplier');

-- ── marketplace_orders : both parties read; customer creates; both update ───
alter table public.marketplace_orders enable row level security;

drop policy if exists mo_select on public.marketplace_orders;
create policy mo_select on public.marketplace_orders for select
  using (customer_org_id = public.current_organization_id()
         or supplier_org_id = public.current_organization_id());

drop policy if exists mo_insert on public.marketplace_orders;
create policy mo_insert on public.marketplace_orders for insert
  with check (
    customer_org_id = public.current_organization_id()
    and public.current_account_type() = 'customer'
    and status = 'draft'
    and exists (
      select 1 from public.supplier_customer_connections c
      where c.id = marketplace_orders.connection_id
        and c.customer_org_id = public.current_organization_id()
        and c.supplier_org_id = marketplace_orders.supplier_org_id
        and c.status = 'active'
    )
  );

drop policy if exists mo_update on public.marketplace_orders;
create policy mo_update on public.marketplace_orders for update
  using (customer_org_id = public.current_organization_id()
         or supplier_org_id = public.current_organization_id())
  with check (customer_org_id = public.current_organization_id()
              or supplier_org_id = public.current_organization_id());
-- which side may perform which transition is enforced by trg_marketplace_order_status_guard

-- ── marketplace_order_lines : visible to both parties; editable while draft ──
alter table public.marketplace_order_lines enable row level security;

drop policy if exists mol_select on public.marketplace_order_lines;
create policy mol_select on public.marketplace_order_lines for select
  using (exists (
    select 1 from public.marketplace_orders o
    where o.id = marketplace_order_lines.order_id
      and (o.customer_org_id = public.current_organization_id()
           or o.supplier_org_id = public.current_organization_id())
  ));

drop policy if exists mol_write on public.marketplace_order_lines;
create policy mol_write on public.marketplace_order_lines for all
  using (exists (
    select 1 from public.marketplace_orders o
    where o.id = marketplace_order_lines.order_id
      and o.customer_org_id = public.current_organization_id()
      and o.status = 'draft'
  ))
  with check (exists (
    select 1 from public.marketplace_orders o
    where o.id = marketplace_order_lines.order_id
      and o.customer_org_id = public.current_organization_id()
      and o.status = 'draft'
  ));

-- ── marketplace_order_status_history : read-only to parties; trigger writes ──
alter table public.marketplace_order_status_history enable row level security;

drop policy if exists mosh_select on public.marketplace_order_status_history;
create policy mosh_select on public.marketplace_order_status_history for select
  using (exists (
    select 1 from public.marketplace_orders o
    where o.id = marketplace_order_status_history.order_id
      and (o.customer_org_id = public.current_organization_id()
           or o.supplier_org_id = public.current_organization_id())
  ));
-- inserts come only from fn_marketplace_order_status_log (SECURITY DEFINER): no insert policy.

-- ── audit_logs : each org reads its own; append-only ─────────────────────────
alter table public.audit_logs enable row level security;

drop policy if exists audit_select on public.audit_logs;
create policy audit_select on public.audit_logs for select
  using (org_id = public.current_organization_id());

drop policy if exists audit_insert on public.audit_logs;
create policy audit_insert on public.audit_logs for insert
  with check (org_id = public.current_organization_id());
-- (no update/delete: append-only)

-- ── Helpful indexes for the policy subqueries & common reads ─────────────────
create index if not exists scc_supplier_idx  on public.supplier_customer_connections (supplier_org_id, status);
create index if not exists scc_customer_idx  on public.supplier_customer_connections (customer_org_id, status);
create index if not exists sci_supplier_idx  on public.supplier_catalog_items (supplier_org_id, is_active);
create index if not exists mo_customer_idx   on public.marketplace_orders (customer_org_id, status, created_at desc);
create index if not exists mo_supplier_idx   on public.marketplace_orders (supplier_org_id, status, created_at desc);
create index if not exists mol_order_idx     on public.marketplace_order_lines (order_id, sort_order);
create index if not exists mosh_order_idx    on public.marketplace_order_status_history (order_id, created_at);
create index if not exists sck_supplier_idx  on public.supplier_connection_keys (supplier_org_id, is_active);
