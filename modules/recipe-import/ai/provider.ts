// =============================================================================
// modules/recipe-import/ai/provider.ts
// Confine di rete dello strato AI. Stesso pattern delle integrazioni esterne
// della codebase (lib/order-dispatch.ts, lib/supabase/admin.ts):
//   • gated da env (ANTHROPIC_API_KEY): assente → feature SPENTA, fallback
//     deterministico, nessun cambiamento di comportamento;
//   • non lancia MAI nel flusso: qualunque errore/timeout → null → il parser
//     deterministico resta la verità;
//   • output STRUTTURATO via tool-use forzato + validazione zod del contratto.
// =============================================================================

import Anthropic from '@anthropic-ai/sdk';
import {
  aiImportResultSchema,
  SUBMIT_RECIPES_INPUT_SCHEMA,
  type AiImportInput,
  type AiImportResult,
} from './contract';

/** Default: il modello più capace; il prodotto può scegliere via env. */
const MODEL = process.env.RECIPE_IMPORT_AI_MODEL ?? 'claude-opus-4-8';
const TIMEOUT_MS = 30_000;
const MAX_TEXT_CHARS = 12_000;
const MAX_SAMPLES = 5;
const MAX_CATALOG = 200;

/** Feature attiva solo se è configurata una API key (server-side). */
export function isAiImportAvailable(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

const SYSTEM = [
  'Sei un assistente che AIUTA a CAPIRE file di ricette disordinati di una pasticceria.',
  'Lavori su input reali e sporchi: header strani, colonne miste italiano/inglese,',
  'blocchi compatti, testo da appunti/OCR rumoroso, abbreviazioni e nomi imperfetti.',
  '',
  'REGOLE NON NEGOZIABILI:',
  '- NON inventare dati. Se un campo non è chiaro, lascialo null e abbassa la confidenza.',
  '- Dai una confidenza 0..1 per nome ricetta, e per nome/quantità/unità di ogni ingrediente.',
  '- Le unità ammesse sono SOLO: g, kg, ml, l, pz, bustina, foglio. Se l\'unità reale è',
  '  un\'altra (cucchiaio, tazza, q.b., …) mettila a null e segnalalo in ambiguityFlags.',
  '- NON convertire quantità tra unità diverse.',
  '- Segnala ogni ambiguità in ambiguityFlags con frasi brevi, umane, non tecniche.',
  '- Per i CSV/spreadsheet proponi anche columnMapping (un campo per colonna).',
  'Restituisci il risultato SOLO chiamando il tool submit_recipes.',
].join('\n');

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
 * (chiave assente, errore, timeout, output non conforme) → fallback deterministico.
 */
export async function aiUnderstandImport(input: AiImportInput): Promise<AiImportResult | null> {
  if (!isAiImportAvailable()) return null;
  try {
    const client = new Anthropic(); // legge ANTHROPIC_API_KEY dall'ambiente
    const res = await client.messages.create(
      {
        model: MODEL,
        max_tokens: 8000,
        system: SYSTEM,
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
    if (!toolUse || toolUse.type !== 'tool_use') return null;

    const parsed = aiImportResultSchema.safeParse(toolUse.input);
    return parsed.success ? parsed.data : null;
  } catch {
    // Qualunque errore (auth, rete, rate limit, timeout, JSON) → fallback silenzioso.
    return null;
  }
}
