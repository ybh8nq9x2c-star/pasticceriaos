'use client';

// =============================================================================
// app/onboarding/page.tsx
// Onboarding: crea organizzazione (nome pasticceria + città).
// Usa createOrganizationAction dal modulo identity.
//
// NB: vive FUORI dal route group (main) di proposito. Il layout (main) richiede
// un'organizzazione via requireSession(); l'onboarding è la pagina dove l'org
// viene creata, quindi non deve passare per quel layout (altrimenti loop
// /login ↔ /onboarding per gli utenti senza organizzazione).
// =============================================================================

import { useState } from 'react';
import { useFormState } from 'react-dom';
import { IDLE_STATE } from '@/lib/utils';
import { createOrganizationAction } from '@/modules/identity/actions';
import { Logo } from '@/components/shared/Logo';

const fieldClass = 'w-full rounded-xl border border-border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-ring focus:border-primary bg-surface-2';
const labelClass = 'block text-sm font-medium text-ink mb-1.5';

// Copy coerente col tipo di organizzazione scelto (pasticceria vs fornitore).
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
  const [state, formAction, pending] = useFormState(createOrganizationAction, IDLE_STATE);
  const [accountType, setAccountType] = useState<'customer' | 'supplier'>('customer');
  const copy = COPY[accountType];

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center p-4">
      <div className="w-full max-w-md">

        {/* Header */}
        <div className="text-center mb-8">
          <Logo size={30} className="justify-center" />
          <h1 className="text-xl font-bold text-ink">
            {copy.title}
          </h1>
          <p className="mt-1.5 text-sm text-ink-muted">
            {copy.subtitle}
          </p>
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
                placeholder={copy.namePlaceholder}
                className={fieldClass}
              />
            </div>

            <div>
              <label className={labelClass}>
                Città <span className="text-ink-muted font-normal text-xs">(opz.)</span>
              </label>
              <input
                name="city"
                type="text"
                maxLength={100}
                placeholder="es. Milano"
                className={fieldClass}
              />
            </div>

            <div>
              <label className={labelClass}>
                {copy.emailLabel} <span className="text-ink-muted font-normal text-xs">(opz.)</span>
              </label>
              <input
                name="email"
                type="email"
                maxLength={200}
                placeholder={copy.emailPlaceholder}
                className={fieldClass}
              />
            </div>

            <button
              type="submit"
              disabled={pending}
              className="w-full py-3 bg-primary hover:bg-primary-hover text-primary-fg rounded-xl font-semibold text-sm transition-colors disabled:opacity-60 mt-2"
            >
              {pending ? 'Creazione in corso…' : copy.cta}
            </button>
          </form>
        </div>

        <p className="text-xs text-center text-ink-muted mt-4">
          Potrai aggiungere altri membri del team dalle impostazioni.
        </p>
      </div>
    </div>
  );
}
