// =============================================================================
// modules/recipe-import/ai/contract.ts
// Contratto dello strato AI-assistito (Phase AI-1). È un concetto di SOLO
// PREVIEW: l'AND AI propone candidati + mappature con confidenza per campo; il
// risultato viene SEMPRE convertito in dati preview-layer (ParsedRecipe /
// ResolvedMapping) e ri-validato dagli schemi stretti al commit. L'AI non scrive
// mai sul DB, non inventa valori certi, non auto-conferma.
// =============================================================================

import { z } from 'zod';
import type { ImportColumnField } from '../types';

/** Unità canoniche: l'AI può proporre SOLO queste (niente conversioni implicite). */
export const AI_UNITS = ['g', 'kg', 'ml', 'l', 'pz', 'bustina', 'foglio'] as const;

const aiUnit = z.enum(AI_UNITS);
const confidence = z.number().min(0).max(1).catch(0); // robusto a output fuori range

// ── Output che il modello restituisce (validato con zod dopo la chiamata) ─────

const aiIngredientSchema = z.object({
  /** Testo originale della riga/cella (tracciabilità per l'utente). */
  rawText: z.string().default(''),
  name: z.string().nullable().default(null),
  quantity: z.number().positive().nullable().catch(null),
  unit: aiUnit.nullable().catch(null),
  nameConfidence: confidence,
  quantityConfidence: confidence,
  unitConfidence: confidence,
  /** Suggerimento di nome a catalogo (verificato a valle dal matcher reale). */
  catalogMatchName: z.string().nullable().default(null),
  ambiguous: z.boolean().default(false),
});

const aiRecipeSchema = z.object({
  name: z.string().nullable().default(null),
  nameConfidence: confidence,
  portions: z.number().int().positive().nullable().catch(null),
  category: z.string().nullable().default(null),
  notes: z.string().nullable().default(null),
  ingredients: z.array(aiIngredientSchema).default([]),
  /** Avvisi leggibili e azionabili (non tecnici), es. "unità incerta per zucchero". */
  ambiguityFlags: z.array(z.string()).default([]),
  confidence,
});

const importFieldEnum = z.enum([
  'recipe',
  'portions',
  'ingredient',
  'quantity',
  'unit',
  'category',
  'notes',
  'allergens',
  'ignore',
]);

/** Mappatura colonne proposta dall'AI per i CSV/spreadsheet (header ambigui). */
const aiColumnMappingSchema = z.object({
  fields: z.array(importFieldEnum).default([]),
  hasHeader: z.boolean().default(true),
  confidence,
});

export const aiImportResultSchema = z.object({
  recipes: z.array(aiRecipeSchema).default([]),
  columnMapping: aiColumnMappingSchema.nullable().default(null),
  overallConfidence: confidence,
});

export type AiImportResult = z.infer<typeof aiImportResultSchema>;
export type AiRecipe = z.infer<typeof aiRecipeSchema>;
export type AiIngredient = z.infer<typeof aiIngredientSchema>;
export type AiColumnMapping = z.infer<typeof aiColumnMappingSchema>;

// ── Input verso lo strato AI (lo costruisce il service) ───────────────────────

export interface AiImportInput {
  kind: 'csv' | 'text' | 'pdf';
  /** Testo grezzo per text/pdf (già troncato a un tetto ragionevole). */
  text?: string;
  /** Colonne viste per i CSV: intestazione + alcuni campioni. */
  columns?: { header: string; samples: string[] }[];
  /** Nomi ingredienti a catalogo, per dare hint di match (troncati). */
  catalogNames?: string[];
}

/**
 * JSON Schema dell'input del tool `submit_recipes`. Volutamente senza vincoli
 * non supportati dai structured outputs (min/max, minLength…): la validazione
 * fine la fa zod su `aiImportResultSchema`.
 */
