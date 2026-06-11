// =============================================================================
// playwright.config.ts
// Config per l'audit E2E bakery↔supplier contro l'ambiente deployato.
//
//   E2E_BASE_URL  override dell'ambiente (default: produzione Railway)
//   E2E_BAKERY_EMAIL / E2E_BAKERY_PASSWORD     account pasticceria
//   E2E_SUPPLIER_EMAIL / E2E_SUPPLIER_PASSWORD account fornitore
//
// Esecuzione: cd e2e && npm i && npx playwright install chromium
//             npx playwright test --config=../playwright.config.ts
// (oppure dalla root: npx playwright test, se @playwright/test è risolvibile)
//
// NOTA: workers=1 + retries=0 sono INTENZIONALI. La suite è uno scenario
// stateful (una giornata operativa): un retry duplicherebbe dati reali.
// =============================================================================

import { defineConfig, devices } from '@playwright/test';

const BASE_URL = process.env.E2E_BASE_URL ?? 'https://pasticceriaos-production-d14d.up.railway.app';

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
      name: 'audit-desktop',
      testMatch: /(?:1|2|3|4|5|7)\d-.*\.spec\.ts/,
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
