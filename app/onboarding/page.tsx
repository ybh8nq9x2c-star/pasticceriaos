'use client';

// =============================================================================
// app/onboarding/page.tsx
// Onboarding: crea organizzazione (tipo account + nome + città/email) e, in modo
// OPZIONALE, il profilo fiscale (P.IVA + denominazione + forma giuridica).
// La P.IVA è validata offline (checksum); denominazione/forma sono manuali in V1.
// Onboarding mai bloccante: i dati fiscali sono facoltativi.
// =============================================================================

import { useState, useTransition } from 'react';
import { useFormState } from 'react-dom';
import { IDLE_STATE } from '@/lib/utils';
import { createOrganizationAction, verifyVatAction } from '@/modules/identity/actions';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { LEGAL_FORMS, LEGAL_FORM_LABELS, guessLegalForm } from '@/modules/identity/vat';
import { Logo } from '@/components/shared/Logo';

const fieldClass = 'w-full rounded-xl border border-border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-ring focus:border-primary bg-surface-2';
const labelClass = 'block text-sm font-medium text-ink mb-1.5';

const COPY = {
  customer: {
    title: 'Configura la tua pasticceria',
    subtitle: 'Crea il tuo spazio di lavoro — richiede meno di un minuto.',
    namePlaceholder: 'es. Pasticceria Rossi',
    emailLabel: 'Email pasticceria',
    emailPlaceholder: 'info@pasticceriarossi.it',
    cta: 'Crea workspace →',
  },
  supplier: {
    title: 'Configura la tua attività di fornitura',
    subtitle: 'Riceverai gli ordini delle pasticcerie collegate — bastano pochi secondi.',
    namePlaceholder: 'es. Molino Bianchi SRL',
    emailLabel: 'Email aziendale',
    emailPlaceholder: 'ordini@molinobianchi.it',
    cta: 'Crea workspace fornitore →',
  },
} as const;

