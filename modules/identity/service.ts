// =============================================================================
// modules/identity/service.ts
// Business logic per identity: auth + onboarding.
// Non conosce request/response. Chiamato da actions.ts.
// =============================================================================

import { createClient } from '@/lib/supabase/server';
import { AuthError } from '@/lib/errors';
import * as repo from './repository';
import { fiscalProfileSchema, onboardingSchema, signInSchema, signUpSchema } from './schemas';
import type { UserSession, CreateOrganizationResult, FiscalProfile } from './types';
import type { SignInInput, SignUpInput, OnboardingInput, FiscalProfileInput } from './schemas';
import {
  getVatLookupProvider,
  normalizeLegalForm,
  validateVat,
  type FiscalDataSource,
  type LegalForm,
} from './vat';

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export async function signUp(input: SignUpInput): Promise<{ userId: string }> {
  const validated = signUpSchema.parse(input);
  const supabase = await createClient();

  // Link di conferma → la nostra route robusta /auth/confirm (mai 500).
  // emailRedirectTo richiede che l'URL sia nelle Redirect URLs del progetto Supabase.
  const base = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/+$/, '');

  const { data, error } = await supabase.auth.signUp({
    email: validated.email,
    password: validated.password,
    options: base ? { emailRedirectTo: `${base}/auth/confirm?next=/onboarding` } : undefined,
  });

  if (error) throw new AuthError(error.message);
  if (!data.user) throw new AuthError('Signup fallito: nessun utente restituito');

  return { userId: data.user.id };
}

export async function signIn(input: SignInInput): Promise<{ userId: string }> {
  const validated = signInSchema.parse(input);
  const supabase = await createClient();

  const { data, error } = await supabase.auth.signInWithPassword({
    email: validated.email,
    password: validated.password,
  });

  if (error) throw new AuthError('Credenziali non valide');
  if (!data.user) throw new AuthError('Login fallito');

  return { userId: data.user.id };
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.auth.signOut();
  if (error) throw new AuthError(error.message);
}

// ---------------------------------------------------------------------------
// Session
// ---------------------------------------------------------------------------

/**
 * Restituisce la sessione utente arricchita con organizzazione e ruolo.
 * Lancia AuthError se l'utente non è autenticato o non ha un'organizzazione.
 */
export async function requireSession(): Promise<UserSession> {
  const supabase = await createClient();

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) throw new AuthError();

  const member = await repo.getMemberForCurrentUser();
  if (!member) throw new AuthError('Nessuna organizzazione associata. Completa l\'onboarding.');

  const org = await repo.getOrganizationById(member.organizationId);
  if (!org) throw new AuthError('Organizzazione non trovata');

  return {
    userId:           user.id,
    email:            user.email ?? '',
    organizationId:   member.organizationId,
    organizationName: org.name,
    role:             member.role,
  };
}

/**
 * Restituisce solo l'organization_id dell'utente corrente.
 * Versione leggera da usare nei service degli altri moduli.
 * Lancia AuthError se non autenticato o senza organizzazione.
 */
export async function requireOrgId(): Promise<string> {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new AuthError();

  const member = await repo.getMemberForCurrentUser();
  if (!member) throw new AuthError('Completa l\'onboarding prima di continuare.');

  return member.organizationId;
}

// ---------------------------------------------------------------------------
// Onboarding
// ---------------------------------------------------------------------------

export async function createOrganization(
  input: OnboardingInput,
): Promise<CreateOrganizationResult> {
  const validated = onboardingSchema.parse(input);

  // Verifica che l'utente sia autenticato prima di chiamare la RPC
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new AuthError();

  const result = await repo.rpcCreateOrganization(validated);

  // Profilo fiscale: BEST-EFFORT. Non deve MAI bloccare la creazione account
  // (anche se 038 non fosse ancora applicata, l'onboarding deve riuscire).
  const fiscal = computeFiscalProfile(validated);
  if (fiscal) {
    try {
      await repo.setOrganizationFiscalProfile(result.organizationId, fiscal);
    } catch (err) {
      console.error('[identity] salvataggio profilo fiscale fallito (org creata comunque)', err);
    }
  }

  return result;
}

