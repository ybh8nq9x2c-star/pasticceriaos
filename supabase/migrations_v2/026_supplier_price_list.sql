-- =============================================================================
-- 026_supplier_price_list.sql
-- Listino prezzi accordato cliente-fornitore (Livello 3 della supplier
-- integration). Il livello di connessione NON è una colonna: si deriva —
--   L1 = suppliers.supplier_org_id IS NULL (solo email)
--   L2 = supplier_org_id presente (workspace collegato via chiave)
--   L3 = L2 + righe attive in supplier_price_list
-- =============================================================================

create table supplier_price_list (
  id                    uuid primary key default gen_random_uuid(),
  organization_id       uuid not null references organizations(id) on delete cascade,
  supplier_id           uuid not null references suppliers(id) on delete cascade,
  ingredient_product_id uuid not null references ingredient_products(id) on delete cascade,
  unit_price            numeric(10,4) not null check (unit_price >= 0),
  unit                  unit_of_measure not null,
  valid_from            date not null default current_date,
  is_active             boolean not null default true,
  created_at            timestamptz not null default now()
);

create index idx_spl_org_supplier on supplier_price_list (organization_id, supplier_id);
create index idx_spl_ingredient on supplier_price_list (ingredient_product_id) where is_active;
create unique index uq_spl_active on supplier_price_list (organization_id, supplier_id, ingredient_product_id, valid_from);

alter table supplier_price_list enable row level security;

create policy spl_select on supplier_price_list
  for select using (organization_id = current_organization_id());
create policy spl_write on supplier_price_list
  for all using (organization_id = current_organization_id())
  with check (organization_id = current_organization_id());

comment on table supplier_price_list is
  'Prezzi accordati per cliente-fornitore-ingrediente. Storico via valid_from; la riga attiva più recente è il prezzo corrente.';
