'use client';
import { useFormState } from 'react-dom';

// =============================================================================
// app/(main)/ingredients/new/page.tsx
// Form creazione ingrediente. Carica fornitori via fetch client-side.
// =============================================================================

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { IDLE_STATE, UNIT_LABELS, cn } from '@/lib/utils';
import { createIngredientAction } from '@/modules/catalog/actions';
import { suggestProducts, type CatalogProductRef } from '@/modules/goods-receipts/matching';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { supplierLabel } from '@/lib/entity-label';

interface SupplierOption { id: string; name: string; email?: string | null }

// Stile campo condiviso
const fieldClass = 'w-full rounded-xl border border-border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-ring focus:border-primary bg-surface-2';
const labelClass = 'block text-sm font-medium text-ink mb-1.5';
const optClass   = 'text-ink-muted font-normal text-xs';

const UNITS = [
  { value: 'g',       label: 'Grammi (g)' },
  { value: 'kg',      label: 'Chilogrammi (kg)' },
  { value: 'ml',      label: 'Millilitri (ml)' },
  { value: 'l',       label: 'Litri (l)' },
  { value: 'pz',      label: 'Pezzi (pz)' },
  { value: 'bustina', label: 'Bustine' },
  { value: 'foglio',  label: 'Fogli' },
] as const;

export default function NewIngredientPage() {
  const [state, formAction] = useFormState(createIngredientAction, IDLE_STATE);
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([]);
  const [supplierId, setSupplierId] = useState('');
  const [name, setName] = useState('');
  const [catalog, setCatalog] = useState<CatalogProductRef[]>([]);

  // BUG-05: il fornitore deve essere assegnabile già alla creazione, altrimenti
  // l'auto-riordino ("Genera bozze per fornitore") esclude l'ingrediente.
  // Carico anche gli ingredienti esistenti per l'anti-doppione ("forse intendi…").
  useEffect(() => {
    Promise.all([
      fetch('/api/catalog/suppliers').then((r) => (r.ok ? r.json() : [])),
      fetch('/api/catalog/ingredients').then((r) => (r.ok ? r.json() : [])),
    ])
      .then(([sups, ings]) => {
        setSuppliers(Array.isArray(sups) ? sups : []);
        setCatalog(
          (Array.isArray(ings) ? ings : []).map(
            (i: { id: string; name: string; unit: CatalogProductRef['unit'] }) => ({
              id: i.id,
              name: i.name,
              unit: i.unit,
              sku: null,
              barcode: null,
            }),
          ),
        );
      })
      .catch(() => {
        setSuppliers([]);
        setCatalog([]);
      });
  }, []);

  // Anti-doppione: suggerimenti per nome simile (logica pura riusata dal matcher).
  const suggestions = useMemo(
    () => (name.trim().length >= 2 ? suggestProducts(catalog, name, 4) : []),
    [catalog, name],
  );
  const exactDuplicate = suggestions.find((s) => s.matchedBy === 'name');

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-xl mx-auto">
      <div className="mb-6">
        <Link href="/ingredients" className="text-sm text-ink-muted hover:text-ink transition-colors">
          ← Ingredienti
        </Link>
        <h1 className="text-3xl font-bold text-ink mt-3">Nuovo ingrediente</h1>
      </div>

      <div className="bg-surface-2 rounded-2xl border border-border p-6">
        <form action={formAction} className="space-y-5">
          {state.status === 'error' && (
            <div className="rounded-xl bg-danger-light border border-danger-soft p-3 text-sm text-danger">
              {state.error}
            </div>
          )}
          {state.status === 'success' && (
            <div className="rounded-xl bg-success-light border border-success-soft p-3 text-sm text-success-strong">
              {state.message}
            </div>
          )}

          <div>
            <label className={labelClass}>
              Nome <span className="text-danger">*</span>
            </label>
            <input
              name="name"
              type="text"
              required
              maxLength={200}
              placeholder="es. Farina 00"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={fieldClass}
              autoComplete="off"
            />
            {suggestions.length > 0 && (
              <div className="mt-2 rounded-xl bg-warning-light p-3">
                <p className="text-xs font-semibold text-warning-strong mb-2">
                  {exactDuplicate
                    ? '⚠ Esiste già un ingrediente con questo nome — usa quello per non frammentare le giacenze:'
                    : 'Forse intendi uno di questi? Evita i doppioni:'}
                </p>
                <ul className="space-y-1.5">
                  {suggestions.map((s) => (
                    <li key={s.product.id} className="flex items-center justify-between gap-2">
                      <span className="text-sm text-ink truncate">
                        {s.product.name}{' '}
                        <span className="text-xs text-ink-muted">({UNIT_LABELS[s.product.unit]})</span>
                      </span>
                      <Link
                        href={`/ingredients/${s.product.id}`}
                        className="shrink-0 text-xs font-semibold text-primary hover:underline"
                      >
                        Usa questo →
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>
                Unità di misura <span className="text-danger">*</span>
              </label>
              <select name="unit" required className={fieldClass}>
                <option value="">Seleziona…</option>
                {UNITS.map((u) => (
                  <option key={u.value} value={u.value}>{u.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className={labelClass}>
                SKU <span className={optClass}>(opz.)</span>
              </label>
              <input
                name="sku"
                type="text"
                maxLength={50}
                placeholder="es. FAR001"
                className={fieldClass}
              />
            </div>
          </div>

          <div>
            <label className={labelClass}>
              Prezzo per unità (€) <span className={optClass}>(opz.)</span>
            </label>
            <input
              name="unitPrice"
              type="text"
              inputMode="decimal"
              placeholder="es. 1,25"
              className={fieldClass}
            />
          </div>

          <div>
            <label className={labelClass}>
              Fornitore <span className={optClass}>(opz. — necessario per il riordino automatico)</span>
            </label>
            <select
              name="supplierId"
              value={supplierId}
              onChange={(e) => setSupplierId(e.target.value)}
              className={fieldClass}
            >
              <option value="">— Nessun fornitore —</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>{supplierLabel(s)}</option>
              ))}
            </select>
            {/* Sempre renderizzato (invisibile se c'è un fornitore): riserva lo
                spazio → il bottone "Salva" non salta quando l'avviso compare/sparisce. */}
            <p
              className={cn(
                'mt-1.5 flex items-start gap-1.5 text-xs text-warning-strong',
                supplierId !== '' && 'invisible',
              )}
              aria-hidden={supplierId !== ''}
            >
              <span aria-hidden="true">⚠</span>
              <span>
                Senza fornitore questo ingrediente <strong>non comparirà</strong> nei suggerimenti di
                riordino automatico. Puoi assegnarlo anche dopo, dalla lista ingredienti.
              </span>
            </p>
          </div>

          <div>
            <label className={labelClass}>
              Note <span className={optClass}>(opz.)</span>
            </label>
            <textarea
              name="notes"
              rows={2}
              maxLength={1000}
              placeholder="Eventuali note sull'ingrediente…"
              className={`${fieldClass} resize-none`}
            />
          </div>

          <div className="flex gap-3 pt-1">
            <Link
              href="/ingredients"
              className="flex-1 py-3 text-center rounded-xl border border-border text-sm font-semibold text-ink hover:bg-surface-offset transition-colors"
            >
              Annulla
            </Link>
            <SubmitButton
              pendingLabel="Salvataggio…"
              className="flex-1 py-3 bg-primary text-primary-fg rounded-xl text-sm font-semibold hover:bg-primary-hover transition-colors"
            >
              Salva ingrediente
            </SubmitButton>
          </div>
        </form>
      </div>
    </div>
  );
}
