'use client';

// =============================================================================
// <FiscalProfileForm> — profilo fiscale dell'organizzazione in /settings.
// Mostra lo stato (P.IVA verificata?, provenienza dati, idoneità) e, per l'owner,
// consente modifica + nuova verifica offline + salvataggio non distruttivo.
// Riusa modules/identity (updateFiscalProfileAction / verifyVatAction) e i campi
// introdotti dalla 038. Nessun provider esterno, nessuna fatturazione attivata.
// =============================================================================

import { useState, useTransition } from 'react';
import { useFormState } from 'react-dom';
import { IDLE_STATE } from '@/lib/utils';
import { updateFiscalProfileAction, verifyVatAction, type FiscalProfileState } from '@/modules/identity/actions';
import { LEGAL_FORMS, LEGAL_FORM_LABELS, normalizeLegalForm } from '@/modules/identity/vat';
import type { FiscalProfile } from '@/modules/identity/types';

const fieldClass =
  'w-full rounded-xl border border-border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-ring focus:border-primary bg-surface-2';
const labelClass = 'block text-sm font-medium text-ink mb-1.5';

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('it-IT', { day: '2-digit', month: 'long', year: 'numeric' });
}

export function FiscalProfileForm({ initial, canEdit }: { initial: FiscalProfile; canEdit: boolean }) {
  const [state, formAction] = useFormState<FiscalProfileState, FormData>(updateFiscalProfileAction, IDLE_STATE);
  const current: FiscalProfile = state.status === 'success' && state.profile ? state.profile : initial;

  const [vatNumber, setVatNumber] = useState(initial.vatNumber ?? '');
  const [vatCountry, setVatCountry] = useState(initial.vatCountry || 'IT');
  const [legalName, setLegalName] = useState(initial.legalName ?? '');
  const [legalForm, setLegalForm] = useState<string>(initial.legalForm ?? '');
  const [vatCheck, setVatCheck] = useState<{ state: 'idle' | 'valid' | 'invalid'; message?: string }>({ state: 'idle' });
  const [verifying, startVerify] = useTransition();

  function verifyVat() {
    if (!vatNumber.trim()) return;
    const fd = new FormData();
    fd.set('vat', vatNumber);
    startVerify(async () => {
      const res = await verifyVatAction({ status: 'idle' }, fd);
      if (res.status === 'success' && res.vat?.valid) {
        setVatCheck({ state: 'valid', message: `P.IVA valida (${res.vat.formatted}). Salva per confermare.` });
      } else {
        const msg = res.status === 'error' ? res.error : res.vat?.reason ?? 'P.IVA non valida.';
        setVatCheck({ state: 'invalid', message: msg });
      }
    });
  }

  const formLabel = current.legalForm ? LEGAL_FORM_LABELS[normalizeLegalForm(current.legalForm) ?? 'altro'] : '—';

  return (
    <div className="px-6 py-5 space-y-5">
      {/* ── Stato corrente ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
        <StatusRow label="Partita IVA" value={current.vatNumber ? `${current.vatCountry} ${current.vatNumber}` : '—'} />
        <StatusRow
          label="Verifica P.IVA"
          badge={
            current.vatValidatedAt
              ? { text: '✓ Verificata', tone: 'success' }
              : current.vatNumber
                ? { text: 'Non verificata', tone: 'warning' }
                : undefined
          }
          value={current.vatValidatedAt ? `il ${formatDate(current.vatValidatedAt)}` : current.vatNumber ? 'checksum non superato' : '—'}
        />
        <StatusRow label="Denominazione" value={current.legalName ?? '—'} />
        <StatusRow label="Forma giuridica" value={formLabel} />
        <StatusRow
          label="Provenienza dati"
          value={current.fiscalDataSource === 'manual' ? 'Inseriti manualmente' : current.fiscalDataSource ?? '—'}
        />
        <StatusRow
          label="Idoneità fatturazione"
          badge={
            current.billingEligible
              ? { text: 'Idoneo', tone: 'success' }
              : { text: 'Non ancora', tone: 'neutral' }
          }
          value=""
        />
      </div>
      <p className="text-xs text-ink-muted">
        «Idoneo» significa solo che la P.IVA è formalmente valida: <strong>non</strong> attiva l&apos;emissione automatica di fatture.
      </p>

      {/* ── Modifica (solo owner) ──────────────────────────────────────────── */}
      {canEdit ? (
        <form action={formAction} className="space-y-4 border-t border-divider pt-5">
          {state.status === 'error' && (
            <p role="alert" className="rounded-md bg-danger-light px-3 py-2 text-sm text-danger">
              {state.error}
            </p>
          )}
          {state.status === 'success' && (
            <p role="status" className="rounded-md bg-success-light px-3 py-2 text-sm text-success-strong">
              {state.message}
            </p>
          )}

          <div className="grid grid-cols-[5rem,1fr] gap-3">
            <div>
              <label className={labelClass}>Paese</label>
              <input
                name="vatCountry"
                value={vatCountry}
                onChange={(e) => setVatCountry(e.target.value.toUpperCase().slice(0, 2))}
                maxLength={2}
                className={`${fieldClass} text-center uppercase`}
              />
            </div>
            <div>
              <label className={labelClass}>Partita IVA</label>
              <div className="flex gap-2">
                <input
                  name="vatNumber"
                  inputMode="numeric"
                  maxLength={30}
                  value={vatNumber}
                  onChange={(e) => {
                    setVatNumber(e.target.value);
                    setVatCheck({ state: 'idle' });
                  }}
                  placeholder="es. 00743110157"
                  className={fieldClass}
                />
                <button
                  type="button"
                  onClick={verifyVat}
                  disabled={verifying || !vatNumber.trim()}
                  className="shrink-0 rounded-xl border border-border px-3 text-sm font-semibold text-ink hover:bg-surface-offset disabled:opacity-50"
                >
                  {verifying ? '…' : 'Verifica'}
                </button>
              </div>
              {vatCheck.state !== 'idle' && (
                <p className={`mt-1.5 text-xs ${vatCheck.state === 'valid' ? 'text-success-strong' : 'text-danger'}`}>
                  {vatCheck.state === 'valid' ? '✓ ' : '⚠ '}
                  {vatCheck.message}
                </p>
              )}
            </div>
          </div>

          <div>
            <label className={labelClass}>Denominazione / ragione sociale</label>
            <input
              name="legalName"
              maxLength={200}
              value={legalName}
              onChange={(e) => setLegalName(e.target.value)}
              placeholder="es. Molino Bianchi S.r.l."
              className={fieldClass}
            />
          </div>

          <div>
            <label className={labelClass}>Forma giuridica</label>
            <select name="legalForm" value={legalForm} onChange={(e) => setLegalForm(e.target.value)} className={fieldClass}>
              <option value="">— Seleziona —</option>
              {LEGAL_FORMS.map((f) => (
                <option key={f} value={f}>
                  {LEGAL_FORM_LABELS[f]}
                </option>
              ))}
            </select>
          </div>

          <div className="flex justify-end">
            <SaveButton />
          </div>
        </form>
      ) : (
        <p className="text-xs text-ink-muted border-t border-divider pt-4">
          Solo il titolare dell&apos;organizzazione può modificare i dati fiscali.
        </p>
      )}
    </div>
  );
}

function StatusRow({
  label,
  value,
  badge,
}: {
  label: string;
  value: string;
  badge?: { text: string; tone: 'success' | 'warning' | 'neutral' };
}) {
  const toneClass =
    badge?.tone === 'success'
      ? 'bg-success-light text-success-strong'
      : badge?.tone === 'warning'
        ? 'bg-warning-light text-warning-strong'
        : 'bg-surface-offset text-ink-muted';
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-ink-muted">{label}</span>
      <div className="flex items-center gap-2 min-w-0">
        {badge && <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${toneClass}`}>{badge.text}</span>}
        {value && <span className="font-medium text-ink truncate">{value}</span>}
      </div>
    </div>
  );
}

function SaveButton() {
  // useFormStatus richiederebbe un componente figlio del form: qui basta un submit.
  return (
    <button
      type="submit"
      className="px-5 py-2.5 bg-primary text-primary-fg rounded-xl text-sm font-semibold hover:bg-primary-hover transition-colors"
    >
      Salva dati fiscali
    </button>
  );
}
