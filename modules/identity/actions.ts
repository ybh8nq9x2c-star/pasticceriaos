// =============================================================================
// modules/identity/actions.ts
// Server Actions per auth e onboarding.
// Thin: validazione Zod → service → redirect/ActionState.
// =============================================================================

'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { getErrorMessage } from '@/lib/errors';
import type { ActionState } from '@/lib/utils';
import * as service from './service';
import type { VerifyVatResult } from './service';
import type { FiscalProfile } from './types';

// ---------------------------------------------------------------------------
// Sign Up
// Input: FormData { email, password }
// Flusso: signup Supabase → redirect /onboarding
// ---------------------------------------------------------------------------
export async function signUpAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await service.signUp({
      email:    formData.get('email') as string,
      password: formData.get('password') as string,
    });
  } catch (err) {
    return { status: 'error', error: getErrorMessage(err) };
  }

  // Con email confirmation attiva l'utente NON ha ancora sessione: mostriamo lo
  // stato "controlla la mail" (niente redirect a /onboarding che rimbalzerebbe a
  // /login). La sessione nasce dal link → /auth/confirm.
  return {
    status: 'success',
    message: 'Account creato! Ti abbiamo inviato un\'email di conferma: aprila e poi accedi.',
  };
}

// ---------------------------------------------------------------------------
// Sign In
// Input: FormData { email, password }
// Flusso: login → redirect /dashboard (il middleware gestisce /onboarding se no org)
// ---------------------------------------------------------------------------
export async function signInAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await service.signIn({
      email:    formData.get('email') as string,
      password: formData.get('password') as string,
    });
  } catch (err) {
    return { status: 'error', error: getErrorMessage(err) };
  }

  // Honor il deep-link `next` (impostato dal middleware), altrimenti '/' →
  // il middleware smista a /dashboard o /supplier secondo account_type (1 hop).
  const next = formData.get('next');
  const dest = typeof next === 'string' && next.startsWith('/') && !next.startsWith('//') ? next : '/';
  redirect(dest);
}

// ---------------------------------------------------------------------------
// Sign Out
// Nessun input. Flusso: logout → redirect /login
// ---------------------------------------------------------------------------
export async function signOutAction(): Promise<void> {
  await service.signOut();
  redirect('/login');
}

// ---------------------------------------------------------------------------
// Onboarding: crea organizzazione
// Input: FormData { orgName, city?, email? }
// Flusso: RPC create_organization → redirect /dashboard
// ---------------------------------------------------------------------------
export async function createOrganizationAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const accountType = formData.get('accountType') === 'supplier' ? 'supplier' : 'customer';
  try {
    await service.createOrganization({
      orgName:     formData.get('orgName') as string,
      city:        (formData.get('city') as string) || undefined,
      email:       (formData.get('email') as string) || undefined,
      accountType,
      // Profilo fiscale (opzionale): salvato best-effort dal service.
      vatNumber:  (formData.get('vatNumber') as string) || undefined,
      vatCountry: (formData.get('vatCountry') as string) || undefined,
      legalName:  (formData.get('legalName') as string) || undefined,
      legalForm:  (formData.get('legalForm') as string) || undefined,
    });
  } catch (err) {
    return { status: 'error', error: getErrorMessage(err) };
  }

  const home = accountType === 'supplier' ? '/supplier' : '/dashboard';
  revalidatePath(home);
  redirect(home);
}

// ---------------------------------------------------------------------------
// Onboarding: verifica P.IVA (checksum offline; lookup esterno futuro)
// Input: FormData { vat }
// ---------------------------------------------------------------------------
export type VerifyVatState = ActionState & { vat?: VerifyVatResult };

export async function verifyVatAction(
  _prev: VerifyVatState,
  formData: FormData,
): Promise<VerifyVatState> {
  try {
    const vat = await service.verifyVat(String(formData.get('vat') ?? ''));
    if (!vat.valid) return { status: 'error', error: vat.reason ?? 'P.IVA non valida.', vat };
    return { status: 'success', vat };
  } catch (err) {
    return { status: 'error', error: getErrorMessage(err) };
  }
}

// ---------------------------------------------------------------------------
// Settings: aggiorna profilo fiscale (solo owner, via RLS organizations_update)
// Input: FormData { vatNumber?, vatCountry?, legalName?, legalForm? }
// ---------------------------------------------------------------------------
export type FiscalProfileState = ActionState & { profile?: FiscalProfile };

export async function updateFiscalProfileAction(
  _prev: FiscalProfileState,
  formData: FormData,
): Promise<FiscalProfileState> {
  try {
    const profile = await service.updateFiscalProfile({
      vatNumber:  (formData.get('vatNumber') as string) || undefined,
      vatCountry: (formData.get('vatCountry') as string) || undefined,
      legalName:  (formData.get('legalName') as string) || undefined,
      legalForm:  (formData.get('legalForm') as string) || undefined,
    });
    revalidatePath('/settings');
    return { status: 'success', message: 'Profilo fiscale aggiornato.', profile };
  } catch (err) {
    return { status: 'error', error: getErrorMessage(err) };
  }
}
