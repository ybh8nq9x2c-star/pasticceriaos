// =============================================================================
// lib/workspace-gate.ts — decisione PURA del workspace gating (P0-F).
//
// Prima il fail-open era totale: se la RPC current_account_type falliva, il
// middleware saltava il gating in ENTRAMBE le direzioni. Ora la degradazione è
// asimmetrica e sicura:
//   • tipo NON risolto + rotta bakery   → allow (default dell'app è customer;
//     i guard di layout + RLS restano fail-closed: al massimo un redirect dopo)
//   • tipo NON risolto + rotta /supplier → MAI di là senza tipo confermato:
//     redirect a /unauthorized (nessun leak: il fetch dati è dopo i guard, ma
//     il perimetro supplier non si attraversa "per errore di rete").
// Pura = unit-testabile sui failure mode senza montare il middleware.
// =============================================================================

export type WorkspaceAccountType = 'customer' | 'supplier';

export interface GateInput {
  pathname: string;
  accountType: WorkspaceAccountType | null;
  /** true solo se la RPC ha risposto senza errore. */
  accountTypeKnown: boolean;
}

export type GateDecision =
  | { action: 'allow' }
  | { action: 'redirect'; to: string };

export const SUPPLIER_PREFIX = '/supplier';

export function isSupplierPath(pathname: string): boolean {
  return pathname === SUPPLIER_PREFIX || pathname.startsWith(SUPPLIER_PREFIX + '/');
}

export function gateWorkspace({ pathname, accountType, accountTypeKnown }: GateInput): GateDecision {
  const supplierRoute = isSupplierPath(pathname);

  if (accountTypeKnown) {
    if (accountType === 'supplier' && !supplierRoute) {
      return { action: 'redirect', to: SUPPLIER_PREFIX };
    }
    if (accountType !== 'supplier' && supplierRoute) {
      return { action: 'redirect', to: '/dashboard' };
    }
    return { action: 'allow' };
  }

  // Tipo NON risolto (RPC fallita): degradazione sicura, mai allargamento.
  if (supplierRoute) {
    return { action: 'redirect', to: '/unauthorized?from=supplier' };
  }
  return { action: 'allow' };
}
