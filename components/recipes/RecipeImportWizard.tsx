'use client';

// =============================================================================
// <RecipeImportWizard> — import massivo ricette, 4 step:
//   1. Carica o incolla → 2. Analizza → 3. Controlla e correggi → 4. Importa
// La preview è SEMPRE editabile prima del salvataggio (come goods-receipts):
// nessuna creazione automatica senza revisione umana. Mobile-first.
// =============================================================================

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import {
  FileUp,
  ClipboardPaste,
  ChevronDown,
  ChevronRight,
  Trash2,
  Plus,
  CheckCircle2,
  AlertTriangle,
  Columns3,
  ArrowRight,
  Check,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input, Textarea } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { analyzeImportAction, importRecipesAction } from '@/modules/recipe-import/actions';
import { inspectCsv } from '@/modules/recipe-import/parse';
import type { ImportSummary, ParsedRecipe, CsvColumn, ImportColumnField } from '@/modules/recipe-import/types';
import { IDLE_STATE, UNIT_LABELS, cn } from '@/lib/utils';
import type { UnitOfMeasure } from '@/lib/database.types';

const UNITS: UnitOfMeasure[] = ['g', 'kg', 'ml', 'l', 'pz', 'bustina', 'foglio'];
const CREATE = '__create__';

export interface CatalogIngredient {
  id: string;
  name: string;
  unit: UnitOfMeasure;
}

interface EditIngredient {
  key: number;
  name: string;          // nome (del prodotto associato o del nuovo da creare)
  quantity: string;
  unit: UnitOfMeasure;
  productId: string | null;
  create: boolean;       // true = crea nuovo ingrediente "name"
  suggestions: { id: string; name: string; unit: UnitOfMeasure }[];
}

interface EditRecipe {
  key: number;
  selected: boolean;
  expanded: boolean;
  name: string;
  basePortions: string;
  category: string;
  notes: string;
  ingredients: EditIngredient[];
  warnings: string[];
}

let seq = 0;

/** Somma cumulativa degli esiti di import parziali successivi. */
function mergeSummary(a: ImportSummary | null, b: ImportSummary): ImportSummary {
  return {
    createdRecipes: (a?.createdRecipes ?? 0) + b.createdRecipes,
    createdIngredients: (a?.createdIngredients ?? 0) + b.createdIngredients,
    skipped: [...(a?.skipped ?? []), ...b.skipped],
  };
}

function toEditRecipe(r: ParsedRecipe): EditRecipe {
  return {
    key: ++seq,
    selected: true,
    expanded: true,
    name: r.name,
    basePortions: r.basePortions != null ? String(r.basePortions) : '1',
    category: r.category ?? '',
    notes: r.notes ?? '',
    warnings: r.warnings,
    ingredients: r.ingredients.map((l) => ({
      key: ++seq,
      name: l.matchedProductName ?? l.name,
      quantity: l.quantity != null ? String(l.quantity) : '',
      unit: l.unit ?? 'g',
      productId: l.matchedProductId,
      create: !l.matchedProductId,
      suggestions: l.suggestions.map((s) => ({ id: s.id, name: s.name, unit: s.unit })),
    })),
  };
}

// ── Mapping colonne (preview-layer) ─────────────────────────────────────────

interface MappingState {
  columns: CsvColumn[];
  fields: ImportColumnField[];
  hasHeader: boolean;
}

/** Ordine e label dei campi mappabili (obbligatori in cima). */
const FIELD_OPTIONS: { value: ImportColumnField; label: string; required?: boolean }[] = [
  { value: 'ingredient', label: 'Ingrediente', required: true },
  { value: 'quantity', label: 'Quantità', required: true },
  { value: 'unit', label: 'Unità' },
  { value: 'recipe', label: 'Nome ricetta' },
  { value: 'portions', label: 'Porzioni / resa' },
  { value: 'category', label: 'Categoria' },
  { value: 'notes', label: 'Istruzioni / note' },
  { value: 'allergens', label: 'Allergeni' },
  { value: 'ignore', label: 'Ignora colonna' },
];

const FIELD_LABEL: Record<ImportColumnField, string> = {
  ingredient: 'Ingrediente',
  quantity: 'Quantità',
  unit: 'Unità',
  recipe: 'Nome ricetta',
  portions: 'Porzioni',
  category: 'Categoria',
  notes: 'Note',
  allergens: 'Allergeni',
  ignore: 'Ignora',
};

const REQUIRED_FIELDS: ImportColumnField[] = ['ingredient', 'quantity'];

