'use client';

// =============================================================================
// app/(main)/orders/new/NewOrderForm.tsx
// Form creazione ordine (Client Component). I dati (fornitori, ingredienti,
// eventuale prefill da shortage piano) arrivano dal Server Component padre:
// nessun fetch client, nessun dato statico.
// =============================================================================

import { useEffect, useMemo, useState } from 'react';
import { useFormState } from 'react-dom';
import Link from 'next/link';
import { ClipboardList, AlertTriangle } from 'lucide-react';
import { IDLE_STATE } from '@/lib/utils';
import { createOrderAction } from '@/modules/ordering/actions';
import { SubmitButton } from '@/components/ui/SubmitButton';

export interface SupplierOption   { id: string; name: string; email?: string | null }
export interface IngredientOption { id: string; name: string; unit: string; unitPrice: number | null }
export interface PrefillRow {
  ingredientProductId: string;
  quantity: string;
  unitSnapshot: string;
  unitPriceSnapshot: string;
}

interface LineRow extends PrefillRow { key: number }

let keyCounter = 0;

function today() {
  return new Date().toISOString().slice(0, 10);
}

const EMPTY_ROW = (): LineRow => ({
  key: ++keyCounter, ingredientProductId: '', quantity: '', unitSnapshot: 'g', unitPriceSnapshot: '',
});