export const SUBMIT_RECIPES_INPUT_SCHEMA = {
  type: 'object',
  properties: {
    recipes: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: ['string', 'null'] },
          nameConfidence: { type: 'number' },
          portions: { type: ['integer', 'null'] },
          category: { type: ['string', 'null'] },
          notes: { type: ['string', 'null'] },
          ambiguityFlags: { type: 'array', items: { type: 'string' } },
          confidence: { type: 'number' },
          ingredients: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                rawText: { type: 'string' },
                name: { type: ['string', 'null'] },
                quantity: { type: ['number', 'null'] },
                unit: { type: ['string', 'null'], enum: [...AI_UNITS, null] },
                nameConfidence: { type: 'number' },
                quantityConfidence: { type: 'number' },
                unitConfidence: { type: 'number' },
                catalogMatchName: { type: ['string', 'null'] },
                ambiguous: { type: 'boolean' },
              },
              required: ['name', 'quantity', 'unit', 'nameConfidence', 'quantityConfidence', 'unitConfidence'],
            },
          },
        },
        required: ['name', 'nameConfidence', 'ingredients', 'confidence'],
      },
    },
    columnMapping: {
      type: ['object', 'null'],
      properties: {
        fields: {
          type: 'array',
          items: {
            type: 'string',
            enum: ['recipe', 'portions', 'ingredient', 'quantity', 'unit', 'category', 'notes', 'allergens', 'ignore'],
          },
        },
        hasHeader: { type: 'boolean' },
        confidence: { type: 'number' },
      },
      required: ['fields', 'hasHeader', 'confidence'],
    },
    overallConfidence: { type: 'number' },
  },
  required: ['recipes', 'overallConfidence'],
} as const;

// ── Normalizzazione PER-CHUNK (coverage-first) ────────────────────────────────
// Il baseline deterministico stabilisce QUALI e QUANTE ricette esistono (ancora
// di copertura). L'AVENTE l'AI le NORMALIZZA in piccoli chunk: input = righe
// grezze di poche ricette, output = ingredienti splittati name/qty/unit. Ogni
// ricetta porta un `index` STABILE (echo dell'input): il merge è per-indice, così
// un risultato parziale o fuori ordine non può MAI far sparire una ricetta.

export interface AiNormalizeRecipeInput {
  index: number; // chiave stabile: l'AI deve ri-emetterla identica
  name: string;
  rawLines: string[]; // righe ingrediente grezze viste dal parser
}

export interface AiNormalizeInput {
  recipes: AiNormalizeRecipeInput[];
}

const aiNormalizedRecipeSchema = z.object({
  index: z.number().int(), // STABLE KEY
  name: z.string().nullable().default(null),
  nameConfidence: confidence,
  portions: z.number().int().positive().nullable().catch(null),
  ingredients: z.array(aiIngredientSchema).default([]),
  ambiguityFlags: z.array(z.string()).default([]),
});

export const aiNormalizeResultSchema = z.object({
  recipes: z.array(aiNormalizedRecipeSchema).default([]),
});

export type AiNormalizeResult = z.infer<typeof aiNormalizeResultSchema>;
export type AiNormalizedRecipe = z.infer<typeof aiNormalizedRecipeSchema>;

/** Gemini responseSchema del chunk (piccolo → output corto, niente troncamento). */
export const GEMINI_NORMALIZE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    recipes: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          index: { type: 'INTEGER' },
          name: { type: 'STRING', nullable: true },
          nameConfidence: { type: 'NUMBER' },
          portions: { type: 'INTEGER', nullable: true },
          ambiguityFlags: { type: 'ARRAY', items: { type: 'STRING' } },
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
              },
              required: ['name', 'quantity', 'unit', 'nameConfidence', 'quantityConfidence', 'unitConfidence'],
            },
          },
        },
        required: ['index', 'name', 'nameConfidence', 'ingredients'],
      },
    },
  },
  required: ['recipes'],
} as const;

/** Anthropic tool input schema del chunk (parità col path Gemini). */
export const NORMALIZE_TOOL_SCHEMA = {
  type: 'object',
  properties: {
    recipes: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          index: { type: 'integer' },
          name: { type: ['string', 'null'] },
          nameConfidence: { type: 'number' },
          portions: { type: ['integer', 'null'] },
          ambiguityFlags: { type: 'array', items: { type: 'string' } },
          ingredients: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                rawText: { type: 'string' },
                name: { type: ['string', 'null'] },
                quantity: { type: ['number', 'null'] },
                unit: { type: ['string', 'null'], enum: [...AI_UNITS, null] },
                nameConfidence: { type: 'number' },
                quantityConfidence: { type: 'number' },
                unitConfidence: { type: 'number' },
              },
              required: ['name', 'quantity', 'unit', 'nameConfidence', 'quantityConfidence', 'unitConfidence'],
            },
          },
        },
        required: ['index', 'name', 'nameConfidence', 'ingredients'],
      },
    },
  },
  required: ['recipes'],
} as const;

/** Ri-export tipo per comodità dei consumatori dell'adapter. */
export type { ImportColumnField };
