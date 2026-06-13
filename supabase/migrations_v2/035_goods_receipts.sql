-- =============================================================================
-- 035_goods_receipts.sql
-- GOODS RECEIPT ENGINE — motore unico di ricevimento merce, dual-mode:
--   • mode='supplier': il fornitore riceve dai propri produttori/distributori
--   • mode='bakery':   la pasticceria riceve da fornitori esterni o connessi
--
-- PRINCIPI:
--   • lo stock resta APPEND-ONLY via inventory_movements (trigger esistente
--     trg_inventory_movement_after_insert aggiorna inventory_levels);
--   • nessun update diretto delle giacenze: l'unico write-path del ricevimento
--     è la RPC transazionale complete_purchase_receipt;
--   • idempotenza incrementale per riga via qty_posted (doppio submit/doppio
--     scan non duplica mai i movimenti);
--   • tracciabilità completa: documento (commercial_documents) → receipt →
--     receipt_line → inventory_movement (+qty_before/after) → ingredient_batch.
--
-- ADDITIVE & SAFE: nuove tabelle/enum/colonne nullable + una RPC. Nessuna
-- modifica al comportamento dei write-path esistenti (019/023 invariati).
-- =============================================================================

-- ── Enums ─────────────────────────────────────────────────────────────────────

create type receipt_mode as enum ('supplier', 'bakery');

create type receipt_status as enum
  ('draft', 'expected', 'partial', 'completed', 'discrepancy', 'cancelled');

create type receipt_line_status as enum
  ('pending', 'matched', 'received', 'partial', 'discrepancy');

-- ── Catalogo: barcode per il matching da scanner ─────────────────────────────

alter table ingredient_products add column if not exists barcode text;

create index if not exists idx_ingredient_products_barcode
  on ingredient_products (organization_id, barcode)
  where barcode is not null;

comment on column ingredient_products.barcode is
  'EAN-13/Code128 del prodotto per il matching da scanner. Opzionale.';

-- ── Audit movimenti: giacenza prima/dopo (nullable, riempiti dai nuovi path) ──

alter table inventory_movements add column if not exists qty_before numeric(12,4);
alter table inventory_movements add column if not exists qty_after  numeric(12,4);

comment on column inventory_movements.qty_before is
  'Giacenza PRIMA del movimento (audit trail goods-receipt). Null sui movimenti storici.';
comment on column inventory_movements.qty_after is
  'Giacenza DOPO il movimento (audit trail goods-receipt). Null sui movimenti storici.';

-- ── purchase_receipts ─────────────────────────────────────────────────────────

create table purchase_receipts (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid not null references organizations(id) on delete cascade,
  mode               receipt_mode not null,
  supplier_id        uuid references suppliers(id),
  purchase_order_id  uuid references purchase_orders(id),
  source_document_id uuid references commercial_documents(id),
  ddt_number         text,
  ddt_date           date,
  status             receipt_status not null default 'draft',
  notes              text,
  created_by         uuid not null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  completed_at       timestamptz
);

create index idx_purchase_receipts_org_status
  on purchase_receipts (organization_id, status, created_at desc);
create index idx_purchase_receipts_order
  on purchase_receipts (purchase_order_id) where purchase_order_id is not null;

comment on table purchase_receipts is
  'Sessione di ricevimento merce (scan / DDT / manuale assistito). Unico ingresso lecito a magazzino insieme ai write-path 019/023.';

-- ── purchase_receipt_lines ────────────────────────────────────────────────────

create table purchase_receipt_lines (
  id                 uuid primary key default gen_random_uuid(),
  receipt_id         uuid not null references purchase_receipts(id) on delete cascade,
  product_id         uuid references ingredient_products(id),
  raw_product_name   text not null,
  sku                text,
  barcode            text,
  qty_expected       numeric(12,4) check (qty_expected is null or qty_expected > 0),
  qty_received       numeric(12,4) not null default 0 check (qty_received >= 0),
  -- Quantità già CONTABILIZZATA a stock dalla RPC: il delta (qty_received -
  -- qty_posted) è ciò che il prossimo complete registra. Garantisce idempotenza
  -- e ricevimenti parziali incrementali senza doppi movimenti.
  qty_posted         numeric(12,4) not null default 0 check (qty_posted >= 0),
  unit               unit_of_measure not null default 'pz',
  lot_number         text,
  expiry_date        date,
  discrepancy_reason text,
  line_status        receipt_line_status not null default 'pending',
  sort_order         int not null default 0,
  scanned_by         uuid,
  scanned_at         timestamptz,
  created_at         timestamptz not null default now()
);

create index idx_receipt_lines_receipt on purchase_receipt_lines (receipt_id, sort_order);

