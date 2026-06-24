-- =============================================================================
-- 045_production_week_template.sql
-- "Settimana tipo" di produzione (template settimanale → default; piano giornaliero
-- → override). UNA sola tabella: le righe del template raggruppate per giorno della
-- settimana. NESSUN header, nessun flag sui piani, niente RRULE/calendari.
--
-- Il template NON è una source of truth operativa: un applicatore (lato app) riusa
-- insertPlan per CREARE i production_plans MANCANTI dei prossimi giorni. I piani
-- esistenti (modifica manuale / completati) NON vengono toccati — la sicurezza è il
-- UNIQUE(org, plan_date) già presente su production_plans. Nessun effetto su
-- inventory: i movimenti restano legati alla chiusura del piano giornaliero.
-- ADDITIVE & SAFE: solo una nuova tabella + RLS.
-- =============================================================================

create table production_template_items (
  id               uuid    primary key default gen_random_uuid(),
  organization_id  uuid    not null references organizations(id) on delete cascade,
  weekday          smallint not null check (weekday between 0 and 6), -- 0=domenica … 6=sabato (JS Date.getDay())
  recipe_id        uuid    not null references recipes(id) on delete cascade,
  batch_count      integer not null check (batch_count > 0),
  sort_order       integer not null default 0,
  created_at       timestamptz not null default now(),

  -- Una sola riga per (giorno, ricetta): niente duplicati nel template.
  constraint production_template_weekday_recipe_key unique (organization_id, weekday, recipe_id)
);

create index idx_production_template_org on production_template_items (organization_id, weekday, sort_order);

comment on table production_template_items is
  'Settimana tipo di produzione: righe ricetta+batch per giorno della settimana (0=dom..6=sab). Template/default; i piani giornalieri restano la source of truth operativa.';

-- RLS org-scoped (come le altre tabelle operative).
alter table production_template_items enable row level security;

create policy production_template_select on production_template_items
  for select using (organization_id = current_organization_id());
create policy production_template_write on production_template_items
  for all using (organization_id = current_organization_id())
  with check (organization_id = current_organization_id());