export function NewOrderForm({
  suppliers,
  ingredients,
  initialSupplierId,
  initialRows,
  prefillNote,
}: {
  suppliers: SupplierOption[];
  ingredients: IngredientOption[];
  initialSupplierId?: string;
  initialRows?: PrefillRow[];
  prefillNote?: string;
}) {
  const [rows, setRows] = useState<LineRow[]>(
    initialRows && initialRows.length > 0
      ? initialRows.map((r) => ({ ...r, key: ++keyCounter }))
      : [EMPTY_ROW()],
  );
  const [supplierId, setSupplierId] = useState(initialSupplierId ?? '');

  const [state, formAction] = useFormState(createOrderAction, IDLE_STATE);
  // Caso standard (Task 2): solo i campi indispensabili. Data/consegna/note e
  // unità/prezzo per riga (auto-compilati dall'ingrediente) stanno dietro "dettagli".
  const [showDetails, setShowDetails] = useState(false);

  // Flusso onesto (Task 2): comporre → RIVEDERE → creare bozza. Nessun invio
  // cieco: il primo pulsante porta alla preview, non alla creazione.
  const [reviewing, setReviewing] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  // Se il server torna un errore (validazione lato service), esci dalla review
  // così l'utente rivede il form con il messaggio in cima.
  useEffect(() => {
    if (state.status === 'error') setReviewing(false);
  }, [state]);

  const ingName = useMemo(() => {
    const m = new Map(ingredients.map((i) => [i.id, i.name]));
    return (id: string) => m.get(id) ?? '—';
  }, [ingredients]);

  // Righe valide = ingrediente scelto E quantità > 0. Solo queste finiranno in bozza.
  const validRows = useMemo(
    () => rows.filter((r) => r.ingredientProductId && (parseFloat(r.quantity) || 0) > 0),
    [rows],
  );
  // Righe compilate a metà (ingrediente senza qtà, o qtà senza ingrediente): da segnalare.
  const partialRows = useMemo(
    () =>
      rows.filter((r) => {
        const hasIng = !!r.ingredientProductId;
        const hasQty = (parseFloat(r.quantity) || 0) > 0;
        return hasIng !== hasQty; // esattamente uno dei due
      }),
    [rows],
  );
  const missingPriceCount = useMemo(
    () => validRows.filter((r) => !((parseFloat(r.unitPriceSnapshot) || 0) > 0)).length,
    [validRows],
  );
  const chosenSupplier = suppliers.find((s) => s.id === supplierId);

  function goToReview() {
    setLocalError(null);
    if (!supplierId) {
      setLocalError('Scegli un fornitore prima di continuare.');
      return;
    }
    if (validRows.length === 0) {
      setLocalError('Aggiungi almeno una riga con ingrediente e quantità.');
      return;
    }
    setReviewing(true);
  }

  function addRow() {
    setRows((p) => [...p, EMPTY_ROW()]);
  }

  function removeRow(key: number) {
    setRows((p) => p.filter((r) => r.key !== key));
  }

  function updateRow(key: number, field: keyof PrefillRow, value: string) {
    setRows((p) => p.map((r) => {
      if (r.key !== key) return r;
      const updated = { ...r, [field]: value };
      // Precompila unità e prezzo dall'ingrediente selezionato
      if (field === 'ingredientProductId') {
        const ing = ingredients.find((i) => i.id === value);
        if (ing) {
          updated.unitSnapshot = ing.unit;
          updated.unitPriceSnapshot = ing.unitPrice !== null ? String(ing.unitPrice) : '';
        }
      }
      return updated;
    }));
  }

  function handleSubmit(formData: FormData) {
    // Invia SOLO le righe valide (ingrediente + quantità): coerente con la
    // preview, che promette l'esclusione delle righe incomplete, ed evita il
    // rifiuto server per quantità 0 / ingrediente mancante.
    const lineItems = validRows.map((r) => ({
      ingredientProductId: r.ingredientProductId,
      quantity:            r.quantity,
      unitSnapshot:        r.unitSnapshot,
      unitPriceSnapshot:   r.unitPriceSnapshot || '',
    }));
    formData.set('lineItems', JSON.stringify(lineItems));
    formAction(formData);
  }

  const lineTotal = rows.reduce((sum, r) => {
    const q = parseFloat(r.quantity) || 0;
    const p = parseFloat(r.unitPriceSnapshot) || 0;
    return q && p ? sum + q * p : sum;
  }, 0);

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-2xl mx-auto">
      <div className="mb-6">
        <Link href="/orders" className="text-sm text-ink-muted hover:text-ink transition-colors">
          ← Ordini
        </Link>
        <h1 className="text-2xl sm:text-3xl font-bold text-ink mt-3">Nuovo ordine d'acquisto</h1>
      </div>

      {prefillNote && (
        <div className="mb-6 rounded-2xl bg-primary-light border border-primary-soft p-4">
          <p className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary-hover">
            <ClipboardList size={15} aria-hidden="true" className="shrink-0" /> Bozza generata dal fabbisogno
          </p>
          <p className="text-xs text-ink-muted mt-1">{prefillNote}</p>
        </div>
      )}

      <form action={handleSubmit} className="space-y-6">
        {(state.status === 'error' || localError) && (
          <div className="rounded-xl bg-danger-light border border-danger-soft p-3 text-sm text-danger">
            {state.status === 'error' ? state.error : localError}
          </div>
        )}

        {/* --- FASE COMPOSIZIONE: nascosta (non smontata) durante la review, così
            i campi restano nel DOM e vengono inviati col submit finale. --- */}
        <div className={reviewing ? 'hidden' : 'space-y-6'}>
        {/* Testata ordine */}
        <div className="bg-surface-2 rounded-2xl border border-border p-6 space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-ink">Dettagli ordine</h2>
            <button
              type="button"
              onClick={() => setShowDetails((v) => !v)}
              className="text-xs font-semibold text-primary hover:underline"
            >
              {showDetails ? 'Nascondi dettagli' : 'Mostra dettagli'}
            </button>
          </div>

          <div>
            <label className="block text-sm font-medium text-ink mb-1.5">
              Fornitore <span className="text-danger">*</span>
            </label>
            <select
              name="supplierId"
              required
              value={supplierId}
              onChange={(e) => setSupplierId(e.target.value)}
              className="w-full rounded-xl border border-border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-ring bg-surface-2"
            >
              <option value="">Seleziona fornitore…</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>{s.email ? `${s.name} — ${s.email}` : s.name}</option>
              ))}
            </select>
            {suppliers.length === 0 && (
              <p className="text-xs text-danger mt-1.5">
                Nessun fornitore in anagrafica.{' '}
                <Link href="/suppliers/new" className="underline">Creane uno</Link> prima di ordinare.
              </p>
            )}
          </div>

          {/* Avanzati: restano nel DOM (la data di default si invia comunque) ma
              visibili solo su "Mostra dettagli". Caso standard = data oggi + niente note. */}
          <div className={showDetails ? 'space-y-5' : 'hidden'}>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-ink mb-1.5">
                  Data ordine <span className="text-danger">*</span>
                </label>
                <input
                  name="orderDate"
                  type="date"
                  required
                  defaultValue={today()}
                  className="w-full rounded-xl border border-border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-ring focus:border-primary"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-ink mb-1.5">
                  Consegna prevista <span className="text-ink-muted font-normal">(opz.)</span>
                </label>
                <input
                  name="expectedDate"
                  type="date"
                  className="w-full rounded-xl border border-border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-ring focus:border-primary"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-ink mb-1.5">
                Note <span className="text-ink-muted font-normal">(opz.)</span>
              </label>
              <textarea
                name="notes"
                rows={2}
                maxLength={2000}
                defaultValue={prefillNote ? `Riordino da fabbisogno piano produzione.` : undefined}
                className="w-full rounded-xl border border-border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-ring focus:border-primary resize-none"
              />
            </div>
          </div>
        </div>

        {/* Righe ordine */}
        <div className="bg-surface-2 rounded-2xl border border-border p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-bold text-ink">
              Prodotti <span className="text-danger">*</span>
            </h2>
            <button
              type="button"
              onClick={addRow}
              className="text-xs font-semibold text-primary hover:underline"
            >
              + Aggiungi riga
            </button>
          </div>

          <div className="space-y-3">
            {rows.map((row, idx) => (
              <div key={row.key} className="grid grid-cols-12 gap-2 items-center">
                <span className="col-span-1 text-xs text-ink-muted text-center font-mono">{idx + 1}</span>

                {/* Ingrediente (essenziale; più largo quando i dettagli sono nascosti) */}
                <select
                  aria-label={`Ingrediente riga ${idx + 1}`}
                  value={row.ingredientProductId}
                  onChange={(e) => updateRow(row.key, 'ingredientProductId', e.target.value)}
                  className={`${showDetails ? 'col-span-5' : 'col-span-7'} rounded-xl border border-border px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-ring bg-surface-2`}
                >
                  <option value="">Ingrediente…</option>
                  {ingredients.map((i) => (
                    <option key={i.id} value={i.id}>{i.name}</option>
                  ))}
                </select>

                {/* Quantità (essenziale) */}
                <input
                  type="number"
                  step="0.001"
                  min="0"
                  placeholder="Qtà"
                  aria-label={`Quantità riga ${idx + 1}`}
                  value={row.quantity}
                  onChange={(e) => updateRow(row.key, 'quantity', e.target.value)}
                  className={`${showDetails ? 'col-span-2' : 'col-span-3'} rounded-xl border border-border px-2 py-2 text-sm text-center font-mono focus:outline-none focus:ring-2 focus:ring-primary-ring`}
                />

                {/* Unità + Prezzo: auto-compilati dall'ingrediente, visibili solo nei dettagli */}
                {showDetails && (
                  <>
                    <select
                      value={row.unitSnapshot}
                      onChange={(e) => updateRow(row.key, 'unitSnapshot', e.target.value)}
                      className="col-span-2 rounded-xl border border-border px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-ring bg-surface-2"
                    >
                      {['g','kg','ml','l','pz','bustina','foglio'].map((u) => (
                        <option key={u} value={u}>{u}</option>
                      ))}
                    </select>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="€/u"
                      value={row.unitPriceSnapshot}
                      onChange={(e) => updateRow(row.key, 'unitPriceSnapshot', e.target.value)}
                      className="col-span-1 rounded-xl border border-border px-2 py-2 text-sm text-center font-mono focus:outline-none focus:ring-2 focus:ring-primary-ring"
                    />
                  </>
                )}

                {/* Rimuovi */}
                {rows.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeRow(row.key)}
                    className="col-span-1 text-ink-faint hover:text-danger transition-colors text-lg leading-none text-center"
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
          </div>

          {/* Totale stimato */}
          {lineTotal > 0 && (
            <div className="mt-4 pt-4 border-t border-divider flex justify-end">
              <span className="text-sm text-ink-muted">Totale stimato:&nbsp;</span>
              <span className="text-sm font-mono font-semibold text-ink">
                {new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(lineTotal)}
              </span>
            </div>
          )}
        </div>
        </div>
        {/* --- fine FASE COMPOSIZIONE --- */}

        {/* --- FASE REVIEW: riepilogo prima della scrittura. Nessuna bozza è
            ancora stata salvata. --- */}
        {reviewing && (
          <div className="bg-surface-2 rounded-2xl border border-border p-6 space-y-4">
            <div>
              <h2 className="text-base font-bold text-ink">Rivedi prima di creare la bozza</h2>
              <p className="text-xs text-ink-muted mt-1">
                Niente è ancora stato salvato. Controlla e poi crea la bozza — l&apos;invio al
                fornitore avverrà dopo, dal dettaglio ordine.
              </p>
            </div>

            <dl className="text-sm">
              <div className="flex justify-between py-1.5 border-b border-divider">
                <dt className="text-ink-muted">Fornitore</dt>
                <dd className="font-semibold text-ink">{chosenSupplier?.name ?? '—'}</dd>
              </div>
            </dl>

            <ul className="divide-y divide-divider rounded-xl border border-border">
              {validRows.map((r) => {
                const q = parseFloat(r.quantity) || 0;
                const p = parseFloat(r.unitPriceSnapshot) || 0;
                return (
                  <li key={r.key} className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
                    <span className="font-medium text-ink">{ingName(r.ingredientProductId)}</span>
                    <span className="font-mono text-ink-muted whitespace-nowrap">
                      {q} {r.unitSnapshot}
                      {p > 0 && (
                        <span className="text-ink-faint"> · {new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(q * p)}</span>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>

            {/* Avvisi onesti su cosa NON entrerà o è incompleto */}
            {(partialRows.length > 0 || missingPriceCount > 0) && (
              <div className="rounded-xl bg-warning-light border border-warning-soft p-3 text-xs text-warning-strong space-y-1">
                {partialRows.length > 0 && (
                  <p className="flex items-start gap-1.5">
                    <AlertTriangle size={13} aria-hidden="true" className="shrink-0 mt-0.5" />
                    {partialRows.length} rig{partialRows.length === 1 ? 'a' : 'he'} incomplet{partialRows.length === 1 ? 'a' : 'e'} (senza ingrediente o quantità): {partialRows.length === 1 ? 'sarà esclusa' : 'saranno escluse'}.
                  </p>
                )}
                {missingPriceCount > 0 && (
                  <p className="flex items-start gap-1.5">
                    <AlertTriangle size={13} aria-hidden="true" className="shrink-0 mt-0.5" />
                    {missingPriceCount} rig{missingPriceCount === 1 ? 'a' : 'he'} senza prezzo: la bozza si crea comunque, il totale sarà parziale.
                  </p>
                )}
              </div>
            )}

            {lineTotal > 0 && (
              <div className="flex justify-end text-sm">
                <span className="text-ink-muted">Totale stimato:&nbsp;</span>
                <span className="font-mono font-semibold text-ink">
                  {new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(lineTotal)}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Azioni: in composizione → "Rivedi"; in review → "Torna a modificare" + "Crea bozza". */}
        {reviewing ? (
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setReviewing(false)}
              className="flex-1 py-3 text-center rounded-xl border border-border text-sm font-semibold text-ink hover:bg-surface-offset"
            >
              ← Torna a modificare
            </button>
            <SubmitButton
              pendingLabel="Creazione…"
              className="flex-1 py-3 bg-primary text-primary-fg rounded-xl text-sm font-semibold hover:bg-primary-hover transition-colors"
            >
              Crea bozza
            </SubmitButton>
          </div>
        ) : (
          <div className="flex gap-3">
            <Link
              href="/orders"
              className="flex-1 py-3 text-center rounded-xl border border-border text-sm font-semibold text-ink hover:bg-surface-offset"
            >
              Annulla
            </Link>
            <button
              type="button"
              onClick={goToReview}
              className="flex-1 py-3 bg-primary text-primary-fg rounded-xl text-sm font-semibold hover:bg-primary-hover transition-colors"
            >
              Rivedi ordine
            </button>
          </div>
        )}
      </form>
    </div>
  );
}