-- ── Lotti: link alla riga di ricevimento d'origine ───────────────────────────

alter table ingredient_batches
  add column if not exists receipt_line_id uuid references purchase_receipt_lines(id);

comment on column ingredient_batches.receipt_line_id is
  'Riga di ricevimento che ha generato il lotto (tracciabilità documento→lotto).';

-- ── RLS ───────────────────────────────────────────────────────────────────────

alter table purchase_receipts enable row level security;

create policy "purchase_receipts_select" on purchase_receipts
  for select using (organization_id = current_organization_id());
create policy "purchase_receipts_insert" on purchase_receipts
  for insert with check (organization_id = current_organization_id());
create policy "purchase_receipts_update" on purchase_receipts
  for update using (organization_id = current_organization_id())
  with check (organization_id = current_organization_id());
-- niente DELETE: l'annullamento è status='cancelled' (audit trail conservato)

alter table purchase_receipt_lines enable row level security;

create policy "purchase_receipt_lines_select" on purchase_receipt_lines
  for select using (exists (
    select 1 from purchase_receipts r
    where r.id = receipt_id and r.organization_id = current_organization_id()));
create policy "purchase_receipt_lines_insert" on purchase_receipt_lines
  for insert with check (exists (
    select 1 from purchase_receipts r
    where r.id = receipt_id and r.organization_id = current_organization_id()));
create policy "purchase_receipt_lines_update" on purchase_receipt_lines
  for update using (exists (
    select 1 from purchase_receipts r
    where r.id = receipt_id and r.organization_id = current_organization_id()));
create policy "purchase_receipt_lines_delete" on purchase_receipt_lines
  for delete using (exists (
    select 1 from purchase_receipts r
    where r.id = receipt_id and r.organization_id = current_organization_id()
      and r.status in ('draft', 'expected')));

-- ── RPC: complete_purchase_receipt ────────────────────────────────────────────
-- Contabilizza a stock le righe del ricevimento (delta = qty_received -
-- qty_posted), crea i lotti, aggiorna l'eventuale ordine collegato e ricalcola
-- lo stato del receipt. Tutto in UNA transazione, serializzata da row-lock.
--
-- Idempotente e incrementale:
--   • righe già contabilizzate (delta=0) vengono saltate;
--   • un secondo complete senza nuove quantità non genera movimenti;
--   • un complete dopo nuove qty ricevute registra SOLO il delta.

create or replace function public.complete_purchase_receipt(p_receipt_id uuid)
returns receipt_status
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org       uuid;
  v_status    receipt_status;
  v_order     uuid;
  v_supplier  uuid;
  v_user      uuid := auth.uid();
  v_line      record;
  v_delta     numeric(12,4);
  v_before    numeric(12,4);
  v_new_status receipt_status;
  v_has_partial boolean := false;
  v_has_discrepancy boolean := false;
  v_has_pending boolean := false;
  v_posted_any boolean := false;
  v_order_status order_status;
