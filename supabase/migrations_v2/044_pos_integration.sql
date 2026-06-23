-- =============================================================================
-- 044_pos_integration.sql  (la spec lo chiama "migration_006_pos"; qui segue la
-- numerazione reale di migrations_v2)
-- R7 — Integrazione POS (cassa → magazzino). Costruita SOPRA il motore vendite
-- esistente (041/042): il webhook POS alimenta lo stesso ingest_sale/reverse_sale
-- (BOM, idempotenza, storno append-only restano lì). Aggiunge SOLO il bordo POS:
--   • product_mappings esteso (pos_item_name, portions_per_unit)
--   • pos_configs   — config provider per org (risoluzione org da merchant/store)
--   • pos_events    — ledger di idempotenza degli eventi grezzi in ingresso
--   • ingest_sale_system / reverse_sale_system — varianti org-esplicite, attore di
--     SISTEMA (no sessione utente): le chiama il webhook con client service-role.
-- ADDITIVE & SAFE: nuove colonne nullable/default, nuove tabelle, nuove funzioni.
-- =============================================================================

-- ── 1) Estendi il crosswalk esistente product_mappings (042) ─────────────────
-- È già "alias POS (external_product_ref) per source → recipe_id". Aggiungiamo il
-- nome POS denormalizzato (display) e le porzioni per unità venduta (1 torta = 8).
alter table product_mappings add column if not exists pos_item_name text;
alter table product_mappings add column if not exists portions_per_unit integer not null default 1
  check (portions_per_unit > 0);

comment on column product_mappings.portions_per_unit is
  'Porzioni per unità POS venduta (es. 1 torta = 8 porzioni). La deduzione scala la quantità venduta per questo fattore.';

-- ── 2) pos_configs — config provider per organizzazione ──────────────────────
create table pos_configs (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references organizations(id) on delete cascade,
  provider          text not null,              -- 'mipos' | 'manual' | future
  api_key_encrypted text,                       -- credenziali outbound (future); HMAC inbound = env
  merchant_code     text,
  store_id          text,
  is_active         boolean not null default true,
  created_at        timestamptz not null default now(),

  constraint pos_configs_provider_check check (char_length(trim(provider)) > 0),
  -- Risoluzione org dal webhook: (provider, store_id) e (provider, merchant_code)
  -- devono essere univoci così l'evento mappa a UNA sola organizzazione.
  constraint pos_configs_store_unique    unique (provider, store_id),
  constraint pos_configs_merchant_unique unique (provider, merchant_code)
);

create index idx_pos_configs_org on pos_configs (organization_id);

comment on table pos_configs is
  'Config POS per organizzazione. Il webhook risolve l''org da (provider, store_id|merchant_code).';

-- ── 3) pos_events — ledger di idempotenza degli eventi in ingresso ───────────
create table pos_events (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references organizations(id) on delete cascade,
  provider            text not null,
  external_receipt_id text not null,
  raw_payload         jsonb not null,
  status              text not null default 'pending',  -- pending|processed|failed|reversed|duplicate
  sale_id             uuid references sales(id) on delete set null,
  unlinked            jsonb,                             -- elenco pos_item_id non collegati
  error_text          text,
  received_at         timestamptz not null default now(),
  processed_at        timestamptz,

  -- IDEMPOTENZA PRIMARIA: stesso scontrino per (org, provider) = un solo evento.
  constraint pos_events_external_unique unique (organization_id, provider, external_receipt_id),
  constraint pos_events_status_check check (status in ('pending', 'processed', 'failed', 'reversed', 'duplicate'))
);

create index idx_pos_events_org on pos_events (organization_id, received_at desc);

comment on table pos_events is
  'Ledger eventi POS grezzi. UNIQUE(org, provider, external_receipt_id) = guard primario di idempotenza (il UNIQUE su sales è il backstop).';

-- ── 4) RLS (org-scoped, come le altre tabelle operative) ─────────────────────
-- Letture UI via sessione (current_organization_id). Scritture dal webhook via
-- client service-role (bypassa RLS) con organization_id ESPLICITO.
alter table pos_configs enable row level security;
alter table pos_events  enable row level security;

create policy pos_configs_select on pos_configs
  for select using (organization_id = current_organization_id());
create policy pos_configs_write on pos_configs
  for all using (organization_id = current_organization_id())
  with check (organization_id = current_organization_id());

create policy pos_events_select on pos_events
  for select using (organization_id = current_organization_id());
create policy pos_events_write on pos_events
  for all using (organization_id = current_organization_id())
  with check (organization_id = current_organization_id());

