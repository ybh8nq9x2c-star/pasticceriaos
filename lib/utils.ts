// =============================================================================
// lib/utils.ts
// Utility generali condivise da tutti i moduli.
// =============================================================================

import { clsx, type ClassValue } from 'clsx';

// ---------------------------------------------------------------------------
// CSS classes
// ---------------------------------------------------------------------------
export function cn(...inputs: ClassValue[]): string {
  return clsx(inputs);
}

// ---------------------------------------------------------------------------
// Server Action state
// Tipo standard per ogni Server Action che usa useActionState.
// ---------------------------------------------------------------------------
export type ActionState =
  | { status: 'idle' }
  | { status: 'success'; message?: string }
  | { status: 'error'; error: string; fieldErrors?: Record<string, string[]> };

export const IDLE_STATE: ActionState = { status: 'idle' };

// ---------------------------------------------------------------------------
// Slug
// ---------------------------------------------------------------------------

/**
 * Genera uno slug URL-safe da una stringa italiana.
 * Esempio: "Pasticceria Rossi & Co." → "pasticceria-rossi-co"
 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // rimuove diacritici (à→a, è→e…)
    .replace(/[^a-z0-9]+/g, '-')     // sostituisce non-alfanumerici con -
    .replace(/^-+|-+$/g, '')          // rimuove - iniziali e finali
    .slice(0, 63);                    // max 63 char (Supabase limit)
}

// ---------------------------------------------------------------------------
// Formattazione
// ---------------------------------------------------------------------------

/** Formatta un numero come valuta EUR senza simbolo (es. 1234.5 → "1.234,50"). */
export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('it-IT', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

/** Formatta una data ISO come data italiana leggibile. */
export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('it-IT', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

/** Formatta una data ISO come stringa breve (es. "19 mag"). */
export function formatDateShort(iso: string): string {
  return new Date(iso).toLocaleDateString('it-IT', {
    day: 'numeric',
    month: 'short',
  });
}

/** Restituisce la data di oggi in formato YYYY-MM-DD (timezone locale). */
export function todayISODate(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// Unità di misura
// ---------------------------------------------------------------------------

import type { UnitOfMeasure } from './database.types';

export const UNIT_LABELS: Record<UnitOfMeasure, string> = {
  g: 'grammi (g)',
  kg: 'chilogrammi (kg)',
  ml: 'millilitri (ml)',
  l: 'litri (l)',
  pz: 'pezzi (pz)',
  bustina: 'bustine',
  foglio: 'fogli',
};

export const UNIT_SHORT: Record<UnitOfMeasure, string> = {
  g: 'g',
  kg: 'kg',
  ml: 'ml',
  l: 'l',
  pz: 'pz',
  bustina: 'bust.',
  foglio: 'fogl.',
};

// ---------------------------------------------------------------------------
// Guards
// ---------------------------------------------------------------------------

/** Asserisce che un valore non è null/undefined. Lancia se lo è. */
export function assertDefined<T>(value: T | null | undefined, label: string): T {
  if (value == null) {
    throw new Error(`Expected ${label} to be defined, got ${value}`);
  }
  return value;
}
