'use client';

// =============================================================================
// useRowSelection — stato di selezione multipla riusabile (grammatica bulk unica).
// Toggle per riga, "seleziona tutti i VISIBILI/filtrati" (mai record nascosti),
// clear. Stabile: `toggle` non cambia identità → non invalida i memo delle righe.
// =============================================================================

import { useCallback, useMemo, useState } from 'react';

export interface RowSelection {
  selected: Set<string>;
  count: number;
  has: (id: string) => boolean;
  toggle: (id: string) => void;
  /** true se OGNI id passato è già selezionato (per la checkbox "tutti"). */
  allSelected: (ids: string[]) => boolean;
  /** Seleziona/deseleziona in blocco SOLO gli id passati (i visibili/filtrati). */
  toggleMany: (ids: string[]) => void;
  clear: () => void;
}

export function useRowSelection(): RowSelection {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const toggle = useCallback((id: string) => {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }, []);

  const toggleMany = useCallback((ids: string[]) => {
    setSelected((prev) => {
      const n = new Set(prev);
      const allIn = ids.length > 0 && ids.every((id) => n.has(id));
      if (allIn) ids.forEach((id) => n.delete(id));
      else ids.forEach((id) => n.add(id));
      return n;
    });
  }, []);

  const clear = useCallback(() => setSelected(new Set()), []);

  return useMemo(
    () => ({
      selected,
      count: selected.size,
      has: (id: string) => selected.has(id),
      toggle,
      allSelected: (ids: string[]) => ids.length > 0 && ids.every((id) => selected.has(id)),
      toggleMany,
      clear,
    }),
    [selected, toggle, toggleMany, clear],
  );
}
