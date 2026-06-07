// =============================================================================
// lib/errors.ts
// Classi di errore applicativo e utility per gestione errori uniforme.
// =============================================================================

import { ZodError } from 'zod';

// ---------------------------------------------------------------------------
// Classi di errore
// ---------------------------------------------------------------------------

/** Errore generico applicativo con messaggio utente-friendly. */
export class AppError extends Error {
  constructor(
    message: string,
    public readonly code: string = 'APP_ERROR',
  ) {
    super(message);
    this.name = 'AppError';
  }
}

/** Errore di validazione input (Zod). */
export class ValidationError extends AppError {
  constructor(
    message: string,
    public readonly fieldErrors?: Record<string, string[]>,
  ) {
    super(message, 'VALIDATION_ERROR');
    this.name = 'ValidationError';
  }
}

/** Errore database Supabase. */
export class DatabaseError extends AppError {
  constructor(
    message: string,
    public readonly pgCode?: string,
  ) {
    super(message, 'DATABASE_ERROR');
    this.name = 'DatabaseError';
  }
}

/** Utente non autenticato. */
export class AuthError extends AppError {
  constructor(message = 'Non autenticato') {
    super(message, 'AUTH_ERROR');
    this.name = 'AuthError';
  }
}

/** Accesso negato (ruolo insufficiente). */
export class ForbiddenError extends AppError {
  constructor(message = 'Accesso non consentito') {
    super(message, 'FORBIDDEN_ERROR');
    this.name = 'ForbiddenError';
  }
}

/** Risorsa non trovata. */
export class NotFoundError extends AppError {
  constructor(resource: string) {
    super(`${resource} non trovato`, 'NOT_FOUND_ERROR');
    this.name = 'NotFoundError';
  }
}

/** Violazione di una regola di business. */
export class BusinessRuleError extends AppError {
  constructor(message: string) {
    super(message, 'BUSINESS_RULE_ERROR');
    this.name = 'BusinessRuleError';
  }
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

/**
 * Estrae un messaggio leggibile da qualsiasi tipo di errore.
 * Usata nelle Server Actions per restituire messaggi all'utente.
 */
export function getErrorMessage(error: unknown): string {
  // ZodError: mostra il primo messaggio leggibile invece del dump JSON grezzo.
  if (error instanceof ZodError) {
    return error.issues[0]?.message ?? 'Dati inseriti non validi';
  }
  if (error instanceof AppError) return error.message;
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'Si è verificato un errore inatteso';
}

/**
 * Mappa i codici di errore PostgreSQL (via Supabase) a messaggi utente.
 * Aggiungere qui nuovi codici man mano che emergono in produzione.
 */
export function mapSupabaseError(error: { code?: string; message: string }): AppError {
  switch (error.code) {
    case '23505': // unique_violation
      return new DatabaseError(
        'Esiste già un record con questi dati. Verifica i campi univoci.',
        error.code,
      );
    case '23503': // foreign_key_violation
      return new DatabaseError(
        'Impossibile eliminare: il record è referenziato da altri dati.',
        error.code,
      );
    case '23514': // check_violation
      return new DatabaseError(
        'Valore non valido: controlla i campi inseriti.',
        error.code,
      );
    case 'PGRST116': // no rows returned (Supabase)
      return new NotFoundError('Record');
    default:
      return new DatabaseError(error.message, error.code);
  }
}
