// =============================================================================
// modules/identity/service.ts
// Business logic per identity: auth + onboarding.
// Non conosce request/response. Chiamato da actions.ts.
// =============================================================================

import { createClient } from '@/lib/supabase/server';
import { AuthError } from '@/lib/errors';
import * as repo from './repository';
import { onboardingSchema, signInSchema, signUpSchema } from './schemas';
import type { UserSession, CreateOrganizationResult } from './types';
import type { SignInInput, SignUpInput, OnboardingInput } from './schemas';

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

  return repo.rpcCreateOrganization(validated);
}
