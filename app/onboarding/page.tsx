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

const fieldClass = 'w-full rounded-xl border border-[#E5DDD0] px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#C9962A]/30 focus:border-[#C9962A] bg-white';
const labelClass = 'block text-sm font-medium text-[#1A2B4A] mb-1.5';

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
    <div className="min-h-screen bg-[#FAF7F2] flex items-center justify-center p-4">
      <div className="w-full max-w-md">

        {/* Header */}
        <div className="text-center mb-8">
          <div className="font-playfair text-3xl font-black mb-2">
            <span className="text-[#1A2B4A]">Pasticceria</span>
            <span className="text-[#C9962A]">OS</span>
          </div>
          <h1 className="font-playfair text-xl font-bold text-[#1A2B4A]">
            {copy.title}
          </h1>
          <p className="mt-1.5 text-sm text-[#6B7280]">
            {copy.subtitle}
          </p>
        </div>

        <div className="bg-white rounded-2xl border border-[#E5DDD0] p-8">
          <form action={formAction} className="space-y-5">
            {state.status === 'error' && (
              <div className="rounded-xl bg-[#C0392B]/[0.06] border border-[#C0392B]/30 p-3 text-sm text-[#C0392B]">
                {state.error}
              </div>
            )}

            <div>
              <label className={labelClass}>
                Tipo di account <span className="text-[#C0392B]">*</span>
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
                  <div className="rounded-xl border-2 border-[#E5DDD0] p-3 text-center text-sm transition-colors peer-checked:border-[#C9962A] peer-checked:bg-[#C9962A]/[0.06]">
                    <div className="text-xl">🥐</div>
                    <div className="font-semibold text-[#1A2B4A]">Pasticceria</div>
                    <div className="text-xs text-[#6B7280]">Acquisto dai fornitori</div>
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
                  <div className="rounded-xl border-2 border-[#E5DDD0] p-3 text-center text-sm transition-colors peer-checked:border-[#14B8A6] peer-checked:bg-[#14B8A6]/[0.06]">
                    <div className="text-xl">🚚</div>
                    <div className="font-semibold text-[#1A2B4A]">Fornitore</div>
                    <div className="text-xs text-[#6B7280]">Vendo alle pasticcerie</div>
                  </div>
                </label>
              </div>
            </div>

            <div>
              <label className={labelClass}>
                Nome della tua attività <span className="text-[#C0392B]">*</span>
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
                Città <span className="text-[#6B7280] font-normal text-xs">(opz.)</span>
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
                {copy.emailLabel} <span className="text-[#6B7280] font-normal text-xs">(opz.)</span>
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
              className="w-full py-3 bg-[#1A2B4A] hover:bg-[#243660] text-white rounded-xl font-semibold text-sm transition-colors disabled:opacity-60 mt-2"
            >
              {pending ? 'Creazione in corso…' : copy.cta}
            </button>
          </form>
        </div>

        <p className="text-xs text-center text-[#6B7280] mt-4">
          Potrai aggiungere altri membri del team dalle impostazioni.
        </p>
      </div>
    </div>
  );
}
