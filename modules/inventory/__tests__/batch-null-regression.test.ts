// =============================================================================
// Regressione BUG-02: "Invalid input" su registrazione lotti/scadenze.
// Root cause: formData.get('notes') === null (campo assente in
// RegisterBatchForm) rifiutato da createBatchSchema.
// =============================================================================

import { describe, expect, it } from 'vitest';
import { createBatchSchema } from '../schemas';
import { formField } from '@/lib/utils';

const VALID_UUID = '7eb533fd-2697-49a2-985a-a127de0badcf';
const PO_UUID = 'dde1078d-889b-4f4d-9caf-87a834aa9bcb';

describe('BUG-02 · createBatchSchema vs campi FormData assenti', () => {
  const base = {
    ingredientProductId: VALID_UUID,
    purchaseOrderId: PO_UUID,
    expiryDate: '2026-07-10',
    quantity: '6',
    unit: 'kg',
  };

  it('accetta notes null (campo assente nel form, pre-fix falliva)', () => {
    expect(() => createBatchSchema.parse({ ...base, lotNumber: 'BU26-0605', notes: null })).not.toThrow();
  });

  it('accetta lotNumber null (lotto facoltativo)', () => {
    expect(() => createBatchSchema.parse({ ...base, lotNumber: null, notes: null })).not.toThrow();
  });

  it('scenario completo del RegisterBatchForm reale (senza campo notes)', () => {
    const fd = new FormData();
    fd.set('purchaseOrderId', PO_UUID);
    fd.set('ingredientProductId', VALID_UUID);
    fd.set('unit', 'kg');
    fd.set('lotNumber', 'BU26-0605');
    fd.set('expiryDate', '2026-07-10');
    fd.set('quantity', '6');
    // come fa recordBatchAction dopo il fix:
    const raw = {
      ingredientProductId: formField(fd, 'ingredientProductId'),
      purchaseOrderId: formField(fd, 'purchaseOrderId'),
      lotNumber: formField(fd, 'lotNumber'),
      expiryDate: formField(fd, 'expiryDate'),
      quantity: formField(fd, 'quantity'),
      unit: formField(fd, 'unit'),
      notes: formField(fd, 'notes'), // campo NON presente nel form
    };
    const parsed = createBatchSchema.parse(raw);
    expect(parsed.quantity).toBe(6);
    expect(parsed.expiryDate).toBe('2026-07-10');
  });

  it('quantità con virgola decimale e validazioni restano attive', () => {
    expect(createBatchSchema.parse({ ...base, quantity: '2,5', notes: null }).quantity).toBe(2.5);
    expect(createBatchSchema.safeParse({ ...base, quantity: '0', notes: null }).success).toBe(false);
    expect(createBatchSchema.safeParse({ ...base, expiryDate: 'domani', notes: null }).success).toBe(false);
  });
});