begin
  if v_user is null then
    raise exception 'complete_purchase_receipt: utente non autenticato' using errcode = 'P0001';
  end if;

  -- Row-lock del receipt: serializza i complete concorrenti (doppio submit).
  select organization_id, status, purchase_order_id, supplier_id
    into v_org, v_status, v_order, v_supplier
  from purchase_receipts where id = p_receipt_id
  for update;

  if v_org is null then
    raise exception 'complete_purchase_receipt: ricevimento non trovato' using errcode = 'P0044';
  end if;
  if v_org is distinct from current_organization_id() then
    raise exception 'complete_purchase_receipt: ricevimento di un''altra organizzazione' using errcode = 'P0043';
  end if;
  if v_status in ('completed', 'cancelled') then
    raise exception 'complete_purchase_receipt: il ricevimento è già %', v_status using errcode = 'P0040';
  end if;

  -- Ordine collegato: non si contabilizza due volte lo stesso ordine.
  if v_order is not null then
    select status into v_order_status from purchase_orders where id = v_order for update;
    if v_order_status = 'received' then
      raise exception 'complete_purchase_receipt: l''ordine collegato risulta già ricevuto a magazzino' using errcode = 'P0041';
    end if;
    if v_order_status = 'cancelled' then
      raise exception 'complete_purchase_receipt: l''ordine collegato è annullato' using errcode = 'P0041';
    end if;
  end if;

  -- ── Contabilizza riga per riga (solo il delta non ancora registrato) ──────
  for v_line in
    select * from purchase_receipt_lines
    where receipt_id = p_receipt_id
    order by sort_order, created_at
    for update
  loop
    v_delta := v_line.qty_received - v_line.qty_posted;

    if v_delta < 0 then
      raise exception 'complete_purchase_receipt: qty_received (%) sotto il già contabilizzato (%) sulla riga "%"',
        v_line.qty_received, v_line.qty_posted, v_line.raw_product_name using errcode = 'P0042';
    end if;

    if v_delta > 0 then
      if v_line.product_id is null then
        raise exception 'complete_purchase_receipt: riga "%" senza prodotto associato: risolvi il matching prima di completare',
          v_line.raw_product_name using errcode = 'P0042';
      end if;

      -- Giacenza prima/dopo per l'audit (lock del livello per coerenza).
      select current_quantity into v_before
      from inventory_levels
      where organization_id = v_org and ingredient_product_id = v_line.product_id
      for update;
      v_before := coalesce(v_before, 0);

      insert into inventory_movements (
        organization_id, ingredient_product_id, movement_type, quantity_delta,
        unit, reference_type, reference_id, performed_by, qty_before, qty_after,
        notes
      ) values (
        v_org, v_line.product_id, 'purchase_receipt', v_delta,
        v_line.unit, 'purchase_receipt', p_receipt_id, v_user, v_before, v_before + v_delta,
        nullif(concat_ws(' · ',
          'riga: ' || v_line.raw_product_name,
          case when v_line.lot_number is not null then 'lotto ' || v_line.lot_number end
        ), '')
      );

      -- Lotto/scadenza → ingredient_batches (tracciabilità FEFO/HACCP).
      if v_line.expiry_date is not null then
        insert into ingredient_batches (
          organization_id, ingredient_product_id, purchase_order_id, supplier_id,
          lot_number, expiry_date, quantity_received, quantity_remaining, unit,
          receipt_line_id, notes
        ) values (
          v_org, v_line.product_id, v_order, v_supplier,
          v_line.lot_number, v_line.expiry_date, v_delta, v_delta, v_line.unit,
          v_line.id, 'Da ricevimento ' || p_receipt_id
        );
      end if;

      -- Avanzamento ordine collegato (per ingrediente, cap alla qty ordinata).
      if v_order is not null then
        update order_line_items oli
        set quantity_received = least(oli.quantity_ordered,
                                      coalesce(oli.quantity_received, 0) + v_delta)
        where oli.purchase_order_id = v_order
          and oli.ingredient_product_id = v_line.product_id;
      end if;

      update purchase_receipt_lines
      set qty_posted = v_line.qty_received,
          line_status = case
            when v_line.discrepancy_reason is not null then 'discrepancy'::receipt_line_status
            when v_line.qty_expected is null then 'received'::receipt_line_status
            when v_line.qty_received >= v_line.qty_expected then 'received'::receipt_line_status
            else 'partial'::receipt_line_status
          end
      where id = v_line.id;

      v_posted_any := true;
    end if;
  end loop;

  -- ── Stato aggregato del receipt ───────────────────────────────────────────
  select
    bool_or(line_status = 'discrepancy' or discrepancy_reason is not null),
    bool_or(line_status = 'partial'),
    bool_or(line_status in ('pending', 'matched') and coalesce(qty_expected, 0) > 0
            and qty_received < qty_expected)
    into v_has_discrepancy, v_has_partial, v_has_pending
  from purchase_receipt_lines
  where receipt_id = p_receipt_id;

  v_new_status := case
    when coalesce(v_has_discrepancy, false) then 'discrepancy'::receipt_status
    when coalesce(v_has_partial, false) or coalesce(v_has_pending, false) then 'partial'::receipt_status
    else 'completed'::receipt_status
  end;

  update purchase_receipts
  set status = v_new_status,
      updated_at = now(),
      completed_at = case when v_new_status in ('completed', 'discrepancy') then now() else completed_at end
  where id = p_receipt_id;

  -- ── Ordine collegato: received se tutte le righe sono coperte ─────────────
  if v_order is not null and v_posted_any then
    if not exists (
      select 1 from order_line_items
      where purchase_order_id = v_order
        and coalesce(quantity_received, 0) < quantity_ordered
    ) then
      update purchase_orders set status = 'received' where id = v_order;
      insert into order_status_history (purchase_order_id, from_status, to_status, changed_by, notes)
      values (v_order, v_order_status, 'received', v_user,
              'Ricevuto tramite goods receipt ' || p_receipt_id);
    end if;
  end if;

  return v_new_status;
end;
$$;

revoke all on function public.complete_purchase_receipt(uuid) from public, anon;
grant execute on function public.complete_purchase_receipt(uuid) to authenticated;

comment on function public.complete_purchase_receipt(uuid) is
  'Contabilizza un ricevimento merce: movimenti inbound con qty before/after, lotti, avanzamento ordine collegato, stato receipt. Idempotente per riga via qty_posted. SECURITY DEFINER con org-check.';
