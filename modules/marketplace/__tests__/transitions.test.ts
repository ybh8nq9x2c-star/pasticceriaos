import { describe, it, expect } from 'vitest';
import {
  canTransition, actorForTransition, type MarketplaceOrderStatus, type AccountType,
} from '../types';

const ALL: MarketplaceOrderStatus[] = [
  'draft', 'submitted', 'accepted', 'in_preparation', 'shipped', 'delivered', 'cancelled',
];

describe('order lifecycle transition matrix', () => {
  it('allows the canonical happy path', () => {
    expect(canTransition('draft', 'submitted', 'customer')).toBe(true);
    expect(canTransition('submitted', 'accepted', 'supplier')).toBe(true);
    expect(canTransition('accepted', 'in_preparation', 'supplier')).toBe(true);
    expect(canTransition('in_preparation', 'shipped', 'supplier')).toBe(true);
    expect(canTransition('shipped', 'delivered', 'supplier')).toBe(true);
  });

  it('lets the customer (not the supplier) submit a draft', () => {
    expect(canTransition('draft', 'submitted', 'customer')).toBe(true);
    expect(canTransition('draft', 'submitted', 'supplier')).toBe(false);
  });

  it('lets only the supplier drive fulfilment states', () => {
    expect(canTransition('submitted', 'accepted', 'customer')).toBe(false);
    expect(canTransition('accepted', 'in_preparation', 'customer')).toBe(false);
    expect(canTransition('in_preparation', 'shipped', 'customer')).toBe(false);
    expect(canTransition('shipped', 'delivered', 'customer')).toBe(false);
  });

  it('lets either side cancel while submitted, only customer while draft', () => {
    expect(canTransition('submitted', 'cancelled', 'customer')).toBe(true);
    expect(canTransition('submitted', 'cancelled', 'supplier')).toBe(true);
    expect(canTransition('draft', 'cancelled', 'customer')).toBe(true);
    expect(canTransition('draft', 'cancelled', 'supplier')).toBe(false);
  });

  it('rejects skipping states (no draft -> delivered, etc.)', () => {
    for (const actor of ['customer', 'supplier'] as AccountType[]) {
      expect(canTransition('draft', 'delivered', actor)).toBe(false);
      expect(canTransition('submitted', 'shipped', actor)).toBe(false);
      expect(canTransition('accepted', 'delivered', actor)).toBe(false);
    }
  });

  it('makes delivered and cancelled terminal', () => {
    for (const to of ALL) {
      for (const actor of ['customer', 'supplier'] as AccountType[]) {
        expect(canTransition('delivered', to, actor)).toBe(false);
        expect(canTransition('cancelled', to, actor)).toBe(false);
      }
    }
  });

  it('cannot cancel after shipped', () => {
    expect(canTransition('shipped', 'cancelled', 'customer')).toBe(false);
    expect(canTransition('shipped', 'cancelled', 'supplier')).toBe(false);
  });

  it('actorForTransition returns the expected owning side', () => {
    expect(actorForTransition('draft', 'submitted')).toBe('customer');
    expect(actorForTransition('accepted', 'in_preparation')).toBe('supplier');
    expect(actorForTransition('draft', 'delivered')).toBeNull();
  });
});
