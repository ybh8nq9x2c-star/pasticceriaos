// =============================================================================
// lib/actions/auth.ts — STUB (codice legacy, non usato nel nuovo flusso)
// Le nuove azioni auth sono in modules/identity/actions.ts.
// Export names match the legacy importers (app/(auth)/sign-in, sign-up,
// components/cliente|fornitore sidebars) so they resolve to a defined function
// instead of `undefined` (which crashed prerender via useFormState). They throw
// only if actually invoked; the active flow uses modules/identity/actions.
// =============================================================================

'use server';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function signUp(_: any, __: any): Promise<never> {
  throw new Error('Usa modules/identity/actions invece');
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function signIn(_: any, __: any): Promise<never> {
  throw new Error('Usa modules/identity/actions invece');
}

export async function signOut(): Promise<never> {
  throw new Error('Usa modules/identity/actions invece');
}
