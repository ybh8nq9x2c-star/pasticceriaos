// =============================================================================
// Idempotenza import (R6): re-upload / nomi rinominati (accenti/maiuscole/spazi)
// non devono creare doppioni. Confronto per chiave normalizzata.
// =============================================================================

import { describe, it, expect } from 'vitest';
import { recipeKey, partitionByDuplicateName } from '../dedupe';

const names = (rs: { name: string }[]) => rs.map((r) => r.name);

describe('recipeKey', () => {
  it('toglie accenti, maiuscole e spazi multipli', () => {
    expect(recipeKey('Tiramisù')).toBe('tiramisu');
    expect(recipeKey('  TIRAMISU ')).toBe('tiramisu');
    expect(recipeKey('Pan  di   Spagna')).toBe('pan di spagna');
  });
});

describe('partitionByDuplicateName', () => {
  it('re-import identico → tutto doppione, niente da creare (idempotente)', () => {
    const batch = [{ name: 'Tiramisù' }, { name: 'Cannoli' }];
    const { toCreate, duplicates } = partitionByDuplicateName(batch, ['Tiramisù', 'Cannoli']);
    expect(toCreate).toHaveLength(0);
    expect(names(duplicates)).toEqual(['Tiramisù', 'Cannoli']);
  });

  it('rinominato solo per accento/maiuscole → riconosciuto come doppione', () => {
    const { toCreate, duplicates } = partitionByDuplicateName(
      [{ name: 'Tiramisu' }, { name: 'tiramisù' }, { name: '  Tiramisù  ' }],
      ['Tiramisù'],
    );
    expect(toCreate).toHaveLength(0);
    expect(duplicates).toHaveLength(3);
  });

  it('doppioni DENTRO lo stesso batch: la prima occorrenza vince', () => {
    const { toCreate, duplicates } = partitionByDuplicateName(
      [{ name: 'Babà' }, { name: 'baba' }, { name: 'Sfogliatella' }],
      [],
    );
    expect(names(toCreate)).toEqual(['Babà', 'Sfogliatella']);
    expect(names(duplicates)).toEqual(['baba']);
  });

  it('nomi nuovi e distinti → tutti da creare', () => {
    const batch = [{ name: 'Maritozzo' }, { name: 'Zeppola' }];
    const { toCreate, duplicates } = partitionByDuplicateName(batch, ['Tiramisù']);
    expect(names(toCreate)).toEqual(['Maritozzo', 'Zeppola']);
    expect(duplicates).toHaveLength(0);
  });

  it('catalogo vuoto → tutti da creare (con dedup interno al batch)', () => {
    const { toCreate, duplicates } = partitionByDuplicateName(
      [{ name: 'Torta' }, { name: 'TORTA' }],
      [],
    );
    expect(toCreate).toHaveLength(1);
    expect(duplicates).toHaveLength(1);
  });
});
