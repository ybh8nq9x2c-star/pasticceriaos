// =============================================================================
// modules/sales/bom.ts
// Logica PURA dell'esplosione BOM per la deduzione magazzino al momento della
// vendita. Nessun DB, nessun side-effect: data una BOM e una quantità venduta,
// produce i movimenti di deduzione. Stessa matematica della RPC ingest_sale, ma
// testabile in isolamento.
//
// Deduzione per ingrediente = (quantità_BOM / base_portions) × quantità_venduta,
// convertita nell'unità di MAGAZZINO. Stock-agnostica: NON blocca sulla giacenza
// (i negativi sono ammessi e segnalati a valle — regola #7 "allow + flag").
// =============================================================================

import type { UnitOfMeasure } from '@/lib/database.types';
import { unitConversionFactor } from '@/lib/units';

export type SaleLineStatus = 'deducted' | 'unlinked' | 'no_bom' | 'unit_mismatch';
export type SaleStatus = 'processed' | 'partially_linked' | 'unlinked';

/** Un ingrediente del BOM (recipe_ingredients) + l'unità di magazzino della materia prima. */
export interface BomItem {
  ingredientProductId: string;
  quantity: number; // riferita a base_portions (snapshot ricetta)
  unit: UnitOfMeasure; // unità snapshot della ricetta
  stockUnit: UnitOfMeasure; // unità di magazzino (ingredient_products.unit / inventory_levels.unit)
}

export interface Bom {
  basePortions: number;
  items: BomItem[];
}

export interface DeductionMovement {
  ingredientProductId: string;
  quantityDelta: number; // negativo: uscita
  unit: UnitOfMeasure; // unità di magazzino
}

export interface LineExplosion {
  status: SaleLineStatus;
  exception: string | null;
  movements: DeductionMovement[];
}

/**
 * Fattore di conversione metrica. Delega a `lib/units` (unica fonte di verità,
 * mirror della funzione DB unit_conversion_factor 021). Mantenuto come re-export
 * per i consumatori storici del modulo sales.
 */
export const convertFactor = unitConversionFactor;

const round4 = (n: number) => Math.round(n * 10000) / 10000; // NUMERIC(10,4)

/**
 * Esplode il BOM per UNA riga vendita risolta. Gestisce: prodotto senza ricetta
 * (unlinked), ricetta senza BOM (no_bom), unità non convertibile (unit_mismatch,
 * deduce solo gli ingredienti compatibili), quantità decimali.
 */
export function explodeLine(bom: Bom | null, soldQty: number): LineExplosion {
  if (!bom) {
    return { status: 'unlinked', exception: 'Prodotto non collegato a una ricetta.', movements: [] };
  }
  if (bom.items.length === 0 || !(bom.basePortions > 0)) {
    return { status: 'no_bom', exception: 'Ricetta senza ingredienti utilizzabili (BOM vuoto).', movements: [] };
  }
  if (!(soldQty > 0)) {
    return { status: 'no_bom', exception: 'Quantità venduta non valida.', movements: [] };
  }

  const movements: DeductionMovement[] = [];
  let unconvertible = 0;
  for (const item of bom.items) {
    const factor = convertFactor(item.unit, item.stockUnit);
    if (factor === null) {
      unconvertible += 1; // non deduciamo in un'unità sbagliata (regola #6)
      continue;
    }
    const perUnit = item.quantity / bom.basePortions; // per 1 unità venduta
    const deduct = round4(perUnit * soldQty * factor); // in unità di magazzino
    if (deduct <= 0) continue;
    movements.push({ ingredientProductId: item.ingredientProductId, quantityDelta: -deduct, unit: item.stockUnit });
  }

  if (unconvertible > 0) {
    return {
      status: 'unit_mismatch',
      exception: `Unità non convertibile per ${unconvertible} ingrediente/i: dedotti solo quelli compatibili.`,
      movements,
    };
  }
  return { status: 'deducted', exception: null, movements };
}

/** Stato vendita aggregato dagli stati riga. 'processed' solo se TUTTO dedotto. */
export function aggregateSaleStatus(lineStatuses: SaleLineStatus[]): SaleStatus {
  if (lineStatuses.length === 0) return 'unlinked';
  const deducted = lineStatuses.filter((s) => s === 'deducted').length;
  if (deducted === lineStatuses.length) return 'processed';
  if (deducted > 0) return 'partially_linked';
  return 'unlinked';
}

/** Piano di storno (per reverse): inverte il segno dei movimenti di deduzione. */
export function reverseMovements(movements: DeductionMovement[]): DeductionMovement[] {
  return movements.map((m) => ({ ...m, quantityDelta: -m.quantityDelta }));
}

/** Saldo netto per ingrediente (somma dei delta) — utile per asserire i balance. */
export function netByIngredient(movements: DeductionMovement[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const m of movements) out[m.ingredientProductId] = round4((out[m.ingredientProductId] ?? 0) + m.quantityDelta);
  return out;
}
