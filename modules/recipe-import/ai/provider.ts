// =============================================================================
// modules/recipe-import/ai/provider.ts
// Confine di rete dello strato AI. Stesso pattern delle integrazioni esterne
// della codebase (lib/order-dispatch.ts, lib/supabase/admin.ts):
//   • gated da env: nessuna key → feature SPENTA, fallback deterministico;
//   • non lancia MAI nel flusso: qualunque errore/timeout → null;
//   • output STRUTTURATO validato dal contratto zod.
//
// Provider auto-selezionato dalla key presente:
//   • GEMINI_API_KEY   → Gemini (generateContent + responseSchema JSON) — default;
//   • ANTHROPIC_API_KEY → Claude (tool-use forzato).
// Le chiavi vivono SOLO nell'ambiente: non sono mai scritte nel repo né nei log.
// =============================================================================

import Anthropic from '@anthropic-ai/sdk';
import {
  aiImportResultSchema,
  SUBMIT_RECIPES_INPUT_SCHEMA,
  AI_UNITS,
  type AiImportInput,
  type AiImportResult,
} from './contract';

const GEMINI_BASE_URL = process.env.GEMINI_BASE_URL ?? 'https://generativelanguage.googleapis.com/v1beta';
const TIMEOUT_MS = 30_000;
const MAX_TEXT_CHARS = 12_000;
const MAX_SAMPLES = 5;
const MAX_CATALOG = 200;

type Provider = 'gemini' | 'anthropic';

/** Provider attivo in base alla key configurata (Gemini ha priorità). */
function selectProvider(): Provider | null {
  if (process.env.GEMINI_API_KEY) return 'gemini';
  if (process.env.ANTHROPIC_API_KEY) return 'anthropic';
  return null;
}

/** Modello: override via env, altrimenti default per-provider. */
function modelFor(p: Provider): string {
  if (process.env.RECIPE_IMPORT_AI_MODEL) return process.env.RECIPE_IMPORT_AI_MODEL;
  // gemini-2.5-flash: documentato stabile, economico, low-latency, supporta
  // generateContent + structured output (responseSchema).
  return p === 'gemini' ? 'gemini-2.5-flash' : 'claude-opus-4-8';
}

/** Feature attiva solo se è configurata una API key (server-side). */
export function isAiImportAvailable(): boolean {
  return selectProvider() !== null;
}

/**
 * TEMP DIAGNOSTIC (rimuovere dopo la conferma): solo BOOLEANI/decisioni, mai la
 * chiave. Espone presenza chiavi e provider scelto per tracciare il gating.
 */
