-- =============================================================================
-- 023_marketplace_receipt_bridge.sql
-- Ponte ordine marketplace (cross-org) -> magazzino della pasticceria.
-- Quando il fornitore marca 'delivered', il cliente registra il carico:
--   receive_marketplace_order(p_order_id) crea ATOMICAMENTE
--   - anagrafica fornitore collegata (suppliers.supplier_org_id) se mancante
--   - ingredient_products mappati per nome (creati se nuovi)
--   - purchase_order specchio (marketplace_order_id UNIQUE = idempotenza)
--   - order_line_items con quantity_received e unit_price_snapshot
--   - inventory_movements 'purchase_receipt' (delta positivo)
--   - refresh prezzo cache su ingredient_products
--   - order_status_history coerente
-- inventory_levels si aggiorna SOLO via trigger sui movimenti, come sempre.
-- =============================================================================

alter table suppliers add column if not exists supplier_org_id uuid references organizations(id);
create unique index if not exists uq_suppliers_org_supplier_org
  on suppliers (organization_id, supplier_org_id) where supplier_org_id is not null;

comment on column suppliers.supplier_org_id is
  'Org fornitore marketplace collegata a questa anagrafica locale (NULL = fornitore solo-email).';

alter table purchase_orders add column if not exists marketplace_order_id uuid unique references marketplace_orders(id);

comment on column purchase_orders.marketplace_order_id is
  'Ordine marketplace da cui questo PO è stato importato alla consegna. UNIQUE = ricezione idempotente.';

create or replace function receive_marketplace_order(p_order_id uuid)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_user        uuid := auth.uid();
  v_org         uuid := current_organization_id();
  v_mo          marketplace_orders%rowtype;
  v_existing_po uuid;
  v_supplier_id uuid;
  v_sup_name    text;
  v_sup_slug    text;
  v_sup_email   text;
  v_po_id       uuid;
  v_line        record;
  v_product_id  uuid;
begin
  if v_user is null then
    raise exception 'receive_marketplace_order: utente non autenticato' using errcode = 'P0001';
  end if;

  select * into v_mo from marketplace_orders where id = p_order_id for update;

  if v_mo.id is null then
    raise exception 'receive_marketplace_order: ordine non trovato' using errcode = 'P0044';
  end if;
  if v_mo.customer_org_id is distinct from v_org then
    raise exception 'receive_marketplace_order: non sei il cliente di questo ordine' using errcode = 'P0202';
  end if;
  if v_mo.status <> 'delivered' then
    raise exception 'receive_marketplace_order: l''ordine non è in stato delivered (stato: %)', v_mo.status using errcode = 'P0040';
  end if;

  -- Idempotenza: già importato -> restituisci il PO esistente, nessun doppio movimento.
  select id into v_existing_po from purchase_orders where marketplace_order_id = p_order_id;
  if v_existing_po is not null then
    return v_existing_po;
  end if;

  -- Anagrafica fornitore locale collegata all'org fornitore.
  select name, slug, email into v_sup_name, v_sup_slug, v_sup_email
  from organizations where id = v_mo.supplier_org_id;

  select id into v_supplier_id
  from suppliers
  where organization_id = v_org and supplier_org_id = v_mo.supplier_org_id;

  if v_supplier_id is null then
    insert into suppliers (organization_id, supplier_org_id, name, email, notes)
    values (
      v_org,
      v_mo.supplier_org_id,
      coalesce(v_sup_name, 'Fornitore marketplace'),
      coalesce(v_sup_email, 'ordini+' || coalesce(v_sup_slug, 'fornitore') || '@marketplace.local'),
      'Creato automaticamente dal collegamento marketplace.'
    )
    returning id into v_supplier_id;
  end if;

  -- PO specchio in stato 'confirmed' (la ricezione lo porterà a 'received').
  insert into purchase_orders (
    organization_id, supplier_id, status, order_date, notes,
    marketplace_order_id, created_by, sent_at
  )
  values (
    v_org, v_supplier_id, 'confirmed',
    coalesce(v_mo.delivered_at::date, current_date),
    'Importato da ordine marketplace #' || left(p_order_id::text, 8),
    p_order_id, v_user, v_mo.submitted_at
  )
  returning id into v_po_id;

  insert into order_status_history (purchase_order_id, from_status, to_status, changed_by, notes)
  values (v_po_id, null, 'confirmed', v_user, 'Importato da ordine marketplace consegnato');

  -- Righe: mappa ingredienti per nome (case-insensitive); crea se mancanti.
  for v_line in
    select * from marketplace_order_lines where order_id = p_order_id order by sort_order
  loop
    select id into v_product_id
    from ingredient_products
    where organization_id = v_org
      and lower(trim(name)) = lower(trim(v_line.name_snapshot))
    order by (unit = v_line.unit) desc, is_active desc, created_at asc
    limit 1;

    if v_product_id is null then
      insert into ingredient_products (organization_id, supplier_id, name, sku, unit, unit_price)
      values (v_org, v_supplier_id, v_line.name_snapshot, v_line.sku_snapshot, v_line.unit, v_line.unit_price_snapshot)
      returning id into v_product_id;
    end if;

    insert into order_line_items (
      purchase_order_id, ingredient_product_id,
      quantity_ordered, quantity_received, unit, unit_price_snapshot
    )
    values (v_po_id, v_product_id, v_line.quantity, v_line.quantity, v_line.unit, v_line.unit_price_snapshot);

    -- Carico a magazzino: SOLO tramite movimento (trigger aggiorna inventory_levels).
    insert into inventory_movements (
      organization_id, ingredient_product_id, movement_type, quantity_delta, unit,
      reference_type, reference_id, performed_by, notes
    )
    values (
      v_org, v_product_id, 'purchase_receipt', v_line.quantity, v_line.unit,
      'purchase_order', v_po_id, v_user, 'Ricezione ordine marketplace'
    );

    -- Refresh prezzo cache (stesso comportamento di receive_purchase_order).
    if v_line.unit_price_snapshot is not null then
      update ingredient_products
      set unit_price = v_line.unit_price_snapshot
      where id = v_product_id;
    end if;
  end loop;

  update purchase_orders set status = 'received' where id = v_po_id;

  insert into order_status_history (purchase_order_id, from_status, to_status, changed_by, notes)
  values (v_po_id, 'confirmed', 'received', v_user, 'Carico a magazzino registrato');

  return v_po_id;
exception
  when unique_violation then
    -- gara persa su marketplace_order_id: qualcun altro ha già importato.
    select id into v_existing_po from purchase_orders where marketplace_order_id = p_order_id;
    if v_existing_po is not null then
      return v_existing_po;
    end if;
    raise;
end;
$$;

revoke all on function receive_marketplace_order(uuid) from public, anon;
grant execute on function receive_marketplace_order(uuid) to authenticated;
