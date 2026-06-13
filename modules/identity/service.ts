// =============================================================================
// modules/identity/service.ts
// Business logic per identity: auth + onboarding.
// Non conosce request/response. Chiamato da actions.ts.
// =============================================================================

import { createClient } from '@/lib/supabase/server';
import { AuthError } from '@/lib/errors';
import * as repo from './repository';
import { onboardingSchema, signInSchema, signUpSchema } from './schemas';
import type { UserSession, CreateOrganizationResult, FiscalProfile } from './types';
import type { SignInInput, SignUpInput, OnboardingInput } from './schemas';
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

  const { data, error } = await supabase.auth.signUp({
    email: validated.email,
    password: validated.password,
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
  const fiscal = buildFiscalProfile(validated);
  if (fiscal) {
    try {
      await repo.setOrganizationFiscalProfile(result.organizationId, fiscal);
    } catch (err) {
      console.error('[identity] salvataggio profilo fiscale fallito (org creata comunque)', err);
    }
  }

  return result;
}

/** Costruisce il profilo fiscale dai campi onboarding (null se nessun dato). */
function buildFiscalProfile(input: OnboardingInput): FiscalProfile | null {
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
