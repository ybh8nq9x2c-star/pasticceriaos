// =============================================================================
// workspace-gate.test.ts — i FAILURE MODE del gating (P0-F): la degradazione
// non deve MAI allargare l'accesso al perimetro supplier.
// =============================================================================

import { describe, expect, it } from 'vitest';
import { gateWorkspace } from '../workspace-gate';

describe('gateWorkspace — tipo risolto (comportamento storico invariato)', () => {
  it('supplier fuori dal suo workspace → redirect a /supplier', () => {
    expect(gateWorkspace({ pathname: '/dashboard', accountType: 'supplier', accountTypeKnown: true }))
      .toEqual({ action: 'redirect', to: '/supplier' });
  });

  it('customer su rotta supplier → redirect a /dashboard', () => {
    expect(gateWorkspace({ pathname: '/supplier/orders', accountType: 'customer', accountTypeKnown: true }))
      .toEqual({ action: 'redirect', to: '/dashboard' });
  });

  it('ognuno a casa propria → allow', () => {
    expect(gateWorkspace({ pathname: '/inventory', accountType: 'customer', accountTypeKnown: true }).action).toBe('allow');
    expect(gateWorkspace({ pathname: '/supplier', accountType: 'supplier', accountTypeKnown: true }).action).toBe('allow');
  });
});

describe('gateWorkspace — RPC fallita (degradazione SICURA, il fix P0-F)', () => {
  it('rotta bakery → allow (i layout guard fail-closed decidono dopo)', () => {
    expect(gateWorkspace({ pathname: '/dashboard', accountType: null, accountTypeKnown: false }).action).toBe('allow');
  });

  it('rotta /supplier SENZA tipo confermato → MAI di là (redirect unauthorized)', () => {
    expect(gateWorkspace({ pathname: '/supplier', accountType: null, accountTypeKnown: false }))
      .toEqual({ action: 'redirect', to: '/unauthorized?from=supplier' });
    expect(gateWorkspace({ pathname: '/supplier/orders/abc', accountType: null, accountTypeKnown: false }).action)
      .toBe('redirect');
  });

  it('prefix-matching esatto: /supplierX NON è rotta supplier', () => {
    expect(gateWorkspace({ pathname: '/supplierX', accountType: null, accountTypeKnown: false }).action).toBe('allow');
  });
});