export function RecipeImportWizard({
  catalog,
  aiAvailable = false,
}: {
  catalog: CatalogIngredient[];
  aiAvailable?: boolean;
}) {
  const [stepIdx, setStepIdx] = useState(0); // 0=input, 2=review, 3=done
  const [pasted, setPasted] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [recipes, setRecipes] = useState<EditRecipe[]>([]);
  const [globalWarnings, setGlobalWarnings] = useState<string[]>([]);
  const [analyzeErr, setAnalyzeErr] = useState<string | null>(null);
  const [importErr, setImportErr] = useState<string | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [partial, setPartial] = useState<ImportSummary | null>(null);
  // Mapping colonne: testo CSV già letto (per l'eventuale recupero manuale).
  const [csvText, setCsvText] = useState<string | null>(null);
  const [mapping, setMapping] = useState<MappingState | null>(null);
  // Edge case: file tabellare non interpretabile in automatico → offriamo il
  // recupero manuale colonne SOLO come azione separata (non nel flusso normale).
  const [recoverable, setRecoverable] = useState(false);
  // Review: mostra solo le ricette da confermare ("correggi solo l'incerto").
  const [onlyNeedsConfirm, setOnlyNeedsConfirm] = useState(false);
  const [analyzing, startAnalyze] = useTransition();
  const [importing, startImport] = useTransition();

  const catalogByName = useMemo(() => new Map(catalog.map((c) => [c.id, c])), [catalog]);

  // Analisi server. L'AI, se configurata, viene usata in automatico dal server:
  // il client non espone alcuna scelta. Porta direttamente alla review.
  async function callAnalyze(args: {
    kind: 'text' | 'csv' | 'pdf';
    text?: string;
    file?: File;
    mapping?: { fields: ImportColumnField[]; hasHeader: boolean };
  }) {
    const fd = new FormData();
    fd.set('kind', args.kind);
    if (args.text != null) fd.set('text', args.text);
    if (args.file) fd.set('file', args.file);
    if (args.mapping) fd.set('mapping', JSON.stringify(args.mapping));
    const res = await analyzeImportAction(IDLE_STATE, fd);
    if (res.status === 'success' && res.result) {
      if (res.result.recipes.length === 0) {
        setAnalyzeErr(res.result.warnings[0] ?? 'Non sono riuscito a leggere le ricette in questo file.');
        // Recupero manuale colonne disponibile solo se è un file tabellare e
        // non c'è l'AI a interpretarlo automaticamente.
        setRecoverable(args.kind === 'csv' && !aiAvailable && !args.mapping);
        return;
      }
      setRecipes(res.result.recipes.map(toEditRecipe));
      setGlobalWarnings(res.result.warnings);
      setStepIdx(2);
    } else {
      setAnalyzeErr(res.status === 'error' ? res.error : 'Analisi non riuscita.');
    }
  }

  function analyze() {
    setAnalyzeErr(null);
    setRecoverable(false);
    if (file) {
      const lower = file.name.toLowerCase();
      // I fogli di calcolo binari non sono leggibili come testo: invece di
      // mandare "spazzatura" al parser, guidiamo l'utente al CSV (messaggio
      // azionabile) — il supporto .xlsx nativo è un lavoro a parte (fase 2).
      if (/\.(xlsx|xlsm|xlsb|xls|numbers|ods)$/.test(lower)) {
        setAnalyzeErr(
          'I fogli di calcolo (Excel/Numbers) non sono ancora supportati direttamente. Aprilo e salva/esporta come CSV (UTF-8), poi ricarica il CSV — oppure copia le righe e incollale qui sopra.',
        );
        return;
      }
      if (lower.endsWith('.pdf')) {
        startAnalyze(() => callAnalyze({ kind: 'pdf', file }));
        return;
      }
      // CSV: andiamo DIRETTI all'analisi (niente passo colonne nel flusso normale).
      // Header strani / file disordinati li gestisce il server (AI se disponibile,
      // altrimenti euristica). Teniamo il testo per l'eventuale recupero manuale.
      startAnalyze(async () => {
        const text = await file.text();
        setCsvText(text);
        await callAnalyze({ kind: 'csv', text });
      });
      return;
    }
    if (!pasted.trim()) {
      setAnalyzeErr('Incolla del testo o carica un file (CSV o PDF).');
      return;
    }
    startAnalyze(() => callAnalyze({ kind: 'text', text: pasted }));
  }

  // ── recupero manuale colonne (edge case, fuori dal flusso normale) ──────────
  function openManualMapping() {
    if (!csvText) return;
    const insp = inspectCsv(csvText);
    setMapping({
      columns: insp.columns,
      fields: insp.columns.map((c) => c.suggested),
      hasHeader: insp.hasHeader,
    });
    setAnalyzeErr(null);
    setRecoverable(false);
    setStepIdx(1);
  }

  // ── mapping colonne ─────────────────────────────────────────────────────────
  function changeField(index: number, field: ImportColumnField) {
    setMapping((m) => {
      if (!m) return m;
      const fields = m.fields.slice();
      fields[index] = field;
      return { ...m, fields };
    });
  }
  function toggleHeader(next: boolean) {
    if (!csvText) return;
    const insp = inspectCsv(csvText, next);
    setMapping((m) => {
      // Conserva le scelte utente se il numero di colonne non cambia.
      const fields =
        m && insp.columns.length === m.fields.length ? m.fields : insp.columns.map((c) => c.suggested);
      return { columns: insp.columns, fields, hasHeader: insp.hasHeader };
    });
  }
  function continueMapping() {
    if (!mapping || !csvText) return;
    if (!REQUIRED_FIELDS.every((f) => mapping.fields.includes(f))) return;
    setAnalyzeErr(null);
    startAnalyze(() =>
      callAnalyze({ kind: 'csv', text: csvText, mapping: { fields: mapping.fields, hasHeader: mapping.hasHeader } }),
    );
  }
  function resetToInput() {
    setMapping(null);
    setCsvText(null);
    setOnlyNeedsConfirm(false);
    setRecoverable(false);
    setStepIdx(0);
  }

  // ── mutazioni preview ────────────────────────────────────────────────────────
  function patchRecipe(key: number, patch: Partial<EditRecipe>) {
    setRecipes((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }
  function patchIngredient(rKey: number, iKey: number, patch: Partial<EditIngredient>) {
    setRecipes((rs) =>
      rs.map((r) =>
        r.key !== rKey ? r : { ...r, ingredients: r.ingredients.map((i) => (i.key === iKey ? { ...i, ...patch } : i)) },
      ),
    );
  }
  function removeIngredient(rKey: number, iKey: number) {
    setRecipes((rs) => rs.map((r) => (r.key !== rKey ? r : { ...r, ingredients: r.ingredients.filter((i) => i.key !== iKey) })));
  }
  function addIngredient(rKey: number) {
    setRecipes((rs) =>
      rs.map((r) =>
        r.key !== rKey
          ? r
          : { ...r, ingredients: [...r.ingredients, { key: ++seq, name: '', quantity: '', unit: 'g', productId: null, create: true, suggestions: [] }] },
      ),
    );
  }
  function discardRecipe(rKey: number) {
    setRecipes((rs) => rs.filter((r) => r.key !== rKey));
  }

  const selected = recipes.filter((r) => r.selected);
  const ingredientIssues = (r: EditRecipe) =>
    r.ingredients.length === 0 ||
    r.ingredients.some((i) => !i.quantity.trim() || (i.create ? !i.name.trim() : !i.productId));
  const recipeReady = (r: EditRecipe) => r.name.trim() !== '' && !ingredientIssues(r);
  const needsConfirmCount = recipes.filter((r) => !recipeReady(r)).length;
  // Import PARZIALE: importiamo subito le ricette pronte e isoliamo solo quelle
  // ancora da sistemare. Niente "fail-all": una riga problematica non blocca le
  // altre. Le bloccate restano in review per la correzione.
  const readyRecipes = selected.filter(recipeReady);
  const blockedRecipes = selected.filter((r) => !recipeReady(r));
  const canImport = readyRecipes.length > 0;

  function runImport() {
    setImportErr(null);
    const ready = recipes.filter((r) => r.selected && recipeReady(r));
    if (ready.length === 0) return;
    const sentKeys = new Set(ready.map((r) => r.key));
    const payload = {
      recipes: ready.map((r) => ({
        name: r.name.trim(),
        basePortions: r.basePortions || '1',
        category: r.category.trim() || null,
        notes: r.notes.trim() || null,
        ingredients: r.ingredients.map((i) => ({
          quantity: i.quantity,
          unit: i.unit,
          productId: i.create ? null : i.productId,
          createName: i.create ? i.name.trim() : null,
        })),
      })),
    };
    const fd = new FormData();
    fd.set('payload', JSON.stringify(payload));
    startImport(async () => {
      const res = await importRecipesAction(IDLE_STATE, fd);
      if (res.status === 'success' && res.summary) {
        const merged = mergeSummary(partial, res.summary);
        const remaining = recipes.filter((r) => !sentKeys.has(r.key));
        if (remaining.length === 0) {
          setSummary(merged);
          setStepIdx(3);
        } else {
          // Restano ricette (da sistemare o non selezionate): teniamo aperta la
          // review e mostriamo l'esito parziale cumulativo.
          setRecipes(remaining);
          setPartial(merged);
        }
      } else {
        setImportErr(res.status === 'error' ? res.error : 'Import non riuscito.');
      }
    });
  }

  return (
    <div className="max-w-3xl mx-auto p-4 sm:p-6 lg:p-8 space-y-5">
      <div>
        <Link href="/recipes" className="text-sm text-ink-muted hover:text-ink transition-colors">
          ← Ricette
        </Link>
        <h1 className="text-2xl sm:text-3xl font-bold text-ink mt-2">Importa ricette</h1>
        <p className="text-sm text-ink-muted mt-1">
          Carica un CSV/PDF o incolla i tuoi appunti: niente viene salvato finché non controlli e confermi.
        </p>
      </div>

      <Stepper activeIndex={stepIdx >= 3 ? 2 : stepIdx === 2 ? 1 : 0} />

      {stepIdx <= 1 && !mapping && (
        <InputStep
          pasted={pasted}
          setPasted={setPasted}
          file={file}
          setFile={setFile}
          analyzing={analyzing}
          error={analyzeErr}
          onAnalyze={analyze}
          showRecovery={recoverable && !!csvText}
          onRecover={openManualMapping}
        />
      )}

      {stepIdx === 1 && mapping && (
        <MappingStep
          state={mapping}
          analyzing={analyzing}
          error={analyzeErr}
          onChangeField={changeField}
          onToggleHeader={toggleHeader}
          onBack={resetToInput}
          onContinue={continueMapping}
        />
      )}

      {stepIdx === 2 && (
        <div className="space-y-4">
          {partial && (
            <div className="rounded-md bg-success-light px-3 py-2 text-sm text-success-strong">
              <p className="font-medium inline-flex items-center gap-1">
                <CheckCircle2 size={14} aria-hidden="true" />
                {partial.createdRecipes} ricett{partial.createdRecipes === 1 ? 'a importata' : 'e importate'}
                {partial.createdIngredients > 0 && ` · ${partial.createdIngredients} ingredienti nuovi a catalogo`}
              </p>
              <p className="mt-0.5">
                Le ricette qui sotto non sono ancora state importate: completale e premi di nuovo Importa.
              </p>
              {partial.skipped.length > 0 && (
                <ul className="mt-1 list-disc pl-4 text-xs">
                  {partial.skipped.map((s, i) => (
                    <li key={i}>
                      «{s.name}» — {s.reason}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          {globalWarnings.length > 0 && (
            <div className="rounded-md bg-warning-light px-3 py-2 text-sm text-warning-strong space-y-0.5">
              {globalWarnings.map((w, i) => (
                <p key={i}>⚠ {w}</p>
              ))}
            </div>
          )}

          {/* Riepilogo umano: trovate N · M pronte · K da confermare. */}
          {recipes.length > 0 && (
            <div className="rounded-lg border border-border bg-surface-2 p-3">
              <p className="text-sm text-ink">
                Trovate <span className="font-semibold">{recipes.length}</span>{' '}
                ricett{recipes.length === 1 ? 'a' : 'e'} ·{' '}
                <span className="font-semibold text-success-strong">{recipes.length - needsConfirmCount}</span>{' '}
                pront{recipes.length - needsConfirmCount === 1 ? 'a' : 'e'} da importare
                {needsConfirmCount > 0 && (
                  <>
                    {' · '}
                    <span className="font-semibold text-warning-strong">{needsConfirmCount}</span> da confermare
                  </>
                )}
              </p>
              {needsConfirmCount > 0 && (
                <p className="mt-1 text-xs text-ink-muted">
                  Le ricette con un segno ambra hanno qualcosa da controllare (di solito una quantità o un
                  ingrediente). Niente viene salvato finché non premi Importa.
                </p>
              )}
              {needsConfirmCount > 0 && (
                <button
                  type="button"
                  onClick={() => setOnlyNeedsConfirm((v) => !v)}
                  className="mt-2 inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-xs font-medium text-ink hover:bg-surface-offset transition-colors"
                >
                  {onlyNeedsConfirm ? 'Mostra tutte' : `Mostra solo da confermare (${needsConfirmCount})`}
                </button>
              )}
            </div>
          )}

          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-ink-muted">
              {recipes.length} ricett{recipes.length === 1 ? 'a' : 'e'} rilevat{recipes.length === 1 ? 'a' : 'e'} ·{' '}
              <span className="font-medium text-ink">{selected.length} selezionate</span>
            </p>
            <div className="flex items-center gap-1.5">
              {mapping && (
                <Button variant="ghost" size="sm" onClick={() => setStepIdx(1)}>
                  ← Colonne
                </Button>
              )}
              <Button variant="ghost" size="sm" onClick={resetToInput}>
                ← Cambia input
              </Button>
            </div>
          </div>

          {(onlyNeedsConfirm ? recipes.filter((r) => !recipeReady(r)) : recipes).map((r) => (
            <RecipeCard
              key={r.key}
              recipe={r}
              catalog={catalog}
              hasIssues={ingredientIssues(r)}
              needsConfirm={!recipeReady(r)}
              onPatch={(p) => patchRecipe(r.key, p)}
              onPatchIngredient={(iKey, p) => patchIngredient(r.key, iKey, p)}
              onRemoveIngredient={(iKey) => removeIngredient(r.key, iKey)}
              onAddIngredient={() => addIngredient(r.key)}
              onDiscard={() => discardRecipe(r.key)}
            />
          ))}

          {importErr && (
            <p role="alert" className="rounded-md bg-danger-light px-3 py-2 text-sm text-danger">
              {importErr}
            </p>
          )}

          <div
            className="sticky bottom-0 -mx-4 px-4 py-3 bg-glass backdrop-blur border-t border-divider sm:mx-0 sm:px-0 sm:bg-transparent sm:backdrop-blur-0 sm:border-0"
            style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
          >
            {readyRecipes.length === 0 && selected.length > 0 && (
              <p className="mb-1.5 text-xs text-ink-muted">
                Nessuna ricetta è ancora pronta: completa quantità e associazione degli ingredienti (o creane di nuovi) per importare.
              </p>
            )}
            {readyRecipes.length > 0 && blockedRecipes.length > 0 && (
              <p className="mb-1.5 text-xs text-ink-muted">
                {blockedRecipes.length} ricett{blockedRecipes.length === 1 ? 'a' : 'e'} da sistemare{' '}
                {blockedRecipes.length === 1 ? 'resta' : 'restano'} qui · le {readyRecipes.length} pronte vengono importate ora.
              </p>
            )}
            <Button fullWidth loading={importing} disabled={!canImport} onClick={runImport}>
              <CheckCircle2 size={16} aria-hidden="true" />
              Importa {readyRecipes.length} ricett{readyRecipes.length === 1 ? 'a' : 'e'}
            </Button>
          </div>
        </div>
      )}

      {stepIdx === 3 && summary && <DoneStep summary={summary} />}
    </div>
  );
}

// ── Step indicator ─────────────────────────────────────────────────────────────

function Stepper({ activeIndex }: { activeIndex: number }) {
  // Flusso semplice a 3 passi: l'analisi è automatica e invisibile (non è un passo).
  const labels = ['Carica o incolla', 'Controlla', 'Importa'];
  return (
    <ol className="flex items-center gap-1 text-xs">
      {labels.map((label, i) => {
        const state = i < activeIndex ? 'done' : i === activeIndex ? 'current' : 'todo';
        return (
          <li key={label} className="flex items-center gap-1 flex-1 last:flex-none">
            <span
              className={cn(
                'inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full font-mono',
                state === 'current'
                  ? 'bg-primary text-primary-fg'
                  : state === 'done'
                    ? 'bg-success text-white'
                    : 'bg-surface-offset text-ink-muted',
              )}
            >
              {state === 'done' ? '✓' : i + 1}
            </span>
            <span className={cn('hidden sm:inline', state === 'current' ? 'text-ink font-medium' : 'text-ink-muted')}>
              {label}
            </span>
            {i < labels.length - 1 && <span className="flex-1 h-px bg-surface-offset mx-1" />}
          </li>
        );
      })}
    </ol>
  );
}

// ── Step 2: mappatura colonne ──────────────────────────────────────────────────

function MappingStep({
  state,
  analyzing,
  error,
  onChangeField,
  onToggleHeader,
  onBack,
  onContinue,
}: {
  state: MappingState;
  analyzing: boolean;
  error: string | null;
  onChangeField: (index: number, field: ImportColumnField) => void;
  onToggleHeader: (next: boolean) => void;
  onBack: () => void;
  onContinue: () => void;
}) {
  const hasIngredient = state.fields.includes('ingredient');
  const hasQuantity = state.fields.includes('quantity');
  const canContinue = hasIngredient && hasQuantity;

  return (
    <div className="space-y-4">
      <section className="bg-surface-2 rounded-lg border border-border shadow-sm p-4 sm:p-5">
        <h2 className="flex items-center gap-2 text-md font-semibold text-ink mb-1">
          <Columns3 size={16} aria-hidden="true" className="text-ink-muted" />
          Abbina le colonne
        </h2>
        <p className="text-sm text-ink-muted">
          Non ho riconosciuto con certezza le colonne del file. Dimmi cosa contiene ognuna: bastano «Ingrediente»
          e «Quantità» per continuare, il resto è opzionale. Niente viene salvato finché non controlli e confermi.
        </p>
      </section>

      {/* Stato campi obbligatori */}
      <div className="flex flex-wrap items-center gap-2">
        <ReqChip ok={hasIngredient} label="Ingrediente" />
        <ReqChip ok={hasQuantity} label="Quantità" />
        <span className="text-xs text-ink-faint">obbligatori per continuare</span>
      </div>

      {/* La prima riga è intestazione? */}
      <label className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface-2 px-3 py-3 cursor-pointer">
        <span className="text-sm text-ink">
          La prima riga è un’intestazione
          <span className="block text-xs text-ink-muted">
            {state.hasHeader ? 'Sì: la uso per i nomi delle colonne.' : 'No: la tratto come primo dato.'}
          </span>
        </span>
        <input
          type="checkbox"
          role="switch"
          checked={state.hasHeader}
          onChange={(e) => onToggleHeader(e.target.checked)}
          className="h-5 w-5 rounded border-border accent-primary shrink-0"
        />
      </label>

      {!state.hasHeader && (
        <p className="rounded-md bg-warning-light px-3 py-2 text-xs text-warning-strong">
          Il file non sembra avere intestazioni: le colonne sono numerate e la prima riga è trattata come dato.
        </p>
      )}

      {/* Colonne */}
      <div className="space-y-2">
        {state.columns.map((col) => {
          const field = state.fields[col.index];
          return (
            <div key={col.index} className="rounded-lg border border-border bg-surface-2 p-3">
              <div className="flex items-center justify-between gap-2 mb-1">
                <p className="text-sm font-medium text-ink truncate">{col.header || `Colonna ${col.index + 1}`}</p>
                <FieldBadge field={field} />
              </div>
              {col.sample.length > 0 && (
                <p className="text-xs text-ink-muted mb-2 truncate">es. {col.sample.slice(0, 3).join(' · ')}</p>
              )}
              <select
                aria-label={`Contenuto di ${col.header || `colonna ${col.index + 1}`}`}
                value={field}
                onChange={(e) => onChangeField(col.index, e.target.value as ImportColumnField)}
                className="w-full min-h-[44px] rounded-md border border-border bg-surface px-3 text-sm text-ink"
              >
                {FIELD_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.required ? `${o.label} (obbligatorio)` : o.label}
                  </option>
                ))}
              </select>
            </div>
          );
        })}
      </div>

      {error && (
        <p role="alert" className="rounded-md bg-danger-light px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      <div
        className="sticky bottom-0 -mx-4 px-4 py-3 bg-glass backdrop-blur border-t border-divider sm:mx-0 sm:px-0 sm:bg-transparent sm:backdrop-blur-0 sm:border-0"
        style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
      >
        {!canContinue && (
          <p className="mb-1.5 text-xs text-ink-muted">
            Indica quale colonna contiene {!hasIngredient ? '«Ingrediente»' : ''}
            {!hasIngredient && !hasQuantity ? ' e ' : ''}
            {!hasQuantity ? '«Quantità»' : ''} per continuare.
          </p>
        )}
        <div className="flex gap-2">
          <Button variant="secondary" onClick={onBack}>
            ← Indietro
          </Button>
          <Button fullWidth loading={analyzing} disabled={!canContinue} onClick={onContinue}>
            Continua
            <ArrowRight size={16} aria-hidden="true" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function ReqChip({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium',
        ok ? 'bg-success-light text-success-strong' : 'bg-surface-offset text-ink-muted',
      )}
    >
      {ok ? <Check size={12} aria-hidden="true" /> : <AlertTriangle size={12} aria-hidden="true" />}
      {label}
    </span>
  );
}

function FieldBadge({ field }: { field: ImportColumnField }) {
  if (field === 'ignore') {
    return (
      <Badge variant="neutral" size="sm">
        ignorata
      </Badge>
    );
  }
  const required = field === 'ingredient' || field === 'quantity';
  return (
    <Badge variant={required ? 'primary' : 'info'} size="sm">
      {FIELD_LABEL[field]}
    </Badge>
  );
}

// ── Step 1: input ────────────────────────────────────────────────────────────

function InputStep({
  pasted,
  setPasted,
  file,
  setFile,
  analyzing,
  error,
  onAnalyze,
  showRecovery,
  onRecover,
}: {
  pasted: string;
  setPasted: (v: string) => void;
  file: File | null;
  setFile: (f: File | null) => void;
  analyzing: boolean;
  error: string | null;
  onAnalyze: () => void;
  /** Edge case file tabellare illeggibile: offre il recupero manuale colonne. */
  showRecovery: boolean;
  onRecover: () => void;
}) {
  return (
    <div className="space-y-4">
      <section className="bg-surface-2 rounded-lg border border-border shadow-sm p-4 sm:p-5">
        <h2 className="flex items-center gap-2 text-md font-semibold text-ink mb-1">
          <ClipboardPaste size={16} aria-hidden="true" className="text-ink-muted" />
          Incolla testo
        </h2>
        <p className="text-sm text-ink-muted mb-3">
          Appunti, libro ricette, ricette scritte a mano in formato testo. Più ricette insieme: separale con una riga vuota.
        </p>
        <Textarea
          label="Testo ricette"
          rows={8}
          value={pasted}
          onChange={(e) => setPasted(e.target.value)}
          placeholder={'Tiramisù (8 porzioni)\n500 g mascarpone\n6 uova\n300 g savoiardi\n\nCrostata\n...'}
          disabled={!!file}
          hint={file ? 'Hai caricato un file: rimuovilo per usare il testo incollato.' : undefined}
        />
      </section>

      <section className="bg-surface-2 rounded-lg border border-border shadow-sm p-4 sm:p-5">
        <h2 className="flex items-center gap-2 text-md font-semibold text-ink mb-1">
          <FileUp size={16} aria-hidden="true" className="text-ink-muted" />
          Oppure carica un file
        </h2>
        <p className="text-sm text-ink-muted mb-3">
          CSV o PDF testuale. I file Excel vanno prima salvati come CSV (in Excel: File → Salva come → CSV).
        </p>
        <input
          type="file"
          accept=".csv,text/csv,.pdf,application/pdf,.xlsx,.xls"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="block w-full text-sm text-ink-muted file:mr-3 file:min-h-[44px] file:px-4 file:rounded-md file:border-0 file:bg-primary file:text-primary-fg file:text-sm file:font-medium hover:file:bg-primary-hover file:cursor-pointer"
        />
        {file && (
          <p className="mt-2 text-xs text-ink-muted">
            Selezionato: <span className="font-medium text-ink">{file.name}</span>{' '}
            <button type="button" onClick={() => setFile(null)} className="text-danger underline ml-1">
              rimuovi
            </button>
          </p>
        )}
      </section>

      {error && (
        <div role="alert" className="rounded-md bg-danger-light px-3 py-2 text-sm text-danger">
          <p>{error}</p>
          {showRecovery && (
            <button
              type="button"
              onClick={onRecover}
              className="mt-1.5 inline-block text-xs font-medium underline hover:opacity-80"
            >
              Sistema le colonne a mano →
            </button>
          )}
        </div>
      )}

      <Button fullWidth loading={analyzing} onClick={onAnalyze}>
        Continua
      </Button>
    </div>
  );
}

// ── Step 3: card ricetta editabile ─────────────────────────────────────────────

function RecipeCard({
  recipe,
  catalog,
  hasIssues,
  needsConfirm,
  onPatch,
  onPatchIngredient,
  onRemoveIngredient,
  onAddIngredient,
  onDiscard,
}: {
  recipe: EditRecipe;
  catalog: CatalogIngredient[];
  hasIssues: boolean;
  needsConfirm: boolean;
  onPatch: (p: Partial<EditRecipe>) => void;
  onPatchIngredient: (iKey: number, p: Partial<EditIngredient>) => void;
  onRemoveIngredient: (iKey: number) => void;
  onAddIngredient: () => void;
  onDiscard: () => void;
}) {
  return (
    <section
      className={cn(
        'rounded-lg border bg-surface-2',
        recipe.selected ? 'border-border' : 'border-divider opacity-60',
        // Evidenziazione "da confermare": accento ambra a sinistra finché ci sono
        // campi incerti (utile soprattutto sulle bozze AI). Inset shadow per non
        // entrare in conflitto col colore del bordo.
        needsConfirm && recipe.selected
          ? 'shadow-[inset_3px_0_0_var(--color-warning)]'
          : 'shadow-sm',
      )}
    >
      <header className="flex items-center gap-2 px-3 py-2.5 border-b border-divider">
        <input
          type="checkbox"
          checked={recipe.selected}
          onChange={(e) => onPatch({ selected: e.target.checked })}
          aria-label={`Importa ${recipe.name}`}
          className="h-4 w-4 accent-[var(--color-primary)]"
        />
        <button
          type="button"
          onClick={() => onPatch({ expanded: !recipe.expanded })}
          className="flex flex-1 items-center gap-1.5 min-w-0 text-left"
        >
          {recipe.expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          <span className="font-medium text-ink truncate">{recipe.name || 'Senza nome'}</span>
          <span className="text-xs text-ink-muted shrink-0">
            · {recipe.ingredients.length} ingr.
          </span>
        </button>
        {hasIssues && recipe.selected && (
          <Badge variant="warning" size="sm">
            <AlertTriangle size={12} aria-hidden="true" /> da rivedere
          </Badge>
        )}
        <button type="button" onClick={onDiscard} aria-label={`Scarta ${recipe.name}`} className="text-ink-faint hover:text-danger">
          <Trash2 size={16} />
        </button>
      </header>

      {recipe.expanded && (
        <div className="p-3 space-y-3">
          {recipe.warnings.length > 0 && (
            <ul className="text-xs text-warning-strong space-y-0.5">
              {recipe.warnings.map((w, i) => (
                <li key={i}>⚠ {w}</li>
              ))}
            </ul>
          )}

          <div className="grid grid-cols-2 gap-2">
            <Input label="Nome ricetta" value={recipe.name} onChange={(e) => onPatch({ name: e.target.value })} />
            <Input
              label="Porzioni"
              type="number"
              min={1}
              value={recipe.basePortions}
              onChange={(e) => onPatch({ basePortions: e.target.value })}
            />
            <Input label="Categoria (opz.)" value={recipe.category} onChange={(e) => onPatch({ category: e.target.value })} />
            <Input label="Note (opz.)" value={recipe.notes} onChange={(e) => onPatch({ notes: e.target.value })} />
          </div>

          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-ink-faint">Ingredienti</p>
            {recipe.ingredients.map((ing) => (
              <IngredientRow
                key={ing.key}
                ing={ing}
                catalog={catalog}
                onPatch={(p) => onPatchIngredient(ing.key, p)}
                onRemove={() => onRemoveIngredient(ing.key)}
              />
            ))}
            <button type="button" onClick={onAddIngredient} className="text-xs font-semibold text-primary hover:underline inline-flex items-center gap-1">
              <Plus size={14} /> Aggiungi ingrediente
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

function IngredientRow({
  ing,
  catalog,
  onPatch,
  onRemove,
}: {
  ing: EditIngredient;
  catalog: CatalogIngredient[];
  onPatch: (p: Partial<EditIngredient>) => void;
  onRemove: () => void;
}) {
  const selectValue = !ing.create && ing.productId ? ing.productId : CREATE;
  return (
    <div className="rounded-md border border-divider p-2 space-y-2">
      <div className="flex items-center gap-2">
        <Input
          inputMode="decimal"
          aria-label="Quantità"
          placeholder="Qtà"
          value={ing.quantity}
          onChange={(e) => onPatch({ quantity: e.target.value })}
          wrapClassName="w-20"
        />
        <select
          aria-label="Unità"
          value={ing.unit}
          onChange={(e) => onPatch({ unit: e.target.value as UnitOfMeasure })}
          className="w-24 rounded-md border border-border bg-surface-2 px-2 min-h-[40px] text-sm text-ink"
        >
          {UNITS.map((u) => (
            <option key={u} value={u}>
              {UNIT_LABELS[u]}
            </option>
          ))}
        </select>
        <select
          aria-label="Prodotto a catalogo"
          value={selectValue}
          onChange={(e) => {
            const v = e.target.value;
            if (v === CREATE) onPatch({ create: true, productId: null });
            else {
              const c = catalog.find((x) => x.id === v);
              onPatch({ create: false, productId: v, name: c?.name ?? ing.name, unit: ing.unit });
            }
          }}
          className="flex-1 min-w-0 rounded-md border border-border bg-surface-2 px-2 min-h-[40px] text-sm text-ink"
        >
          <option value={CREATE}>➕ Crea nuovo: «{ing.name || '—'}»</option>
          {catalog.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <button type="button" onClick={onRemove} aria-label="Rimuovi ingrediente" className="text-ink-faint hover:text-danger shrink-0">
          <Trash2 size={15} />
        </button>
      </div>

      {ing.create && (
        <div className="flex items-center gap-2">
          <Input
            aria-label="Nome nuovo ingrediente"
            placeholder="Nome ingrediente da creare"
            value={ing.name}
            onChange={(e) => onPatch({ name: e.target.value })}
            wrapClassName="flex-1"
          />
          <Badge variant="warning" size="sm">nuovo</Badge>
        </div>
      )}

      {ing.create && ing.suggestions.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-ink-muted">Forse:</span>
          {ing.suggestions.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => onPatch({ create: false, productId: s.id, name: s.name })}
              className="rounded-full border border-border px-2 py-0.5 text-xs text-ink hover:bg-surface-offset"
            >
              {s.name}
            </button>
          ))}
        </div>
      )}

      {!ing.create && (
        <p className="text-xs text-success-strong inline-flex items-center gap-1">
          <CheckCircle2 size={12} aria-hidden="true" /> associato al catalogo
        </p>
      )}
    </div>
  );
}

// ── Step 4: esito ───────────────────────────────────────────────────────────

function DoneStep({ summary }: { summary: ImportSummary }) {
  return (
    <div className="bg-surface-2 rounded-lg border border-border shadow-sm p-6 text-center space-y-4">
      <div className="mx-auto w-12 h-12 rounded-full bg-success-light flex items-center justify-center">
        <CheckCircle2 className="text-success-strong" aria-hidden="true" />
      </div>
      <div>
        <h2 className="text-lg font-bold text-ink">Import completato</h2>
        <p className="text-sm text-ink-muted mt-1">
          {summary.createdRecipes} ricett{summary.createdRecipes === 1 ? 'a creata' : 'e create'}
          {summary.createdIngredients > 0 && ` · ${summary.createdIngredients} ingredienti nuovi a catalogo`}
        </p>
      </div>
      {summary.skipped.length > 0 && (
        <div className="text-left rounded-md bg-warning-light px-3 py-2 text-sm text-warning-strong">
          <p className="font-medium mb-1">{summary.skipped.length} non importate:</p>
          <ul className="space-y-0.5">
            {summary.skipped.map((s, i) => (
              <li key={i}>
                «{s.name}» — {s.reason}
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="flex gap-2 justify-center">
        <Link href="/recipes" className="px-4 py-2.5 rounded-xl bg-primary text-primary-fg text-sm font-semibold hover:bg-primary-hover">
          Vai alle ricette
        </Link>
        <Link href="/recipes/import" className="px-4 py-2.5 rounded-xl border border-border text-ink text-sm font-semibold hover:bg-surface-offset">
          Importa altre
        </Link>
      </div>
    </div>
  );
}
