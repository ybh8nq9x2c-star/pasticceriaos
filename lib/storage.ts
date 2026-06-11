// =============================================================================
// lib/storage.ts
// Upload/lettura documenti commerciali su Supabase Storage.
// Lato bakery usa il client UTENTE: le policy storage (031) vincolano la
// cartella alla propria org via current_organization_id(). Il portale
// fornitore usa il client admin nel proprio service (filtri espliciti).
// Si salva SEMPRE storage_path (i signed URL scadono).
// =============================================================================

import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { BusinessRuleError } from '@/lib/errors';
import type { DocumentType } from '@/lib/database.types';

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10MB (allineato al bucket)
const ALLOWED_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];

function bucket(): string {
  return process.env.SUPABASE_STORAGE_BUCKET ?? 'commercial-documents';
}

export async function uploadCommercialDocument(
  file: File,
  organizationId: string,
  documentType: DocumentType,
): Promise<string> {
  if (file.size === 0) throw new BusinessRuleError('Il file è vuoto.');
  if (file.size > MAX_FILE_BYTES) throw new BusinessRuleError('File troppo grande (max 10MB).');
  if (file.type && !ALLOWED_TYPES.includes(file.type)) {
    throw new BusinessRuleError('Formato non supportato: usa PDF o immagine (JPG/PNG/WebP).');
  }

  const supabase = await createClient();
  const ext = (file.name.split('.').pop() ?? 'pdf').toLowerCase().replace(/[^a-z0-9]/g, '') || 'pdf';
  const path = `${organizationId}/${documentType}/${Date.now()}.${ext}`;

  const { error } = await supabase.storage
    .from(bucket())
    .upload(path, file, { contentType: file.type || 'application/pdf', upsert: false });
  if (error) throw new BusinessRuleError(`Upload fallito: ${error.message}`);

  return path; // source of truth: il path, mai il signed URL
}

export async function getDocumentSignedUrl(path: string, expiresInSeconds = 3600): Promise<string> {
  const supabase = await createClient();
  const { data, error } = await supabase.storage
    .from(bucket())
    .createSignedUrl(path, expiresInSeconds);
  if (error || !data?.signedUrl) {
    throw new BusinessRuleError(`Impossibile generare il link al file: ${error?.message ?? 'errore sconosciuto'}`);
  }
  return data.signedUrl;
}
