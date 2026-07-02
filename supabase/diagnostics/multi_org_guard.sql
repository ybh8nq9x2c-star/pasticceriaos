-- =============================================================================
-- multi_org_guard.sql — guardia operativa per il limite MVP single-org-per-user.
--
-- current_organization_id() (052) è deterministica ma risolve comunque UNA sola
-- org per utente. Finché l'org attiva non vive nel JWT claim, un utente membro
-- di più org opererebbe sempre e solo nella membership più vecchia: le altre
-- org lo vedrebbero come membro ma lui non agirebbe mai nel loro perimetro.
--
-- ESITO ATTESO: 0 righe. Qualsiasi riga = intervento richiesto (rimuovere la
-- membership doppia o accelerare il refactor JWT). Da eseguire periodicamente
-- (staging e prod):
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/diagnostics/multi_org_guard.sql
-- =============================================================================

select
  m.user_id,
  u.email,
  count(*)                                        as org_count,
  array_agg(o.name order by m.created_at)         as orgs,
  array_agg(o.account_type::text order by m.created_at) as account_types,
  (array_agg(o.name order by m.created_at))[1]    as org_effettiva  -- quella scelta da current_organization_id()
from org_members m
join organizations o on o.id = m.organization_id
left join auth.users u on u.id = m.user_id
group by m.user_id, u.email
having count(*) > 1;
