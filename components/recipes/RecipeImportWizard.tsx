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
  Sparkles,
  ChevronDown,
  ChevronRight,
  Trash2,
  Plus,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input, Select, Textarea } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { analyzeImportAction, importRecipesAction } from '@/modules/recipe-import/actions';
import type { ImportSummary, ParsedRecipe } from '@/modules/recipe-import/types';
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

const STEPS = ['Carica o incolla', 'Analizza', 'Controlla e correggi', 'Importa'];

export function RecipeImportWizard({ catalog }: { catalog: CatalogIngredient[] }) {
  const [stepIdx, setStepIdx] = useState(0); // 0=input, 2=review, 3=done
  const [pasted, setPasted] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [recipes, setRecipes] = useState<EditRecipe[]>([]);
  const [globalWarnings, setGlobalWarnings] = useState<string[]>([]);
  const [analyzeErr, setAnalyzeErr] = useState<string | null>(null);
  const [importErr, setImportErr] = useState<string | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [analyzing, startAnalyze] = useTransition();
  const [importing, startImport] = useTransition();

  const catalogByName = useMemo(() => new Map(catalog.map((c) => [c.id, c])), [catalog]);

  function analyze() {
    setAnalyzeErr(null);
    const fd = new FormData();
    let kind: 'text' | 'csv' | 'pdf' = 'text';
    if (file) {
      kind = file.name.toLowerCase().endsWith('.pdf') ? 'pdf' : 'csv';
      fd.set('file', file);
    } else {
      if (!pasted.trim()) {
        setAnalyzeErr('Incolla del testo o carica un file (CSV o PDF).');
        return;
      }
      fd.set('text', pasted);
    }
    fd.set('kind', kind);
    startAnalyze(async () => {
      const res = await analyzeImportAction(IDLE_STATE, fd);
      if (res.status === 'success' && res.result) {
        if (res.result.recipes.length === 0) {
          setAnalyzeErr(res.result.warnings[0] ?? 'Nessuna ricetta riconosciuta.');
          return;
        }
        setRecipes(res.result.recipes.map(toEditRecipe));
        setGlobalWarnings(res.result.warnings);
        setStepIdx(2);
      } else {
        setAnalyzeErr(res.status === 'error' ? res.error : 'Analisi non riuscita.');
      }
    });
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
  const canImport = selected.length > 0 && selected.every((r) => r.name.trim() && !ingredientIssues(r));

  function runImport() {
    setImportErr(null);
    const payload = {
      recipes: selected.map((r) => ({
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
        setSummary(res.summary);
        setStepIdx(3);
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

      <Stepper current={stepIdx} />

      {stepIdx <= 1 && (
        <InputStep
          pasted={pasted}
          setPasted={setPasted}
          file={file}
          setFile={setFile}
          analyzing={analyzing}
          error={analyzeErr}
          onAnalyze={analyze}
        />
      )}

      {stepIdx === 2 && (
        <div className="space-y-4">
          {globalWarnings.length > 0 && (
            <div className="rounded-md bg-warning-light px-3 py-2 text-sm text-warning-strong space-y-0.5">
              {globalWarnings.map((w, i) => (
                <p key={i}>⚠ {w}</p>
              ))}
            </div>
          )}
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-ink-muted">
              {recipes.length} ricett{recipes.length === 1 ? 'a' : 'e'} rilevat{recipes.length === 1 ? 'a' : 'e'} ·{' '}
              <span className="font-medium text-ink">{selected.length} selezionate</span>
            </p>
            <Button variant="ghost" size="sm" onClick={() => setStepIdx(0)}>
              ← Cambia input
            </Button>
          </div>

          {recipes.map((r) => (
            <RecipeCard
              key={r.key}
              recipe={r}
              catalog={catalog}
              hasIssues={ingredientIssues(r)}
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
            {!canImport && selected.length > 0 && (
              <p className="mb-1.5 text-xs text-ink-muted">
                Completa quantità e associazione di ogni ingrediente (o creane uno nuovo) prima di importare.
              </p>
            )}
            <Button fullWidth loading={importing} disabled={!canImport} onClick={runImport}>
              <CheckCircle2 size={16} aria-hidden="true" />
              Importa {selected.length} ricett{selected.length === 1 ? 'a' : 'e'}
            </Button>
          </div>
        </div>
      )}

      {stepIdx === 3 && summary && <DoneStep summary={summary} />}
    </div>
  );
}

// ── Step indicator ─────────────────────────────────────────────────────────────

function Stepper({ current }: { current: number }) {
  // L'input copre gli step 0–1 (carica → analizza); review=2; importa=3.
  const active = current <= 1 ? 1 : current;
  return (
    <ol className="flex items-center gap-1 text-xs">
      {STEPS.map((label, i) => {
        const state = i < active ? 'done' : i === active ? 'current' : 'todo';
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
            {i < STEPS.length - 1 && <span className="flex-1 h-px bg-surface-offset mx-1" />}
          </li>
        );
      })}
    </ol>
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
}: {
  pasted: string;
  setPasted: (v: string) => void;
  file: File | null;
  setFile: (f: File | null) => void;
  analyzing: boolean;
  error: string | null;
  onAnalyze: () => void;
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
        <p className="text-sm text-ink-muted mb-3">CSV (es. esportato da Excel) o PDF testuale.</p>
        <input
          type="file"
          accept=".csv,text/csv,.pdf,application/pdf"
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
        <p role="alert" className="rounded-md bg-danger-light px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      <Button fullWidth loading={analyzing} onClick={onAnalyze}>
        <Sparkles size={16} aria-hidden="true" />
        Analizza
      </Button>
    </div>
  );
}

// ── Step 3: card ricetta editabile ─────────────────────────────────────────────

function RecipeCard({
  recipe,
  catalog,
  hasIssues,
  onPatch,
  onPatchIngredient,
  onRemoveIngredient,
  onAddIngredient,
  onDiscard,
}: {
  recipe: EditRecipe;
  catalog: CatalogIngredient[];
  hasIssues: boolean;
  onPatch: (p: Partial<EditRecipe>) => void;
  onPatchIngredient: (iKey: number, p: Partial<EditIngredient>) => void;
  onRemoveIngredient: (iKey: number) => void;
  onAddIngredient: () => void;
  onDiscard: () => void;
}) {
  return (
    <section
      className={cn(
        'rounded-lg border bg-surface-2 shadow-sm',
        recipe.selected ? 'border-border' : 'border-divider opacity-60',
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
