// =============================================================================
// Stato derivato "Da confermare" (automazione soft): un piano passato e aperto è
// da confermare; oggi/futuro/completed/cancelled NO. Nessun cambio di stato DB.
// =============================================================================

import { describe, it, expect } from 'vitest';
import { isPendingConfirmation } from '../status';

const TODAY = '2026-06-24';

describe('isPendingConfirmation', () => {
  it('passato + draft/in_progress → da confermare', () => {
    expect(isPendingConfirmation('2026-06-20', 'draft', TODAY)).toBe(true);
    expect(isPendingConfirmation('2026-06-23', 'in_progress', TODAY)).toBe(true);
  });

  it('passato + completed/cancelled → NO (già risolti)', () => {
    expect(isPendingConfirmation('2026-06-20', 'completed', TODAY)).toBe(false);
    expect(isPendingConfirmation('2026-06-20', 'cancelled', TODAY)).toBe(false);
  });

  it('oggi → NO (comportamento invariato, non è in ritardo)', () => {
    expect(isPendingConfirmation(TODAY, 'draft', TODAY)).toBe(false);
    expect(isPendingConfirmation(TODAY, 'in_progress', TODAY)).toBe(false);
  });

  it('futuro → NO (comportamento invariato)', () => {
    expect(isPendingConfirmation('2026-06-30', 'draft', TODAY)).toBe(false);
  });
});
