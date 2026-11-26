-- =============================================================================
-- 00_storage_stub.sql — SOLO per DB di test (CI / scripts/db/local.sh). MAI in prod.
-- Su Supabase hosted le tabelle storage.* le crea il servizio Storage, non il DB:
-- un Postgres "nudo" (supabase/postgres, `supabase db start`) ha lo schema storage
-- ma non le tabelle. La 031 inserisce un bucket e crea policy su storage.objects:
-- qui creiamo il minimo indispensabile, con la stessa forma delle tabelle reali.
-- Idempotente: se le tabelle esistono già (es. stack Supabase completo) non fa nulla.
-- =============================================================================
create schema if not exists storage;

create table if not exists storage.buckets (
  id                 text primary key,
  name               text not null,
  owner              uuid,
  public             boolean default false,
  avif_autodetection boolean default false,
  file_size_limit    bigint,
  allowed_mime_types text[],
  created_at         timestamptz default now(),
  updated_at         timestamptz default now()
);

create table if not exists storage.objects (
  id               uuid primary key default gen_random_uuid(),
  bucket_id        text references storage.buckets(id),
  name             text,
  owner            uuid,
  metadata         jsonb,
  created_at       timestamptz default now(),
  updated_at       timestamptz default now(),
  last_accessed_at timestamptz default now()
);
alter table storage.objects enable row level security;

create or replace function storage.foldername(name text)
returns text[]
language sql
immutable
as $$
  select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1];
$$;

-- Privilegi come su Supabase hosted: `postgres` gestisce bucket e policy di
-- storage.objects (la 031 li crea), i ruoli API possono usare lo schema.
-- Solo test: l'owner `postgres` replica il fatto che lì le policy le crea lui.
alter table storage.buckets owner to postgres;
alter table storage.objects owner to postgres;
grant usage on schema storage to postgres, anon, authenticated, service_role;
grant all on all tables in schema storage to postgres, service_role;
grant select, insert on storage.objects to authenticated;
grant execute on function storage.foldername(text) to postgres, anon, authenticated, service_role;
