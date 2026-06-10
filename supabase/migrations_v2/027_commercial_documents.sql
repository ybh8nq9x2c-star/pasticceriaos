-- =============================================================================
-- 027_commercial_documents.sql
-- Ciclo documentale passivo: conferma ordine / DDT / fattura / nota credito,
-- righe per il matching con order_line_items, anomalie rilevate.
-- supplier_id e purchase_order_id NULLABLE: un DDT/fattura può arrivare dal
-- supplier workspace (via marketplace_order_id) prima che esista il PO specchio.
-- =============================================================================

create type document_type as enum ('order_confirmation', 'delivery_note', 'invoice', 'credit_note');
create type document_status as enum ('received', 'matched', 'anomaly', 'archived');

create table commercial_documents (
  id                   uuid primary key default gen_random_uuid(),
  organization_id      uuid not null references organizations(id) on delete cascade,
  supplier_id          uuid references suppliers(id),
  purchase_order_id    uuid references purchase_orders(id),
  marketplace_order_id uuid references marketplace_orders(id),
  document_type        document_type not null,
  document_status      document_status not null default 'received',
  document_number      text,
  document_date        date not null,
  due_date             date,
  subtotal_amount      numeric(12,2) check (subtotal_amount is null or subtotal_amount >= 0),
  tax_amount           numeric(12,2) check (tax_amount is null or tax_amount >= 0),
  total_amount         numeric(12,2) check (total_amount is null or total_amount >= 0),
  notes                text,
  file_url             text,
  uploaded_by_org_id   uuid references organizations(id),
  matched_at           timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create trigger commercial_documents_set_updated_at
  before update on commercial_documents
  for each row execute function set_updated_at();

create table document_line_items (
  id                    uuid primary key default gen_random_uuid(),
  document_id           uuid not null references commercial_documents(id) on delete cascade,
  order_line_item_id    uuid references order_line_items(id),
  ingredient_product_id uuid references ingredient_products(id),
  description           text not null,
  quantity              numeric(10,4) not null check (quantity > 0),
  unit                  unit_of_measure not null,
  unit_price            numeric(10,4) check (unit_price is null or unit_price >= 0),
  line_total            numeric(12,2),
  quantity_variance     numeric(10,4),
  price_variance        numeric(10,4),
  matched_at            timestamptz,
  created_at            timestamptz not null default now()
);

create table document_anomalies (
  id             uuid primary key default gen_random_uuid(),
  document_id    uuid not null references commercial_documents(id) on delete cascade,
  anomaly_type   text not null check (anomaly_type in ('quantity_mismatch','price_mismatch','extra_item','missing_item','total_mismatch')),
  description    text not null,
  expected_value text,
  actual_value   text,
  resolved       boolean not null default false,
  resolved_at    timestamptz,
  resolved_by    uuid references auth.users(id),
  created_at     timestamptz not null default now()
);

create index idx_cd_org_status on commercial_documents (organization_id, document_status);
create index idx_cd_po on commercial_documents (purchase_order_id);
create index idx_cd_mo on commercial_documents (marketplace_order_id);
create index idx_dli_document on document_line_items (document_id);
create index idx_da_document on document_anomalies (document_id) where not resolved;

alter table commercial_documents enable row level security;
alter table document_line_items enable row level security;
alter table document_anomalies enable row level security;

-- Bakery: pieno accesso ai documenti della propria org
create policy cd_select_org on commercial_documents
  for select using (organization_id = current_organization_id());
create policy cd_insert_org on commercial_documents
  for insert with check (organization_id = current_organization_id());
create policy cd_update_org on commercial_documents
  for update using (organization_id = current_organization_id())
  with check (organization_id = current_organization_id());

-- Supplier workspace: può INSERIRE documenti per un cliente SOLO legati a un
-- proprio ordine marketplace, e rivedere quelli che ha caricato.
create policy cd_insert_supplier on commercial_documents
  for insert with check (
    marketplace_order_id is not null
    and uploaded_by_org_id = current_organization_id()
    and exists (
      select 1 from marketplace_orders mo
      where mo.id = marketplace_order_id
        and mo.supplier_org_id = current_organization_id()
        and mo.customer_org_id = commercial_documents.organization_id
    )
  );
create policy cd_select_supplier on commercial_documents
  for select using (uploaded_by_org_id = current_organization_id());

-- Righe e anomalie: visibilità attraverso il documento
create policy dli_select on document_line_items
  for select using (exists (
    select 1 from commercial_documents d where d.id = document_id
      and (d.organization_id = current_organization_id() or d.uploaded_by_org_id = current_organization_id())
  ));
create policy dli_write on document_line_items
  for all using (exists (
    select 1 from commercial_documents d where d.id = document_id
      and (d.organization_id = current_organization_id() or d.uploaded_by_org_id = current_organization_id())
  ))
  with check (exists (
    select 1 from commercial_documents d where d.id = document_id
      and (d.organization_id = current_organization_id() or d.uploaded_by_org_id = current_organization_id())
  ));

create policy da_select on document_anomalies
  for select using (exists (
    select 1 from commercial_documents d where d.id = document_id and d.organization_id = current_organization_id()
  ));
create policy da_write on document_anomalies
  for all using (exists (
    select 1 from commercial_documents d where d.id = document_id and d.organization_id = current_organization_id()
  ))
  with check (exists (
    select 1 from commercial_documents d where d.id = document_id and d.organization_id = current_organization_id()
  ));

-- Vista "documenti che richiedono attenzione" per la dashboard
create or replace view v_documents_attention
with (security_invoker = on) as
select
  d.id, d.organization_id, d.document_type, d.document_status, d.document_number,
  d.document_date, d.total_amount,
  s.name as supplier_name,
  (select count(*) from document_anomalies a where a.document_id = d.id and not a.resolved) as open_anomalies
from commercial_documents d
left join suppliers s on s.id = d.supplier_id
where d.document_status in ('received', 'anomaly');
