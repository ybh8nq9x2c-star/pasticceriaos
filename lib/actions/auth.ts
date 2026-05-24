// =============================================================================
// lib/actions/auth.ts — STUB (codice legacy, non usato nel nuovo flusso)
// Le nuove azioni auth sono in modules/identity/actions.ts
// =============================================================================

'use server';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function signUpAction(_: any, __: any): Promise<never> {
  throw new Error('Usa modules/identity/actions invece');
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function signInAction(_: any, __: any): Promise<never> {
  throw new Error('Usa modules/identity/actions invece');
}

export async function signOutAction(): Promise<never> {
  throw new Error('Usa modules/identity/actions invece');
}
