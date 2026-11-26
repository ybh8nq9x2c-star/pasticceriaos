// =============================================================================
// playwright.config.ts
// Config per l'audit E2E bakery↔supplier contro l'ambiente deployato.
//
//   BAKERYOS_E2E_BASE_URL  ambiente target (OBBLIGATORIA, nessun default:
//                          la suite è stateful e crea dati reali)
//   E2E_BAKERY_EMAIL / E2E_BAKERY_PASSWORD     account pasticceria
//   E2E_SUPPLIER_EMAIL / E2E_SUPPLIER_PASSWORD account fornitore
//
// Runbook completo (env, ambiente target, esecuzione): e2e/README.md.
// Ambiente target MAI produzione.
//
// NOTA: workers=1 + retries=0 sono INTENZIONALI. La suite è uno scenario
// stateful (una giornata operativa): un retry duplicherebbe dati reali.
// =============================================================================

import { defineConfig, devices } from '@playwright/test';

// W0: nessun URL predefinito (prima puntava alla produzione Railway). Fail-fast.
const BASE_URL = process.env.BAKERYOS_E2E_BASE_URL?.trim();
if (!BASE_URL) {
  throw new Error(
    '[e2e] BAKERYOS_E2E_BASE_URL mancante: indica esplicitamente l\'ambiente di test ' +
      '(es. http://localhost:3000 o lo staging). La suite crea dati reali: niente default di produzione.',
  );
}

export default defineConfig({
  testDir: './e2e/tests',
  outputDir: './e2e/artifacts/test-results',
  timeout: 150_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [
    ['list'],
    ['html', { outputFolder: './e2e/artifacts/html-report', open: 'never' }],
  ],
  use: {
    baseURL: BASE_URL,
    locale: 'it-IT',
    timezoneId: 'Europe/Rome',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
    actionTimeout: 20_000,
    navigationTimeout: 45_000,
  },
  projects: [
    {
      name: 'setup',
      testMatch: /00-auth\.setup\.ts/,
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
    {
      // 10–50, 70 = giornata operativa; 80 = goods receipts, 90 = area vendite
      // (reincluse in W7). 60 gira nel progetto mobile.
      name: 'audit-desktop',
      testMatch: /(?:1|2|3|4|5|7|8|9)\d-.*\.spec\.ts/,
      dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
    {
      // FASE F: riesecuzione flussi chiave in viewport mobile reale.
      name: 'audit-mobile',
      testMatch: /60-.*\.spec\.ts/,
      dependencies: ['setup'],
      use: { ...devices['iPhone 14'] }, // 390x844, touch, DPR 3
    },
  ],
});
