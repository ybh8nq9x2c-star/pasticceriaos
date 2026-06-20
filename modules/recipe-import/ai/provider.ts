// =============================================================================
// modules/recipe-import/ai/provider.ts
// Confine di rete dello strato AI. Stesso pattern delle integrazioni esterne
// della codebase (lib/order-dispatch.ts, lib/supabase/admin.ts):
//   • gated da env: nessuna key → feature SPENTA, fallback deterministico;
//   • non lancia MAI nel flusso: qualunque errore/timeout → null;
//   • output STRUTTURATO validato dal contratto zod.
//
// Provider auto-selezionato dalla key presente:
//   • VENICE_API_KEY  → Venice (OpenAI-compatible, JSON mode) — economico;
//   • ANTHROPIC_API_KEY → Claude (tool-use forzato).
// Le chiavi vivono SOLO nell'ambiente: non sono mai scritte nel repo.
// =============================================================================

import Anthropic from '@anthropic-ai/sdk';
import {
  aiImportResultSchema,
  SUBMIT_RECIPES_INPUT_SCHEMA,
  AI_UNITS,
  type AiImportInput,
  type AiImportResult,
} from './contract';

const VENICE_BASE_URL = process.env.VENICE_BASE_URL ?? 'https://api.venice.ai/api/v1';
const TIMEOUT_MS = 30_000;
const MAX_TEXT_CHARS = 12_000;
const MAX_SAMPLES = 5;
const MAX_CATALOG = 200;

type Provider = 'venice' | 'anthropic';

/** Provider attivo in base alla key configurata (Venice ha priorità). */
function selectProvider(): Provider | null {
  if (process.env.VENICE_API_KEY) return 'venice';
  if (process.env.ANTHROPIC_API_KEY) return 'anthropic';
  return null;
}

/** Modello: override via env, altrimenti default per-provider (Venice = economico). */
function modelFor(p: Provider): string {
  if (process.env.RECIPE_IMPORT_AI_MODEL) return process.env.RECIPE_IMPORT_AI_MODEL;
  return p === 'venice' ? 'llama-3.2-3b' : 'claude-opus-4-8';
}

/** Feature attiva solo se è configurata una API key (server-side). */
export function isAiImportAvailable(): boolean {
  return selectProvider() !== null;
}

/**
 * TEMP DIAGNOSTIC (rimuovere dopo la conferma): solo BOOLEANI/decisioni, mai la
 * chiave. Espone presenza chiavi e provider scelto per tracciare il gating.
 */
export function aiProviderDiag(): { veniceKey: boolean; anthropicKey: boolean; provider: Provider | 'none' } {
  return {
    veniceKey: Boolean(process.env.VENICE_API_KEY),
    anthropicKey: Boolean(process.env.ANTHROPIC_API_KEY),
    provider: selectProvider() ?? 'none',
  };
}

const RULES = [
  'Sei un assistente che AIUTA a CAPIRE file di ricette disordinati di una pasticceria.',
  'Lavori su input reali e sporchi: header strani, colonne miste italiano/inglese,',
  'blocchi compatti, testo da appunti/OCR rumoroso, abbreviazioni e nomi imperfetti.',
  '',
  'REGOLE NON NEGOZIABILI:',
  '- NON inventare dati. Se un campo non è chiaro, lascialo null e abbassa la confidenza.',
  '- Dai una confidenza 0..1 per nome ricetta, e per nome/quantità/unità di ogni ingrediente.',
  `- Le unità ammesse sono SOLO: ${AI_UNITS.join(', ')}. Se l'unità reale è un'altra`,
  '  (cucchiaio, tazza, q.b., …) mettila a null e segnalalo in ambiguityFlags.',
  '- NON convertire quantità tra unità diverse.',
  '- Segnala ogni ambiguità in ambiguityFlags con frasi brevi, umane, non tecniche.',
  '- Per i CSV/spreadsheet proponi anche columnMapping (un campo per colonna).',
].join('\n');

const ANTHROPIC_SYSTEM = `${RULES}\nRestituisci il risultato SOLO chiamando il tool submit_recipes.`;

const VENICE_SYSTEM = `${RULES}

Rispondi SOLO con un oggetto JSON valido (nessun testo fuori dal JSON) con questa forma:
{
  "recipes": [{
    "name": string|null, "nameConfidence": number,
    "portions": integer|null, "category": string|null, "notes": string|null,
    "ingredients": [{
      "rawText": string, "name": string|null,
      "quantity": number|null, "unit": ${AI_UNITS.map((u) => `"${u}"`).join('|')}|null,
      "nameConfidence": number, "quantityConfidence": number, "unitConfidence": number,
      "catalogMatchName": string|null, "ambiguous": boolean
    }],
    "ambiguityFlags": [string], "confidence": number
  }],
  "columnMapping": { "fields": [string], "hasHeader": boolean, "confidence": number } | null,
  "overallConfidence": number
}
Ogni voce di columnMapping.fields ∈ recipe|portions|ingredient|quantity|unit|category|notes|allergens|ignore.`;

