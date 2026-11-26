-- =============================================================================
-- 061_partial_receipts_coherence.sql  (W4 — REMEDIATION_REPORT.md, ADR 002)
-- Ricevimenti parziali coerenti con il ledger.
--
-- Problemi:
--   a) apertura sessione = "cerca un ricevimento aperto" + "crealo" in DUE
--      richieste dall'app: due operatori potevano partire dallo stesso residuo
--      con due ricevimenti distinti;
--   b) complete_purchase_receipt registrava il movimento a magazzino PRIMA di
--      limitare (least) l'avanzamento dell'ordine: un'eccedenza entrava in stock
--      mentre l'ordine veniva "cappato" in silenzio;
--   c) l'avanzamento era PER INGREDIENTE: con lo stesso prodotto su più righe
--      d'ordine, un solo carico avanzava TUTTE quelle righe.
--
-- Fix:
--   1) purchase_receipt_lines.order_line_item_id (nuova, nullable) + guard di
--      coerenza (la riga d'ordine deve essere dell'ordine del ricevimento) +
--      backfill dei collegamenti univoci;
--   2) RPC open_receipt_for_order: find-or-create ATOMICO (advisory lock per
--      ordine + indice unico parziale "un ricevimento aperto per ordine");
--   3) complete_purchase_receipt v3: lock delle righe d'ordine, residuo
--      ricalcolato sotto lock, eccedenza RIFIUTATA (P0046, ADR 002), avanzamento
--      SOLO della riga target, e SOLO DOPO il movimento a magazzino.
-- =============================================================================

-- =============================================================================
-- 1) Collegamento riga ricevimento → riga ordine
-- =============================================================================
alter table purchase_receipt_lines
  add column if not exists order_line_item_id uuid references order_line_items(id);
comment on column purchase_receipt_lines.order_line_item_id is
  'Riga d''ordine che questa riga di ricevimento evade (061). L''avanzamento ordine tocca SOLO questa riga.';
create index if not exists purchase_receipt_lines_order_line_idx
  on purchase_receipt_lines (order_line_item_id) where order_line_item_id is not null;

create or replace function public.fn_receipt_line_order_link_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.order_line_item_id is not null and not exists (
    select 1
    from purchase_receipts r
    join order_line_items oli on oli.id = new.order_line_item_id
                             and oli.purchase_order_id = r.purchase_order_id
    where r.id = new.receipt_id
  ) then
    raise exception 'riga di ricevimento: la riga d''ordine collegata non appartiene all''ordine del ricevimento'
      using errcode = 'P0045';
  end if;
  return new;
end;
$$;
revoke all on function public.fn_receipt_line_order_link_guard() from public, anon, authenticated;

drop trigger if exists trg_receipt_line_order_link_guard on purchase_receipt_lines;
create trigger trg_receipt_line_order_link_guard
  before insert or update of order_line_item_id, receipt_id on purchase_receipt_lines
  for each row execute function public.fn_receipt_line_order_link_guard();

-- Backfill: collega le righe esistenti SOLO dove l'abbinamento è univoco
-- (un'unica riga d'ordine per quel prodotto). Gli ambigui restano null e la
-- RPC li gestisce con la regola deterministica documentata sotto.
update purchase_receipt_lines l
set order_line_item_id = m.oli_id
from (
  select l2.id as line_id, min(oli.id::text)::uuid as oli_id
  from purchase_receipt_lines l2
  join purchase_receipts r on r.id = l2.receipt_id and r.purchase_order_id is not null
  join order_line_items oli on oli.purchase_order_id = r.purchase_order_id
                           and oli.ingredient_product_id = l2.product_id
  where l2.order_line_item_id is null
  group by l2.id
  having count(*) = 1
) m
where l.id = m.line_id;

-- =============================================================================
-- 2) Una sola sessione aperta per ordine + find-or-create atomico
-- =============================================================================
-- Indice unico parziale. Se in un ambiente esistono già duplicati storici non
-- lo creiamo (bloccherebbe il deploy) e lo dichiariamo: la RPC serializza
-- comunque l'apertura con un advisory lock per ordine.
do $$
begin
  if exists (
    select purchase_order_id from purchase_receipts
    where purchase_order_id is not null and status in ('draft', 'expected', 'partial')
    group by purchase_order_id having count(*) > 1
  ) then
    raise warning '061: esistono ordini con più ricevimenti aperti: indice unico NON creato (vedi diagnostics/receipts_open_duplicates.sql)';
  else
    create unique index if not exists purchase_receipts_one_open_per_order
      on purchase_receipts (purchase_order_id)
      where purchase_order_id is not null and status in ('draft', 'expected', 'partial');
  end if;