/** Profilo fiscale "vuoto" (reset coerente quando l'utente cancella tutti i campi). */
const EMPTY_FISCAL_PROFILE: FiscalProfile = {
  vatNumber: null,
  vatCountry: 'IT',
  legalName: null,
  legalForm: null,
  fiscalDataSource: null,
  vatValidatedAt: null,
  billingEligible: false,
};

/** Campi fiscali grezzi condivisi da onboarding e settings. */
type FiscalInput = {
  vatNumber?: string;
  vatCountry?: string;
  legalName?: string;
  legalForm?: string;
};

/**
 * Calcola il profilo fiscale dai campi grezzi (null se nessun dato). Logica
 * UNICA per onboarding e settings: P.IVA valida (checksum) → verificata +
 * idonea; denominazione/forma manuali → source 'manual'. Non attiva fatturazione.
 */
function computeFiscalProfile(input: FiscalInput): FiscalProfile | null {
  const hasAny = input.vatNumber || input.legalName || input.legalForm;
  if (!hasAny) return null;

  const v = input.vatNumber ? validateVat(input.vatNumber) : null;
  const valid = v?.ok ?? false;
  // In V1 i dati azienda sono manuali: source 'manual' solo se l'utente li ha messi.
  const source: FiscalDataSource | null = input.legalName || input.legalForm ? 'manual' : null;

  return {
    vatNumber: v ? (v.country === 'IT' ? v.number : v.formatted) : null,
    vatCountry: v?.country ?? input.vatCountry ?? 'IT',
    legalName: input.legalName || null,
    legalForm: normalizeLegalForm(input.legalForm),
    fiscalDataSource: source,
    vatValidatedAt: valid ? new Date().toISOString() : null,
    // Idoneità (predisposizione), NON attivazione: solo se la P.IVA è valida.
    billingEligible: valid,
  };
}

export interface VerifyVatResult {
  valid: boolean;
  formatted: string;
  reason?: string;
  /** In V1 sempre null (lookup manuale); pronto per un provider futuro. */
  company: { legalName: string | null; legalForm: LegalForm | null } | null;
  source: FiscalDataSource;
}

/**
 * Verifica una P.IVA durante l'onboarding: checksum offline + (se configurato in
 * futuro) company-lookup via provider. Non tocca dati: richiede solo utente autenticato.
 */
export async function verifyVat(rawVat: string): Promise<VerifyVatResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new AuthError();

  const v = validateVat(rawVat);
  if (!v.ok) {
    return { valid: false, formatted: v.formatted, reason: v.reason, company: null, source: 'manual' };
  }

  const provider = getVatLookupProvider();
  const lookup = await provider.lookup(v.number, v.country); // V1: no-op → company null
  return { valid: true, formatted: v.formatted, company: lookup.company, source: lookup.source };
}

// ---------------------------------------------------------------------------
// Profilo fiscale (lettura/modifica da /settings)
// ---------------------------------------------------------------------------

/** Profilo fiscale dell'organizzazione corrente (colonne 038). */
export async function getFiscalProfile(): Promise<FiscalProfile> {
  const orgId = await requireOrgId();
  return repo.getFiscalProfile(orgId);
}

/**
 * Aggiorna il profilo fiscale (solo colonne fiscali, non distruttivo sul resto).
 * Ricalcola verifica/idoneità dalla P.IVA. RLS: solo l'owner (organizations_update).
 */
export async function updateFiscalProfile(raw: unknown): Promise<FiscalProfile> {
  const orgId = await requireOrgId();
  const input: FiscalProfileInput = fiscalProfileSchema.parse(raw);
  const profile = computeFiscalProfile(input) ?? EMPTY_FISCAL_PROFILE;
  await repo.setOrganizationFiscalProfile(orgId, profile);
  return profile;
}