export function aiProviderDiag(): { geminiKey: boolean; anthropicKey: boolean; provider: Provider | 'none' } {
  return {
    geminiKey: Boolean(process.env.GEMINI_API_KEY),
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
  '- Per OGNI ingrediente separa SEMPRE i campi: in "name" SOLO il nome (es. "Savoiardi"),',
  '  la quantità numerica in "quantity" e l\'unità in "unit". NON lasciare "Savoiardi 400 g"',
  '  dentro "name": estrai quantity=400 e unit="g". Vale anche se quantità/unità sono nella',
  '  stessa cella/riga dell\'ingrediente.',
  '- Dai una confidenza 0..1 per nome ricetta, e per nome/quantità/unità di ogni ingrediente.',
  `- Le unità ammesse sono SOLO: ${AI_UNITS.join(', ')}. Se l'unità reale è un'altra`,
  '  (cucchiaio, tazza, q.b., …) mettila a null e segnalalo in ambiguityFlags.',
  '- NON convertire quantità tra unità diverse.',
  '- Segnala ogni ambiguità in ambiguityFlags con frasi brevi, umane, non tecniche.',
  '- Per i CSV/spreadsheet proponi anche columnMapping (un campo per colonna).',
].join('\n');

const ANTHROPIC_SYSTEM = `${RULES}\nRestituisci il risultato SOLO chiamando il tool submit_recipes.`;

const GEMINI_SYSTEM = `${RULES}\nRispondi rispettando esattamente lo schema JSON richiesto.`;

/**
 * Schema Gemini (responseSchema) — subset OpenAPI con type MAIUSCOLI e `nullable`.
 * Rispecchia il contratto zod (aiImportResultSchema): la validazione fine resta a
 * zod a valle, qui forziamo la forma per un JSON prevedibile.
 */
const GEMINI_RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    recipes: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          name: { type: 'STRING', nullable: true },
          nameConfidence: { type: 'NUMBER' },
          portions: { type: 'INTEGER', nullable: true },
          category: { type: 'STRING', nullable: true },
          notes: { type: 'STRING', nullable: true },
          ambiguityFlags: { type: 'ARRAY', items: { type: 'STRING' } },
          confidence: { type: 'NUMBER' },
          ingredients: {
            type: 'ARRAY',
            items: {
              type: 'OBJECT',
              properties: {
                rawText: { type: 'STRING' },
                name: { type: 'STRING', nullable: true },
                quantity: { type: 'NUMBER', nullable: true },
                unit: { type: 'STRING', nullable: true },
                nameConfidence: { type: 'NUMBER' },
                quantityConfidence: { type: 'NUMBER' },
                unitConfidence: { type: 'NUMBER' },
                catalogMatchName: { type: 'STRING', nullable: true },
                ambiguous: { type: 'BOOLEAN' },
              },
              required: ['name', 'quantity', 'unit', 'nameConfidence', 'quantityConfidence', 'unitConfidence'],
            },
          },
        },
        required: ['name', 'nameConfidence', 'ingredients', 'confidence'],
      },
    },
    columnMapping: {
      type: 'OBJECT',
      nullable: true,
      properties: {
        fields: {
          type: 'ARRAY',
          items: {
            type: 'STRING',
            enum: ['recipe', 'portions', 'ingredient', 'quantity', 'unit', 'category', 'notes', 'allergens', 'ignore'],
          },
        },
        hasHeader: { type: 'BOOLEAN' },
        confidence: { type: 'NUMBER' },
      },
      required: ['fields', 'hasHeader', 'confidence'],
    },
    overallConfidence: { type: 'NUMBER' },
  },
  required: ['recipes', 'overallConfidence'],
} as const;

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
    const raw = provider === 'gemini' ? await callGemini(input) : await callAnthropic(input);
    if (raw == null) {
      console.info('[ai-diag] AI returned result: no (empty/non-2xx)'); // TEMP DIAGNOSTIC
      return null;
    }
    const rawRecipes = Array.isArray((raw as { recipes?: unknown }).recipes)
      ? (raw as { recipes: unknown[] }).recipes.length
      : -1;
    const parsed = aiImportResultSchema.safeParse(raw);
    console.info('[ai-diag] AI raw recipes:', rawRecipes, '| schema valid:', parsed.success); // TEMP DIAGNOSTIC
    if (!parsed.success) {
      // Solo path+codice (niente valori/segreti): vede se zod scarta righe.
      console.info('[ai-diag] schema issues:', parsed.error.issues.slice(0, 3).map((i) => `${i.path.join('.')}:${i.code}`));
    }
    return parsed.success ? parsed.data : null;
  } catch {
    // Qualunque errore (auth, rete, rate limit, timeout, JSON) → fallback silenzioso.
    console.info('[ai-diag] AI error/timeout path hit: yes'); // TEMP DIAGNOSTIC
    return null;
  }
}

/** Gemini: generateContent + responseSchema (JSON strutturato prevedibile). */
async function callGemini(input: AiImportInput): Promise<unknown> {
  const key = (process.env.GEMINI_API_KEY ?? '').trim(); // immune a spazi/newline nell'env
  const model = modelFor('gemini');
  console.info('[ai-diag] gemini request: sending | model:', model); // TEMP DIAGNOSTIC (mai la chiave)
  const res = await fetch(`${GEMINI_BASE_URL}/models/${model}:generateContent`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': key, // chiave nell'header, NON nell'URL → niente leak nei log
    },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: GEMINI_SYSTEM }] },
      contents: [{ role: 'user', parts: [{ text: buildUserContent(input) }] }],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 16384, // più margine: tante ricette in un'unica risposta
        responseMimeType: 'application/json',
        responseSchema: GEMINI_RESPONSE_SCHEMA,
      },
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) {
    // Corpo errore Gemini = motivo (chiave/quota/modello). NON contiene la chiave.
    const errBody = await res.text().catch(() => '');
    console.info('[ai-diag] gemini response not ok | status:', res.status, '| body:', errBody.slice(0, 300)); // TEMP DIAGNOSTIC
    return null;
  }
  const data = await res.json();
  const cand = data?.candidates?.[0];
  // finishReason ≠ STOP (es. MAX_TOKENS) = output troncato → JSON parziale.
  if (cand?.finishReason && cand.finishReason !== 'STOP') {
    console.info('[ai-diag] gemini finishReason:', cand.finishReason); // TEMP DIAGNOSTIC
  }
  const text = cand?.content?.parts?.[0]?.text;
  if (typeof text !== 'string') {
    console.info('[ai-diag] gemini: no text part | finishReason:', cand?.finishReason); // TEMP DIAGNOSTIC
    return null;
  }
  return JSON.parse(text); // eventuale errore → catch upstream → fallback
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