end $$;

create or replace function public.open_receipt_for_order(
  p_order_id    uuid,
  p_mode        receipt_mode default 'bakery',
  p_ddt_number  text default null,
  p_ddt_date    date default null,
  p_notes       text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user   uuid := auth.uid();
  v_org    uuid := public.current_organization_id();
  v_role   org_role;
  v_order  record;
  v_id     uuid;
begin
  if v_user is null then
    raise exception 'open_receipt_for_order: utente non autenticato' using errcode = 'P0001';
  end if;
  v_role := public.current_org_role();
  if v_role is null or v_role = 'viewer' then
    raise exception 'Non hai i permessi per ricevere merce (ruolo in sola lettura).' using errcode = 'P0050';
  end if;

  -- Serializza le aperture concorrenti SULLO STESSO ordine (due operatori,
  -- doppio tap): il secondo attende e poi trova la sessione del primo.
  perform pg_advisory_xact_lock(hashtextextended('open_receipt:' || p_order_id::text, 0));

  select id, organization_id, status, supplier_id into v_order
  from purchase_orders where id = p_order_id
  for update;
  if v_order.id is null or v_order.organization_id is distinct from v_org then
    raise exception 'Ordine non trovato.' using errcode = 'P0044';
  end if;

  -- find: sessione già aperta per questo ordine → la stessa per tutti
  select id into v_id from purchase_receipts
  where organization_id = v_org and purchase_order_id = p_order_id
    and status in ('draft', 'expected', 'partial')
  order by created_at desc
  limit 1;
  if v_id is not null then
    return v_id;
  end if;

  if v_order.status = 'received' then
    raise exception 'Questo ordine risulta già ricevuto a magazzino.' using errcode = 'P0041';
  end if;
  if v_order.status in ('cancelled', 'draft') then
    raise exception 'Puoi creare un ricevimento solo da ordini inviati o confermati.' using errcode = 'P0041';
  end if;

  -- create: testata + righe dal RESIDUO di ogni riga d'ordine, collegate
  insert into purchase_receipts (
    organization_id, mode, supplier_id, purchase_order_id,
    ddt_number, ddt_date, status, notes, created_by
  ) values (
    v_org, coalesce(p_mode, 'bakery'), v_order.supplier_id, p_order_id,
    nullif(trim(p_ddt_number), ''), p_ddt_date, 'expected', nullif(trim(p_notes), ''), v_user
  )
  returning id into v_id;

  insert into purchase_receipt_lines (
    receipt_id, product_id, order_line_item_id, raw_product_name, sku, barcode,
    qty_expected, unit, line_status, sort_order
  )
  select v_id, oli.ingredient_product_id, oli.id, ip.name, ip.sku, ip.barcode,
         oli.quantity_ordered - coalesce(oli.quantity_received, 0), oli.unit,
         'matched', (row_number() over (order by ip.name, oli.id)) - 1
  from order_line_items oli
  join ingredient_products ip on ip.id = oli.ingredient_product_id
  where oli.purchase_order_id = p_order_id
    and oli.quantity_ordered - coalesce(oli.quantity_received, 0) > 0;

  return v_id;
end;
$$;
revoke all on function public.open_receipt_for_order(uuid, receipt_mode, text, date, text) from public, anon;
grant execute on function public.open_receipt_for_order(uuid, receipt_mode, text, date, text) to authenticated;
comment on function public.open_receipt_for_order(uuid, receipt_mode, text, date, text) is
  'Find-or-create ATOMICO della sessione di ricevimento di un ordine (061): advisory lock per ordine; righe dal residuo collegate a order_line_item_id.';

-- =============================================================================
-- 3) complete_purchase_receipt v3
-- =============================================================================
create or replace function public.complete_purchase_receipt(p_receipt_id uuid)
returns receipt_status
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org          uuid;
  v_status       receipt_status;
  v_order        uuid;
  v_supplier     uuid;
  v_user         uuid := auth.uid();
  v_line         record;
  v_oli          record;
  v_delta        numeric(12,4);
  v_before       numeric(12,4);
  v_new_status   receipt_status;
  v_has_partial  boolean := false;
  v_has_discrepancy boolean := false;
  v_has_pending  boolean := false;
  v_posted_any   boolean := false;
  v_order_status order_status;
  v_order_org    uuid;
  v_product_unit unit_of_measure;
  v_product_name text;
  v_factor       numeric;
  v_post_qty     numeric(12,4);
  v_left         numeric;      -- delta ancora da allocare, unità della riga di ricevimento
  v_oli_factor   numeric;      -- unità riga ricevimento → unità riga ordine
  v_residual     numeric;      -- residuo della riga d'ordine, sua unità
  v_take         numeric;      -- quantità allocata alla riga d'ordine, unità riga ricevimento
  v_targets      int;
  v_single_oli   uuid;
  c_eps constant numeric := 0.0001;
