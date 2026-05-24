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

  // Supabase invia email di conferma; redirect a pagina che lo comunica.
  // Se email confirmation è disabilitata in Supabase → redirect /onboarding diretto.
  redirect('/onboarding');
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

  redirect('/dashboard');
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
  try {
    await service.createOrganization({
      orgName: formData.get('orgName') as string,
      city:    (formData.get('city') as string) || undefined,
      email:   (formData.get('email') as string) || undefined,
    });
  } catch (err) {
    return { status: 'error', error: getErrorMessage(err) };
  }

  revalidatePath('/dashboard');
  redirect('/dashboard');
}
