-- =============================================================================
-- 01_auth_gotrue_helpers.sql — SOLO per DB di test. MAI in prod.
-- L'immagine supabase/postgres include auth.uid()/auth.role() nella forma
-- storica (legge solo `request.jwt.claim.sub`). Su Supabase hosted è GoTrue
-- (servizio Auth) a ridefinirle per leggere anche `request.jwt.claims`, che è
-- ciò che PostgREST imposta oggi e che i test SQL usano. Qui replichiamo la
-- definizione corrente di GoTrue, così il DB di test si comporta come prod.
-- =============================================================================
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid;
$$;

create or replace function auth.role()
returns text
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
  )::text;
$$;

create or replace function auth.jwt()
returns jsonb
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')
  )::jsonb;
$$;
