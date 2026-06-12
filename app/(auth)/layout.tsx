// =============================================================================
// app/(auth)/layout.tsx
// Shell delle pagine di autenticazione: pannello brand a sinistra (desktop),
// form a destra. Icone Lucide, brand BakeryOs via <Logo> (currentColor).
// =============================================================================

import { Calculator, Warehouse, Handshake, BarChart3 } from 'lucide-react';
import { Logo } from '@/components/shared/Logo';

const FEATURES = [
  { icon: Calculator, label: 'Calcolo del fabbisogno automatico' },
  { icon: Warehouse,  label: 'Magazzino e lotti in tempo reale' },
  { icon: Handshake,  label: 'Collegamento diretto con i fornitori' },
  { icon: BarChart3,  label: 'Food cost e analytics operative' },
] as const;

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-bg flex">
      {/* Pannello brand — metà sinistra su desktop */}
      <div className="hidden lg:flex flex-col justify-between w-1/2 bg-primary p-14 text-primary-fg">
        <div>
          <Logo size={28} className="text-primary-fg" />
          <p className="mt-5 text-primary-fg/70 text-sm leading-relaxed max-w-xs">
            Il sistema operativo per la gestione completa di pasticcerie
            artigianali e dei loro fornitori.
          </p>
        </div>

        <ul className="space-y-5">
          {FEATURES.map(({ icon: Icon, label }) => (
            <li key={label} className="flex items-center gap-3 text-sm text-primary-fg/85">
              <Icon size={18} aria-hidden="true" className="shrink-0" />
              <span>{label}</span>
            </li>
          ))}
        </ul>

        <p className="text-primary-fg/40 text-xs">© {new Date().getFullYear()} BakeryOs</p>
      </div>

      {/* Pannello form — metà destra (piena su mobile) */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-md">{children}</div>
      </div>
    </div>
  );
}
