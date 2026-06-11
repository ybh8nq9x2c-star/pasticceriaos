// =============================================================================
// e2e/helpers/audit.ts
// Infrastruttura di raccolta evidenze per l'audit: findings strutturati
// (JSONL), screenshot nominati, note diagnostiche, misure di performance
// percepita. Tutto finisce in e2e/artifacts/ e alimenta il report finale.
// =============================================================================

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Page } from '@playwright/test';

export const ART_DIR = path.resolve(__dirname, '..', 'artifacts');
const SHOT_DIR = path.join(ART_DIR, 'screenshots');
for (const d of [ART_DIR, SHOT_DIR]) fs.mkdirSync(d, { recursive: true });

export type Severity = 'Critical' | 'High' | 'Medium' | 'Low';
export type Role = 'Bakery' | 'Supplier' | 'Entrambi';
export type FindingType = 'bug' | 'ux' | 'product' | 'mobile' | 'perf' | 'automation-gap';

export interface Finding {
  id: string;            // es. BUG-01, UX-03, MOB-02
  title: string;
  severity: Severity;
  role: Role;
  area: string;          // modulo: Catalog, Marketplace, Production, …
  type: FindingType;
  precondition?: string;
  steps?: string[];
  expected?: string;
  observed?: string;
  cause?: string;        // ipotesi causa (file:riga quando nota)
  fix?: string;          // proposta di fix
  screenshots?: string[];
}

/** Registra un finding strutturato (append-only, sopravvive a crash del run). */
export function logFinding(f: Finding): void {
  const row = { ...f, at: new Date().toISOString() };
  fs.appendFileSync(path.join(ART_DIR, 'findings.jsonl'), JSON.stringify(row) + '\n');
  // Anche su stdout: visibile nel reporter `list` durante il run.
  console.log(`  [FINDING][${f.severity}] ${f.id} — ${f.title}`);
}

/** Screenshot full-page nominato; ritorna il path relativo per il report. */
export async function snap(page: Page, name: string): Promise<string> {
  const safe = name.replace(/[^a-z0-9-_]/gi, '_').slice(0, 120);
  const file = path.join(SHOT_DIR, `${safe}.png`);
  try {
    await page.screenshot({ path: file, fullPage: true, timeout: 15_000 });
  } catch {
    // fallback viewport-only (pagine con elementi sticky/infinite possono
    // far fallire il fullPage)
    await page.screenshot({ path: file, timeout: 15_000 });
  }
  return path.relative(ART_DIR, file);
}

/** Nota diagnostica libera (osservazioni non-bug, contesto, deviazioni). */
export function note(msg: string): void {
  fs.appendFileSync(
    path.join(ART_DIR, 'notes.log'),
    `${new Date().toISOString()} ${msg}\n`,
  );
  console.log(`  [NOTE] ${msg}`);
}

/** Stato condiviso tra fasi (id ordini, URL portale, …). */
const STATE_FILE = path.join(ART_DIR, 'state.json');
export function saveState(patch: Record<string, unknown>): void {
  const cur = loadState();
  fs.writeFileSync(STATE_FILE, JSON.stringify({ ...cur, ...patch }, null, 2));
}
export function loadState(): Record<string, any> {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch {
    return {};
  }
}

/**
 * Navigazione misurata: registra wall-time fino a 'domcontentloaded' e fino a
 * network quiete, per il capitolo "performance percepita" del report.
 */
export async function gotoTimed(page: Page, url: string, label: string): Promise<void> {
  const t0 = Date.now();
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  const dcl = Date.now() - t0;
  let settled = dcl;
  try {
    await page.waitForLoadState('networkidle', { timeout: 20_000 });
    settled = Date.now() - t0;
  } catch {
    settled = -1; // mai quieto entro 20s: segnale di per sé
  }
  fs.appendFileSync(
    path.join(ART_DIR, 'perf.jsonl'),
    JSON.stringify({ label, url, dclMs: dcl, settledMs: settled, at: new Date().toISOString() }) + '\n',
  );
  if (dcl > 4000) {
    note(`PERF: ${label} (${url}) DCL lento: ${dcl}ms`);
  }
}

/** Controllo overflow orizzontale (FASE F mobile). */
export async function hasHorizontalOverflow(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const el = document.scrollingElement ?? document.documentElement;
    return el.scrollWidth > window.innerWidth + 1;
  });
}

/** Dimensioni minime tap-target dei controlli interattivi visibili (FASE F). */
export async function smallTapTargets(page: Page, minPx = 40): Promise<string[]> {
  return page.evaluate((min) => {
    const out: string[] = [];
    const els = document.querySelectorAll<HTMLElement>('a[href], button, [role="button"], input, select');
    els.forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return; // non visibile
      if (r.bottom < 0 || r.top > window.innerHeight) return; // fuori viewport
      if (r.height < min && el.innerText.trim().length > 0) {
        out.push(`${el.tagName.toLowerCase()} "${el.innerText.trim().slice(0, 40)}" h=${Math.round(r.height)}px`);
      }
    });
    return out.slice(0, 20);
  }, minPx);
}
