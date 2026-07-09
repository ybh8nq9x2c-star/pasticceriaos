-- =============================================================================
-- 057_connect_bridges_anagrafica.sql
-- Rende il fornitore collegato via BakeryOS FIRST-CLASS nell'anagrafica locale
-- già al momento del collegamento (non solo alla prima consegna).
--
-- Contesto: connect_supplier_by_key_hash (015) creava SOLO la relazione cross-org
-- supplier_customer_connections; l'anagrafica locale (suppliers.supplier_org_id)
-- veniva creata pigramente da receive_marketplace_order (023), quindi un fornitore
-- appena collegato non compariva né in /suppliers né nella creazione ordine.
--
-- Questa migration:
--   1) estende connect_supplier_by_key_hash: dopo l'upsert della connessione,
--      upserta l'anagrafica locale (idempotente sull'indice parziale
--      uq_suppliers_org_supplier_org), così il canale "BakeryOS interno" è subito
--      leggibile e ordinabile.
--   2) backfill: ogni connessione ATTIVA priva di anagrafica ne riceve una ora.
--
-- Nessun nuovo schema: riusa suppliers.supplier_org_id e l'indice unico esistenti.
-- La funzione resta SECURITY DEFINER: RLS e trigger restano il confine reale.
-- =============================================================================

create or replace function public.connect_supplier_by_key_hash(p_key_hash text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer_org uuid;
  v_supplier_org uuid;
  v_key_id       uuid;
  v_conn_id      uuid;
begin
  if public.current_account_type() is distinct from 'customer' then
    raise exception 'solo un account cliente può collegare un fornitore' using errcode = 'P0300';
  end if;

  v_customer_org := public.current_organization_id();
  if v_customer_org is null then
    raise exception 'organizzazione non trovata' using errcode = 'P0301';
  end if;

  select k.id, k.supplier_org_id into v_key_id, v_supplier_org
  from supplier_connection_keys k
  where k.key_hash = p_key_hash and k.is_active = true
  limit 1;

  if v_key_id is null then
    raise exception 'chiave fornitore non valida o revocata' using errcode = 'P0302';
  end if;
  if v_supplier_org = v_customer_org then
    raise exception 'non puoi collegarti alla tua stessa organizzazione' using errcode = 'P0303';
  end if;

  -- upsert: reconnecting after a revoke reactivates the same canonical row.
  insert into supplier_customer_connections
    (supplier_org_id, customer_org_id, connection_key_id, status, created_by)
  values (v_supplier_org, v_customer_org, v_key_id, 'active', auth.uid())
  on conflict (supplier_org_id, customer_org_id)
  do update set status = 'active',
               connection_key_id = excluded.connection_key_id,
               revoked_at = null,
               revoked_by = null
  returning id into v_conn_id;

  -- Bridge anagrafica: il fornitore collegato diventa subito first-class in
  -- suppliers (canale BakeryOS interno leggibile e ordinabile senza aspettare una
  -- consegna). Idempotente sull'indice parziale uq_suppliers_org_supplier_org.
  insert into suppliers (organization_id, supplier_org_id, name, email, notes)
  select v_customer_org, v_supplier_org,
         coalesce(o.name, 'Fornitore marketplace'),
         coalesce(o.email, 'ordini+' || coalesce(o.slug, 'fornitore') || '@marketplace.local'),
         'Collegato via BakeryOS.'
  from organizations o
  where o.id = v_supplier_org
  on conflict (organization_id, supplier_org_id) where supplier_org_id is not null
  do nothing;

  -- audit on both sides for traceability.
  insert into audit_logs (org_id, actor_user_id, action, entity_type, entity_id, metadata)
  values
    (v_customer_org, auth.uid(), 'connection.created', 'connection', v_conn_id,
       jsonb_build_object('supplier_org_id', v_supplier_org, 'key_id', v_key_id)),
    (v_supplier_org, auth.uid(), 'connection.received', 'connection', v_conn_id,
       jsonb_build_object('customer_org_id', v_customer_org, 'key_id', v_key_id));

  return v_conn_id;
end;
$$;
revoke all on function public.connect_supplier_by_key_hash(text) from public;
grant execute on function public.connect_supplier_by_key_hash(text) to authenticated;

-- ── Backfill: connessioni attive già esistenti senza anagrafica locale ───────
insert into suppliers (organization_id, supplier_org_id, name, email, notes)
select c.customer_org_id, c.supplier_org_id,
       coalesce(o.name, 'Fornitore marketplace'),
       coalesce(o.email, 'ordini+' || coalesce(o.slug, 'fornitore') || '@marketplace.local'),
       'Collegato via BakeryOS.'
from supplier_customer_connections c
join organizations o on o.id = c.supplier_org_id
where c.status = 'active'
on conflict (organization_id, supplier_org_id) where supplier_org_id is not null
do nothing;
