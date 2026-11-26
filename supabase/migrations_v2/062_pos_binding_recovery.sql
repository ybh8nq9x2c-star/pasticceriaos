-- =============================================================================
-- 062_pos_binding_recovery.sql  (W5 — REMEDIATION_REPORT.md, ADR 003)
-- POS MiPOS: binding cassa↔tenant verificato + eventi recuperabili.
--
-- 1) SEGRETO PER CONFIGURAZIONE (chiude il limite del MIPOS_WEBHOOK_SECRET globale)
--    Il segreto HMAC di una cassa è DERIVATO lato server:
--        secret = HMAC-SHA256(POS_WEBHOOK_MASTER_SECRET, "bakeryos-pos:v1:<provider>:<config_id>:<version>")
--    → nel DB non c'è materiale segreto: solo lo schema e la versione (rotazione
--    = version+1). Il segreto di un tenant non permette di firmare per un altro.
--    Le config ESISTENTI restano su 'legacy_global' (continuano a funzionare con
--    MIPOS_WEBHOOK_SECRET) finché non si ruota: la rotazione le porta a 'derived'.
--    Il client NON può scegliere lo schema né toccare versione/verifica
--    (privilegi di colonna): 'legacy_global' non è selezionabile da un tenant.
--    verified_at = prima ricevuta firmata con il segreto di QUELLA config
--    (prova di possesso: solo l'org lo ha visto nel wizard).
--
-- 2) STATI ESPLICITI DEGLI EVENTI: received → processed | reversed | failed.
--    'pending' (044) diventa 'received'. Un reinvio di un evento NON terminale
--    (received/failed) viene riprocessato, non scartato come duplicato.
-- =============================================================================

-- ── 1) pos_configs: schema del segreto, versione, verifica ────────────────────
alter table pos_configs add column if not exists secret_scheme text;
alter table pos_configs add column if not exists secret_version integer not null default 1;
alter table pos_configs add column if not exists verified_at timestamptz;

-- config pre-062 → legacy (non rompere il cliente già collegato); nuove → derived
update pos_configs set secret_scheme = 'legacy_global' where secret_scheme is null;
alter table pos_configs alter column secret_scheme set default 'derived';
alter table pos_configs alter column secret_scheme set not null;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'pos_configs_secret_scheme_check') then
    alter table pos_configs add constraint pos_configs_secret_scheme_check
      check (secret_scheme in ('derived', 'legacy_global'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'pos_configs_secret_version_check') then
    alter table pos_configs add constraint pos_configs_secret_version_check check (secret_version > 0);
  end if;
end $$;

comment on column pos_configs.secret_scheme is
  'derived = segreto HMAC derivato per config (062, consigliato); legacy_global = MIPOS_WEBHOOK_SECRET condiviso (solo config pre-062, da ruotare).';
comment on column pos_configs.secret_version is 'Versione del segreto derivato: la rotazione la incrementa e invalida il precedente.';
comment on column pos_configs.verified_at is 'Prima ricevuta firmata con il segreto di questa config (prova di possesso). Scritta solo dal webhook (service role).';

-- Privilegi di colonna: il tenant gestisce store/merchant/attivazione, NON lo
-- schema del segreto, la versione o la verifica.
revoke insert, update on public.pos_configs from anon, authenticated;
grant insert (organization_id, provider, merchant_code, store_id, is_active, api_key_encrypted)
  on public.pos_configs to authenticated;
grant update (provider, merchant_code, store_id, is_active, api_key_encrypted)
  on public.pos_configs to authenticated;

-- Rotazione: unica via per cambiare segreto (e per uscire da legacy_global).
create or replace function public.rotate_pos_webhook_secret(p_config_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org     uuid := public.current_organization_id();
  v_role    org_role;
  v_cfg_org uuid;
  v_version integer;
begin
  if auth.uid() is null then
    raise exception 'rotate_pos_webhook_secret: utente non autenticato' using errcode = 'P0001';
  end if;
  v_role := public.current_org_role();
  if v_role is null or v_role = 'viewer' then
    raise exception 'Non hai i permessi per gestire l''integrazione POS.' using errcode = 'P0050';
  end if;

  select organization_id into v_cfg_org from pos_configs where id = p_config_id for update;
  if v_cfg_org is null or v_cfg_org is distinct from v_org then
    raise exception 'Configurazione POS non trovata.' using errcode = 'P0044';
  end if;

  update pos_configs
  set secret_scheme = 'derived',
      secret_version = secret_version + 1,
      verified_at = null
  where id = p_config_id
  returning secret_version into v_version;
  return v_version;
end;
$$;
revoke all on function public.rotate_pos_webhook_secret(uuid) from public, anon;
grant execute on function public.rotate_pos_webhook_secret(uuid) to authenticated;
comment on function public.rotate_pos_webhook_secret(uuid) is
  'Ruota il segreto HMAC derivato di una config POS (062): version+1, verifica azzerata, schema derived.';

-- ── 2) pos_events: stati espliciti ────────────────────────────────────────────
alter table pos_events drop constraint if exists pos_events_status_check;
update pos_events set status = 'received' where status = 'pending';
alter table pos_events alter column status set default 'received';
alter table pos_events add constraint pos_events_status_check
  check (status in ('received', 'processed', 'reversed', 'failed', 'duplicate'));

comment on column pos_events.status is
  'received (scritto, non ancora elaborato) → processed | reversed (terminali) | failed (recuperabile). Un reinvio di received/failed viene RIPROCESSATO (062).';