begin
  if v_user is null then
    raise exception 'complete_purchase_receipt: utente non autenticato' using errcode = 'P0001';
  end if;

  -- Ordine dei lock (sempre lo stesso, niente deadlock): ricevimento → ordine →
  -- righe d'ordine → righe ricevimento → giacenze.
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

  if v_order is not null then
    select status, organization_id into v_order_status, v_order_org
    from purchase_orders where id = v_order for update;
    if v_order_org is null then
      raise exception 'complete_purchase_receipt: ordine collegato non trovato' using errcode = 'P0044';
    end if;
    if v_order_org is distinct from v_org then
      raise exception 'complete_purchase_receipt: l''ordine collegato appartiene a un''altra organizzazione' using errcode = 'P0045';
    end if;
    if v_order_status = 'received' then
      raise exception 'complete_purchase_receipt: l''ordine collegato risulta già ricevuto a magazzino' using errcode = 'P0041';
    end if;
    if v_order_status = 'cancelled' then
      raise exception 'complete_purchase_receipt: l''ordine collegato è annullato' using errcode = 'P0041';
    end if;
    -- 061: lock di TUTTE le righe d'ordine: il residuo letto sotto è quello vero
    -- anche con un altro completamento concorrente sullo stesso ordine.
    perform 1 from order_line_items where purchase_order_id = v_order for update;
  end if;

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
    continue when v_delta = 0;

    if v_line.product_id is null then
      raise exception 'complete_purchase_receipt: riga "%" senza prodotto associato: risolvi il matching prima di completare',
        v_line.raw_product_name using errcode = 'P0042';
    end if;

    select unit, name into v_product_unit, v_product_name
    from ingredient_products
    where id = v_line.product_id and organization_id = v_org;
    if v_product_unit is null then
      raise exception 'complete_purchase_receipt: il prodotto della riga "%" non appartiene a questa organizzazione',
        v_line.raw_product_name using errcode = 'P0045';
    end if;

    v_factor := unit_conversion_factor(v_line.unit, v_product_unit);
    if v_factor is null then
      raise exception
        'complete_purchase_receipt: unità % della riga "%" incompatibile con il prodotto "%" (unità %)',
        v_line.unit, v_line.raw_product_name, v_product_name, v_product_unit
        using errcode = 'P0212';
    end if;
    v_post_qty := v_delta * v_factor;

    -- ── 061: avanzamento ordine PRIMA del movimento, solo sulla riga target ──
    -- Regola (ADR 002):
    --   * riga collegata (order_line_item_id) → si evade SOLO quella riga;
    --   * riga non collegata con lo stesso prodotto su UNA riga d'ordine →
    --     quella, e il collegamento viene registrato;
    --   * riga non collegata con lo stesso prodotto su PIÙ righe d'ordine →
    --     riempimento deterministico per id fino al residuo di ciascuna;
    --   * prodotto non presente nell'ordine → merce non ordinata: entra a
    --     magazzino senza avanzare l'ordine (la differenza la vede la verifica
    --     documenti);
    --   * eccedenza oltre il residuo → RIFIUTO P0046, nessuna scrittura.
    if v_order is not null then
      v_left := v_delta;
      v_targets := 0;
      v_single_oli := null;
      for v_oli in
        select id, quantity_ordered, coalesce(quantity_received, 0) as received, unit
        from order_line_items
        where purchase_order_id = v_order
          and case when v_line.order_line_item_id is not null
                   then id = v_line.order_line_item_id
                   else ingredient_product_id = v_line.product_id end
        order by id
      loop
        v_targets := v_targets + 1;
        v_single_oli := case when v_targets = 1 then v_oli.id else null end;
        exit when v_left <= c_eps;

        v_oli_factor := unit_conversion_factor(v_line.unit, v_oli.unit);
        if v_oli_factor is null then
          raise exception
            'complete_purchase_receipt: unità % della riga "%" incompatibile con la riga d''ordine (unità %)',
            v_line.unit, v_line.raw_product_name, v_oli.unit using errcode = 'P0212';
        end if;
        v_residual := v_oli.quantity_ordered - v_oli.received;
        continue when v_residual <= c_eps;

        v_take := least(v_left, v_residual / v_oli_factor);
        update order_line_items
        set quantity_received = v_oli.received + v_take * v_oli_factor
        where id = v_oli.id;
        v_left := v_left - v_take;
      end loop;

      if v_targets > 0 and v_left > c_eps then
        raise exception
          'Eccedenza sulla riga "%": ricevuti % % oltre il residuo dell''ordine. Correggi la quantità (o registra la merce extra in un ricevimento senza ordine) — ADR 002.',
          v_line.raw_product_name, round(v_left, 4), v_line.unit using errcode = 'P0046';
      end if;

      -- collegamento registrato quando l'abbinamento è univoco
      if v_line.order_line_item_id is null and v_targets = 1 and v_single_oli is not null then
        update purchase_receipt_lines set order_line_item_id = v_single_oli where id = v_line.id;
      end if;
    end if;

    -- ── Movimento a magazzino (dopo la verifica dell'ordine) ──────────────────
    select current_quantity into v_before
    from inventory_levels
    where organization_id = v_org and ingredient_product_id = v_line.product_id
    for update;
    v_before := coalesce(v_before, 0);

    insert into inventory_movements (
      organization_id, ingredient_product_id, movement_type, quantity_delta,
      unit, reference_type, reference_id, performed_by, qty_before, qty_after, notes
    ) values (
      v_org, v_line.product_id, 'purchase_receipt', v_post_qty,
      v_product_unit, 'purchase_receipt', p_receipt_id, v_user, v_before, v_before + v_post_qty,
      nullif(concat_ws(' · ',
        'riga: ' || v_line.raw_product_name,
        case when v_line.lot_number is not null then 'lotto ' || v_line.lot_number end,
        case when v_factor <> 1 then format('convertito da %s %s', v_delta, v_line.unit) end
      ), '')
    );

    if v_line.expiry_date is not null then
      insert into ingredient_batches (
        organization_id, ingredient_product_id, purchase_order_id, supplier_id,
        lot_number, expiry_date, quantity_received, quantity_remaining, unit,
        receipt_line_id, notes
      ) values (
        v_org, v_line.product_id, v_order, v_supplier,
        v_line.lot_number, v_line.expiry_date, v_post_qty, v_post_qty, v_product_unit,
        v_line.id, 'Da ricevimento ' || p_receipt_id
      );
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
  end loop;

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

  if v_order is not null and v_posted_any then
    if not exists (
      select 1 from order_line_items
      where purchase_order_id = v_order
        and coalesce(quantity_received, 0) < quantity_ordered - c_eps
    ) then
      update purchase_orders set status = 'received' where id = v_order;
      insert into order_status_history (purchase_order_id, from_status, to_status, changed_by, notes)
      values (v_order, v_order_status, 'received', v_user,
              'Ricevuto tramite goods receipt ' || p_receipt_id);
    elsif v_order_status is distinct from 'partial' then
      update purchase_orders set status = 'partial' where id = v_order;
      insert into order_status_history (purchase_order_id, from_status, to_status, changed_by, notes)
      values (v_order, v_order_status, 'partial', v_user,
              'Ricezione parziale tramite goods receipt ' || p_receipt_id);
    end if;
  end if;

  return v_new_status;
end;
$$;

revoke all on function public.complete_purchase_receipt(uuid) from public, anon;
grant execute on function public.complete_purchase_receipt(uuid) to authenticated;

comment on function public.complete_purchase_receipt(uuid) is
  'v3 (061): righe d''ordine bloccate, residuo ricalcolato sotto lock, eccedenza rifiutata (P0046, ADR 002), avanzamento SOLO della riga target e PRIMA del movimento; tenant guard (059); unità prodotto (054). Idempotente per riga via qty_posted.';
