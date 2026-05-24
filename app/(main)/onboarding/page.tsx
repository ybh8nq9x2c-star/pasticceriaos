'use client';

// =============================================================================
// app/(main)/onboarding/page.tsx
// Onboarding: crea organizzazione (nome pasticceria + città).
// Usa createOrganizationAction dal modulo identity.
// =============================================================================

import { useFormState } from 'react-dom';
import { IDLE_STATE } from '@/lib/utils';
import { createOrganizationAction } from '@/modules/identity/actions';

const fieldClass = 'w-full rounded-xl border border-[#E5DDD0] px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#C9962A]/30 focus:border-[#C9962A] bg-white';
const labelClass = 'block text-sm font-medium text-[#1A2B4A] mb-1.5';

export default function OnboardingPage() {
  const [state, formAction, pending] = useFormState(createOrganizationAction, IDLE_STATE);

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
            Configura la tua pasticceria
          </h1>
          <p className="mt-1.5 text-sm text-[#6B7280]">
            Crea il tuo spazio di lavoro — richiede meno di un minuto.
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
                Nome della pasticceria <span className="text-[#C0392B]">*</span>
              </label>
              <input
                name="orgName"
                type="text"
                required
                minLength={2}
                maxLength={200}
                placeholder="es. Pasticceria Rossi"
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
                Email pasticceria <span className="text-[#6B7280] font-normal text-xs">(opz.)</span>
              </label>
              <input
                name="email"
                type="email"
                maxLength={200}
                placeholder="info@pasticceriarossi.it"
                className={fieldClass}
              />
            </div>

            <button
              type="submit"
              disabled={pending}
              className="w-full py-3 bg-[#1A2B4A] hover:bg-[#243660] text-white rounded-xl font-semibold text-sm transition-colors disabled:opacity-60 mt-2"
            >
              {pending ? 'Creazione in corso…' : 'Crea workspace →'}
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