-- ── 5) ingest_sale_system — variante org-esplicita, attore di sistema ────────
-- Identica a ingest_sale (042) ma: org passata esplicitamente (il webhook non ha
-- sessione → current_organization_id() sarebbe null) e attore = SISTEMA (created_by
-- / performed_by null, colonne nullable). Stessa idempotenza ON CONFLICT, stessi
-- movimenti sale_deduction, stessa atomicità.
create or replace function public.ingest_sale_system(p_org uuid, p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sale    uuid;
  v_line    jsonb;
  v_line_id uuid;
  v_mov     jsonb;
begin
  if p_org is null then
    raise exception 'ingest_sale_system: organizzazione mancante' using errcode = 'P0001';
  end if;

  insert into sales (
    organization_id, external_sale_id, source, sold_at, status,
    total_amount, customer_id, notes, created_by
  )
  values (
    p_org,
    p_payload->>'external_sale_id',
    p_payload->>'source',
    (p_payload->>'sold_at')::timestamptz,
    coalesce((p_payload->>'status')::sale_status, 'processed'),
    nullif(p_payload->>'total_amount', '')::numeric,
    nullif(p_payload->>'customer_id', '')::uuid,
    nullif(p_payload->>'notes', ''),
    null
  )
  on conflict (organization_id, source, external_sale_id) do nothing
  returning id into v_sale;

  -- Idempotenza: già processata → ritorna l'id esistente, niente movimenti.
  if v_sale is null then
    select id into v_sale from sales
    where organization_id = p_org
      and source = p_payload->>'source'
      and external_sale_id = p_payload->>'external_sale_id';
    return v_sale;
  end if;

  for v_line in select * from jsonb_array_elements(coalesce(p_payload->'lines', '[]'::jsonb))
  loop
    insert into sale_lines (
      sale_id, organization_id, external_line_id, external_product_ref,
      product_name_snapshot, recipe_id, quantity, unit_price, status, exception, sort_order
    )
    values (
      v_sale, p_org,
      nullif(v_line->>'external_line_id', ''),
      v_line->>'external_product_ref',
      v_line->>'product_name_snapshot',
      nullif(v_line->>'recipe_id', '')::uuid,
      (v_line->>'quantity')::numeric,
      nullif(v_line->>'unit_price', '')::numeric,
      coalesce((v_line->>'status')::sale_line_status, 'unlinked'),
      nullif(v_line->>'exception', ''),
      coalesce((v_line->>'sort_order')::int, 0)
    )
    returning id into v_line_id;

    for v_mov in select * from jsonb_array_elements(coalesce(v_line->'movements', '[]'::jsonb))
    loop
      insert into inventory_movements (
        organization_id, ingredient_product_id, movement_type, quantity_delta, unit,
        reference_type, reference_id, performed_by
      )
      values (
        p_org,
        (v_mov->>'ingredient_product_id')::uuid,
        'sale_deduction',
        (v_mov->>'quantity_delta')::numeric,
        (v_mov->>'unit')::unit_of_measure,
        'sale_line', v_line_id, null
      );
    end loop;
  end loop;

  return v_sale;
end;
$$;

revoke all on function public.ingest_sale_system(uuid, jsonb) from public, anon, authenticated;
-- Eseguibile solo dal ruolo service_role (webhook). Nessun grant ad authenticated.

comment on function public.ingest_sale_system(uuid, jsonb) is
  'Variante org-esplicita di ingest_sale per il webhook POS (attore di sistema, no sessione). Stessa idempotenza/atomicità.';

-- ── 6) reverse_sale_system — storno org-esplicito, attore di sistema ─────────
create or replace function public.reverse_sale_system(p_org uuid, p_sale_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org    uuid;
  v_status sale_status;
begin
  select organization_id, status into v_org, v_status
  from sales where id = p_sale_id for update;

  if v_org is null then
    raise exception 'reverse_sale_system: vendita non trovata' using errcode = 'P0044';
  end if;
  if v_org is distinct from p_org then
    raise exception 'reverse_sale_system: vendita di un''altra organizzazione' using errcode = 'P0043';
  end if;
  if v_status in ('reversed', 'void') then
    -- Idempotente: già stornata → nessun nuovo movimento.
    return p_sale_id;
  end if;

  insert into inventory_movements (
    organization_id, ingredient_product_id, movement_type, quantity_delta, unit,
    reference_type, reference_id, performed_by
  )
  select m.organization_id, m.ingredient_product_id, 'sale_reversal',
         -m.quantity_delta, m.unit, 'sale_line', m.reference_id, null
  from inventory_movements m
  join sale_lines sl on sl.id = m.reference_id
  where sl.sale_id = p_sale_id
    and m.reference_type = 'sale_line'
    and m.movement_type = 'sale_deduction';

  update sales set status = 'reversed', updated_at = now() where id = p_sale_id;
  return p_sale_id;
end;
$$;

revoke all on function public.reverse_sale_system(uuid, uuid) from public, anon, authenticated;

comment on function public.reverse_sale_system(uuid, uuid) is
  'Variante org-esplicita di reverse_sale per il webhook POS (void/refund). Idempotente, append-only.';
