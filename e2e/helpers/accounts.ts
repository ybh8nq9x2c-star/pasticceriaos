// =============================================================================
// e2e/helpers/accounts.ts
// Account dei due agenti. ATTENZIONE: nel DB di produzione i ruoli risultano
// INVERTITI rispetto alla richiesta originale dell'audit:
//   eeskere33@gmail.com    → org "luca toni"    account_type=customer (PASTICCERIA)
//   emirimatteo2@gmail.com → org "matteo emiri" account_type=supplier (FORNITORE)
// La suite usa i ruoli EFFETTIVI del DB. Override via env se necessario.
// =============================================================================

import * as path from 'node:path';

export const BAKERY = {
  email: process.env.E2E_BAKERY_EMAIL ?? 'eeskere33@gmail.com',
  password: process.env.E2E_BAKERY_PASSWORD ?? '010670Pe',
  home: '/dashboard',
};

export const SUPPLIER = {
  email: process.env.E2E_SUPPLIER_EMAIL ?? 'emirimatteo2@gmail.com',
  password: process.env.E2E_SUPPLIER_PASSWORD ?? '010670Pe',
  home: '/supplier',
};

export const AUTH_DIR = path.resolve(__dirname, '..', '.auth');
export const BAKERY_STATE = path.join(AUTH_DIR, 'bakery.json');
export const SUPPLIER_STATE = path.join(AUTH_DIR, 'supplier.json');