function buildUserContent(input: AiImportInput): string {
  const parts: string[] = [];
  if (input.kind === 'csv' && input.columns?.length) {
    parts.push('FILE TABELLARE — colonne osservate (intestazione + campioni):');
    input.columns.forEach((c, i) => {
      const samples = c.samples.slice(0, MAX_SAMPLES).join(' | ');
      parts.push(`Colonna ${i + 1}: header="${c.header}" · campioni: ${samples}`);
    });
    parts.push('');
    parts.push('Proponi columnMapping (un ImportColumnField per colonna) e, se puoi,');
    parts.push('estrai le ricette visibili nei campioni.');
  } else {
    parts.push('TESTO RICETTE (può essere rumoroso / da OCR):');
    parts.push((input.text ?? '').slice(0, MAX_TEXT_CHARS));
  }
  if (input.catalogNames?.length) {
    parts.push('');
    parts.push('INGREDIENTI A CATALOGO (per hint di match, usa catalogMatchName):');
    parts.push(input.catalogNames.slice(0, MAX_CATALOG).join(', '));
  }
  return parts.join('\n');
}

/**
 * Comprensione AI-assistita dell'import. Ritorna il contratto validato o null
 * (key assente, errore, timeout, output non conforme) → fallback deterministico.
 */
export async function aiUnderstandImport(input: AiImportInput): Promise<AiImportResult | null> {
  const provider = selectProvider();
  if (!provider) {
    console.info('[ai-diag] AI invoked: no (no provider/key)'); // TEMP DIAGNOSTIC
    return null;
  }
  console.info('[ai-diag] AI invoked: yes | provider:', provider); // TEMP DIAGNOSTIC
  try {
    const raw = provider === 'venice' ? await callVenice(input) : await callAnthropic(input);
    if (raw == null) {
      console.info('[ai-diag] AI returned result: no (empty/non-2xx)'); // TEMP DIAGNOSTIC
      return null;
    }
    const parsed = aiImportResultSchema.safeParse(raw);
    console.info('[ai-diag] AI returned result:', parsed.success ? 'yes' : 'no (schema mismatch)'); // TEMP DIAGNOSTIC
    return parsed.success ? parsed.data : null;
  } catch {
    // Qualunque errore (auth, rete, rate limit, timeout, JSON) → fallback silenzioso.
    console.info('[ai-diag] AI error/timeout path hit: yes'); // TEMP DIAGNOSTIC
    return null;
  }
}

/** Venice (OpenAI-compatible): JSON mode, robusto anche con modelli piccoli/economici. */
async function callVenice(input: AiImportInput): Promise<unknown> {
  const rawKey = process.env.VENICE_API_KEY ?? '';
  // FIX difensivo: tolgo spazi/newline accidentali nell'env (causa comune di 401
  // su Bearer quando la stessa chiave funziona via curl). Non altera una chiave pulita.
  const key = rawKey.trim();
  // TEMP DIAGNOSTIC — solo booleani/metadati, MAI la chiave né parti di essa.
  console.info(
    '[ai-diag] venice request: sending | model:', modelFor('venice'),
    '| key had surrounding whitespace:', key !== rawKey,
  );
  const res = await fetch(`${VENICE_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: modelFor('venice'),
      messages: [
        { role: 'system', content: VENICE_SYSTEM },
        { role: 'user', content: buildUserContent(input) },
      ],
      response_format: { type: 'json_object' },
      max_tokens: 4000,
      temperature: 0.1,
      // Il nostro system prompt deve dominare: niente system prompt di Venice.
      venice_parameters: { include_venice_system_prompt: false },
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) {
    // Il CORPO dell'errore Venice dice il PERCHÉ del 401 (chiave non valida vs
    // modello non disponibile vs …) e NON contiene la chiave. Tronco per sicurezza.
    const errBody = await res.text().catch(() => '');
    console.info(
      '[ai-diag] venice response not ok | status:', res.status,
      '| body:', errBody.slice(0, 300),
    ); // TEMP DIAGNOSTIC
    return null;
  }
  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== 'string') return null;
  return JSON.parse(content); // eventuale errore → catch upstream → fallback
}

/** Claude: tool-use forzato (output strutturato garantito). */
async function callAnthropic(input: AiImportInput): Promise<unknown> {
  const client = new Anthropic(); // legge ANTHROPIC_API_KEY dall'ambiente
  const res = await client.messages.create(
    {
      model: modelFor('anthropic'),
      max_tokens: 8000,
      system: ANTHROPIC_SYSTEM,
      tools: [
        {
          name: 'submit_recipes',
          description: 'Restituisce le ricette candidate, le confidenze e la mappatura colonne.',
          input_schema: SUBMIT_RECIPES_INPUT_SCHEMA as unknown as Anthropic.Tool.InputSchema,
        },
      ],
      tool_choice: { type: 'tool', name: 'submit_recipes' },
      messages: [{ role: 'user', content: buildUserContent(input) }],
    },
    { timeout: TIMEOUT_MS },
  );
  const toolUse = res.content.find((b) => b.type === 'tool_use');
  return toolUse && toolUse.type === 'tool_use' ? toolUse.input : null;
}
