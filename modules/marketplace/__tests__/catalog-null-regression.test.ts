// =============================================================================
// Regressione BUG-01: "Invalid input" su aggiunta catalogo fornitore.
// Root cause: formData.get('sku') === null (campo assente nel form) rifiutato
// dallo schema. Il fix è doppio: formField (null→undefined) + schema .nullish().
// =============================================================================

import { describe, expect, it } from 'vitest';
import { catalogItemSchema } from '../schemas';
import { formField } from '@/lib/utils';

describe('BUG-01 · catalogItemSchema vs campi FormData assenti', () => {
  const base = { name: 'farina 00', unit: 'kg', unitPrice: '0,98' };

  it('accetta sku null (campo assente nel form, pre-fix falliva)', () => {
    const parsed = catalogItemSchema.parse({ ...base, sku: null });
    expect(parsed.name).toBe('farina 00');
    expect(parsed.unitPrice).toBe(0.98);
  });

  it('accetta sku undefined e stringa vuota', () => {
    expect(() => catalogItemSchema.parse({ ...base, sku: undefined })).not.toThrow();
    expect(() => catalogItemSchema.parse({ ...base, sku: '' })).not.toThrow();
  });

  it('accetta e trimma uno sku valorizzato', () => {
    const parsed = catalogItemSchema.parse({ ...base, sku: '  FAR-00-25 ' });
    expect(parsed.sku).toBe('FAR-00-25');
  });

  it('parsa il prezzo con virgola decimale', () => {
    const parsed = catalogItemSchema.parse({ ...base, sku: null, unitPrice: '8,40' });
    expect(parsed.unitPrice).toBe(8.4);
  });

  it('rifiuta il nome mancante con messaggio italiano', () => {
    const r = catalogItemSchema.safeParse({ ...base, name: '' });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]?.message).toBe('Il nome è obbligatorio');
  });
});

describe('formField · lettura null-safe da FormData', () => {
  it('campo assente → undefined (mai null)', () => {
    const fd = new FormData();
    expect(formField(fd, 'sku')).toBeUndefined();
  });

  it('campo presente → valore stringa', () => {
    const fd = new FormData();
    fd.set('sku', 'FAR-00-25');
    expect(formField(fd, 'sku')).toBe('FAR-00-25');
  });

  it('campo presente vuoto → stringa vuota (non undefined)', () => {
    const fd = new FormData();
    fd.set('sku', '');
    expect(formField(fd, 'sku')).toBe('');
  });

  it('upsert payload con form privo di sku passa lo schema (scenario BUG-01)', () => {
    const fd = new FormData();
    fd.set('name', 'Burro 82% m.g.');
    fd.set('unit', 'kg');
    fd.set('unitPrice', '8,40');
    // come fa upsertCatalogItemAction dopo il fix:
    const raw = {
      name: formField(fd, 'name'),
      sku: formField(fd, 'sku'),
      unit: formField(fd, 'unit'),
      unitPrice: formField(fd, 'unitPrice'),
    };
    expect(() => catalogItemSchema.parse(raw)).not.toThrow();
  });
});
