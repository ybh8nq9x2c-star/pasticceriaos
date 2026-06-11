-- =============================================================================
-- 031_storage_documents.sql
-- Bucket privato per PDF/immagini dei documenti commerciali + storage_path
-- come source of truth (i signed URL scadono, il path no).
-- Path convention: <organization_id>/<document_type>/<timestamp>.<ext>
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'commercial-documents',
  'commercial-documents',
  false,
  10485760, -- 10MB
  array['application/pdf','image/jpeg','image/png','image/webp']
)
on conflict (id) do nothing;

-- Bakery: legge e carica SOLO nella cartella della propria org.
-- NB: i nostri JWT non hanno claim organization_id -> si usa la funzione
-- SECURITY DEFINER current_organization_id() (membership-based).
create policy "cd_storage_read_own_org" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'commercial-documents'
    and (storage.foldername(name))[1] = current_organization_id()::text
  );

create policy "cd_storage_upload_own_org" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'commercial-documents'
    and (storage.foldername(name))[1] = current_organization_id()::text
  );

-- Il portale fornitore carica via service role (filtri espliciti nel codice):
-- nessuna policy anon/authenticated aggiuntiva.

alter table commercial_documents add column if not exists storage_path text;

comment on column commercial_documents.storage_path is
  'Path nel bucket commercial-documents (source of truth). file_url legacy/esterno.';
