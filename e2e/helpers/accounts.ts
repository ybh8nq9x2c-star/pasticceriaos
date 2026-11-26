// =============================================================================
// e2e/helpers/accounts.ts
// Account dei due agenti E2E (pasticceria + fornitore). Email e password NON
// stanno nel repo: si leggono dalle env sotto.
// =============================================================================

import * as path from 'node:path';

// =============================================================================
// Credenziali SOLO da variabili d'ambiente (W0, REMEDIATION_REPORT.md).
// Nessun fallback: le vecchie password erano committate e vanno considerate
// compromesse (ruotate). Se una variabile manca la suite si ferma subito con un
// messaggio esplicito, invece di girare con account sbagliati.
//   E2E_BAKERY_EMAIL   / E2E_BAKERY_PASSWORD    account pasticceria (customer)
//   E2E_SUPPLIER_EMAIL / E2E_SUPPLIER_PASSWORD  account fornitore   (supplier)
// =============================================================================

function requireEnv(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) {
    throw new Error(
      `[e2e] variabile d'ambiente ${name} mancante. ` +
        'Le credenziali E2E si forniscono solo via env / secret store (vedi e2e/README o REMEDIATION_REPORT.md W0).',
    );
  }
  return v;
}

export const BAKERY = {
  email: requireEnv('E2E_BAKERY_EMAIL'),
  password: requireEnv('E2E_BAKERY_PASSWORD'),
  home: '/dashboard',
};

export const SUPPLIER = {
  email: requireEnv('E2E_SUPPLIER_EMAIL'),
  password: requireEnv('E2E_SUPPLIER_PASSWORD'),
  home: '/supplier',
};

export const AUTH_DIR = path.resolve(__dirname, '..', '.auth');
export const BAKERY_STATE = path.join(AUTH_DIR, 'bakery.json');
export const SUPPLIER_STATE = path.join(AUTH_DIR, 'supplier.json');
