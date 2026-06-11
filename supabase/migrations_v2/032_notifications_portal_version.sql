-- =============================================================================
-- 032_notifications_portal_version.sql
-- 1) notifications: canale in-app per alert (scadenze cron, conferme portale).
--    INSERT solo via service role (nessuna policy insert per authenticated):
--    le notifiche sono di sistema, non auto-prodotte dagli utenti.
-- 2) suppliers.portal_token_version: revoca dei link portale JWT senza stato
--    lato server — rigenerare il link incrementa la versione e invalida i vecchi.
-- =============================================================================

create table notifications (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  type            text not null default 'info' check (type in ('info','warn','error')),
  title           text not null,
  message         text,
  href            text,
  read            boolean not null default false,
  created_at      timestamptz not null default now()
);

create index idx_notifications_org_unread
  on notifications (organization_id, read, created_at desc)
  where read = false;

alter table notifications enable row level security;

create policy notifications_select on notifications
  for select using (organization_id = current_organization_id());
create policy notifications_mark_read on notifications
  for update using (organization_id = current_organization_id())
  with check (organization_id = current_organization_id());

alter table suppliers add column if not exists portal_token_version int not null default 1;

comment on column suppliers.portal_token_version is
  'Versione del token portale. Inclusa nel JWT: rigenerare il link la incrementa e revoca i token precedenti.';