export default function OnboardingPage() {
  const [state, formAction] = useFormState(createOrganizationAction, IDLE_STATE);
  const [accountType, setAccountType] = useState<'customer' | 'supplier'>('customer');
  const copy = COPY[accountType];

  const [orgName, setOrgName] = useState('');
  const [showFiscal, setShowFiscal] = useState(false);
  const [vatNumber, setVatNumber] = useState('');
  const [legalName, setLegalName] = useState('');
  const [legalForm, setLegalForm] = useState('');
  const [vatCheck, setVatCheck] = useState<{ state: 'idle' | 'valid' | 'invalid'; message?: string }>({ state: 'idle' });
  const [verifying, startVerify] = useTransition();

  function verifyVat() {
    if (!vatNumber.trim()) return;
    const fd = new FormData();
    fd.set('vat', vatNumber);
    startVerify(async () => {
      const res = await verifyVatAction({ status: 'idle' }, fd);
      if (res.status === 'success' && res.vat?.valid) {
        setVatCheck({ state: 'valid', message: `P.IVA valida (${res.vat.formatted}).` });
      } else {
        const msg = res.status === 'error' ? res.error : res.vat?.reason ?? 'P.IVA non valida.';
        setVatCheck({ state: 'invalid', message: msg });
      }
    });
  }

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Logo size={30} className="justify-center" />
          <h1 className="text-xl font-bold text-ink">{copy.title}</h1>
          <p className="mt-1.5 text-sm text-ink-muted">{copy.subtitle}</p>
        </div>

        <div className="bg-surface-2 rounded-2xl border border-border p-8">
          <form action={formAction} className="space-y-5">
            {state.status === 'error' && (
              <div className="rounded-xl bg-danger-light border border-danger-soft p-3 text-sm text-danger">
                {state.error}
              </div>
            )}

            <div>
              <label className={labelClass}>
                Tipo di account <span className="text-danger">*</span>
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="cursor-pointer">
                  <input
                    type="radio"
                    name="accountType"
                    value="customer"
                    checked={accountType === 'customer'}
                    onChange={() => setAccountType('customer')}
                    className="peer sr-only"
                  />
                  <div className="rounded-xl border-2 border-border p-3 text-center text-sm transition-colors peer-checked:border-primary-soft peer-checked:bg-primary-light">
                    <div className="text-xl">🥐</div>
                    <div className="font-semibold text-ink">Pasticceria</div>
                    <div className="text-xs text-ink-muted">Acquisto dai fornitori</div>
                  </div>
                </label>
                <label className="cursor-pointer">
                  <input
                    type="radio"
                    name="accountType"
                    value="supplier"
                    checked={accountType === 'supplier'}
                    onChange={() => setAccountType('supplier')}
                    className="peer sr-only"
                  />
                  <div className="rounded-xl border-2 border-border p-3 text-center text-sm transition-colors peer-checked:border-primary peer-checked:bg-primary-light">
                    <div className="text-xl">🚚</div>
                    <div className="font-semibold text-ink">Fornitore</div>
                    <div className="text-xs text-ink-muted">Vendo alle pasticcerie</div>
                  </div>
                </label>
              </div>
            </div>

            <div>
              <label className={labelClass}>
                Nome della tua attività <span className="text-danger">*</span>
              </label>
              <input
                name="orgName"
                type="text"
                required
                minLength={2}
                maxLength={200}
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                placeholder={copy.namePlaceholder}
                className={fieldClass}
              />
            </div>

            <div>
              <label className={labelClass}>
                Città <span className="text-ink-muted font-normal text-xs">(opz.)</span>
              </label>
              <input name="city" type="text" maxLength={100} placeholder="es. Milano" className={fieldClass} />
            </div>

            <div>
              <label className={labelClass}>
                {copy.emailLabel} <span className="text-ink-muted font-normal text-xs">(opz.)</span>
              </label>
              <input name="email" type="email" maxLength={200} placeholder={copy.emailPlaceholder} className={fieldClass} />
            </div>

            {/* ── Dati fiscali (opzionale) ─────────────────────────────────── */}
            <div className="rounded-xl border border-border bg-bg/40">
              <button
                type="button"
                onClick={() => setShowFiscal((v) => !v)}
                className="flex w-full items-center justify-between px-3 py-2.5 text-sm font-medium text-ink"
                aria-expanded={showFiscal}
              >
                <span>🧾 Dati fiscali <span className="text-ink-muted font-normal">(opzionale)</span></span>
                <span className="text-ink-muted">{showFiscal ? '−' : '+'}</span>
              </button>

              {showFiscal && (
                <div className="space-y-4 px-3 pb-3">
                  <p className="text-xs text-ink-muted">
                    Inseriscili per predisporre la fatturazione. Niente viene fatturato in automatico: prepariamo solo il profilo.
                  </p>

                  <input type="hidden" name="vatCountry" value="IT" />

                  <div>
                    <label className={labelClass}>Partita IVA</label>
                    <div className="flex gap-2">
                      <input
                        name="vatNumber"
                        type="text"
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
                        {vatCheck.state === 'invalid' && ' Puoi correggerla o proseguire senza.'}
                      </p>
                    )}
                  </div>

                  <div>
                    <div className="flex items-center justify-between">
                      <label className={labelClass}>Denominazione / ragione sociale</label>
                      {legalName.trim() && legalName.trim() !== orgName.trim() && (
                        <button
                          type="button"
                          onClick={() => setOrgName(legalName.trim())}
                          className="text-xs font-semibold text-primary hover:underline mb-1.5"
                        >
                          ↑ Usa come nome attività
                        </button>
                      )}
                    </div>
                    <input
                      name="legalName"
                      type="text"
                      maxLength={200}
                      value={legalName}
                      onChange={(e) => {
                        setLegalName(e.target.value);
                        const guess = guessLegalForm(e.target.value);
                        if (guess && !legalForm) setLegalForm(guess);
                      }}
                      placeholder="es. Molino Bianchi S.r.l."
                      className={fieldClass}
                    />
                  </div>

                  <div>
                    <label className={labelClass}>Forma giuridica</label>
                    <select
                      name="legalForm"
                      value={legalForm}
                      onChange={(e) => setLegalForm(e.target.value)}
                      className={fieldClass}
                    >
                      <option value="">— Seleziona (opz.) —</option>
                      {LEGAL_FORMS.map((f) => (
                        <option key={f} value={f}>
                          {LEGAL_FORM_LABELS[f]}
                        </option>
                      ))}
                    </select>
                    <p className="mt-1.5 text-xs text-ink-muted">
                      Dati inseriti manualmente: li potrai verificare in automatico quando attiveremo il collegamento al Registro Imprese.
                    </p>
                  </div>
                </div>
              )}
            </div>

            <SubmitButton
              pendingLabel="Creazione in corso…"
              className="w-full py-3 bg-primary hover:bg-primary-hover text-primary-fg rounded-xl font-semibold text-sm transition-colors mt-2"
            >
              {copy.cta}
            </SubmitButton>
          </form>
        </div>

        <p className="text-xs text-center text-ink-muted mt-4">
          Potrai aggiungere altri membri del team e completare i dati fiscali dalle impostazioni.
        </p>
      </div>
    </div>
  );
}
