// =============================================================================
// app/(main)/settings/page.tsx
// Impostazioni organizzazione — Server Component.
// =============================================================================

import type { Metadata } from 'next';
import { requireSession } from '@/modules/identity/service';
import { PageHeader } from '@/components/ui/PageHeader';

export const metadata: Metadata = { title: 'Impostazioni' };

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-[#E5DDD0] overflow-hidden">
      <div className="px-6 py-4 border-b border-[#F0EBE1] bg-[#FAF7F2]">
        <h2 className="font-playfair text-base font-bold text-[#1A2B4A]">{title}</h2>
      </div>
      <div className="px-6 py-1 divide-y divide-[#F0EBE1]">{children}</div>
    </div>
  );
}

function Row({ label, value, badge }: { label: string; value: string; badge?: string }) {
  return (
    <div className="flex items-center justify-between py-3.5">
      <span className="text-sm text-[#6B7280]">{label}</span>
      <div className="flex items-center gap-2">
        {badge && (
          <span className="px-2 py-0.5 rounded-full bg-[#27AE60]/10 text-[#1E7E45] text-xs font-semibold">
            {badge}
          </span>
        )}
        <span className="text-sm font-medium text-[#1A2B4A]">{value}</span>
      </div>
    </div>
  );
}

// Allineato all'enum org_role del DB: owner | baker | viewer.
const ROLE_LABELS: Record<string, string> = {
  owner:  'Titolare',
  baker:  'Responsabile laboratorio',
  viewer: 'Operatore (sola lettura)',
};

export default async function SettingsPage() {
  const session = await requireSession();
  const roleLabel = ROLE_LABELS[session.role] ?? session.role;

  return (
    <div className="p-8 max-w-2xl mx-auto space-y-6">
      <PageHeader title="Impostazioni" subtitle="Account e organizzazione" />

      {/* Account */}
      <SectionCard title="Account">
        <Row label="Email" value={session.email} />
        <Row label="Ruolo" value={roleLabel} badge="Attivo" />
      </SectionCard>

      {/* Organizzazione */}
      <SectionCard title="Organizzazione">
        <Row label="Nome" value={session.organizationName} />
        <Row label="ID organizzazione" value={session.organizationId.slice(0, 8) + '…'} />
      </SectionCard>

      {/* Soglie stock */}
      <SectionCard title="Soglie magazzino">
        <div className="py-4 space-y-2">
          <p className="text-sm text-[#6B7280]">
            Le soglie di allerta scorte sono configurate per ogni ingrediente dalla scheda ingrediente
            (campo <span className="font-mono text-[#1A2B4A] text-xs bg-[#FAF7F2] px-1.5 py-0.5 rounded">Soglia minima</span>).
          </p>
          <p className="text-sm text-[#6B7280]">
            Quando la quantità scende sotto la soglia, l'ingrediente appare nella sezione{' '}
            <span className="text-[#C9962A] font-medium">Sotto soglia</span> del magazzino.
          </p>
        </div>
      </SectionCard>

      {/* Canale invio ordini */}
      <SectionCard title="Invio ordini ai fornitori">
        <div className="py-4 space-y-2">
          <p className="text-sm text-[#6B7280]">
            <span className="font-medium text-[#1A2B4A]">Fornitori collegati (marketplace):</span>{' '}
            gli ordini creati dal Marketplace arrivano direttamente nel workspace del fornitore,
            che ne aggiorna lo stato fino alla consegna.
          </p>
          <p className="text-sm text-[#6B7280]">
            <span className="font-medium text-[#1A2B4A]">Fornitori solo-email:</span>{' '}
            {process.env.ORDER_DISPATCH_WEBHOOK_URL
              ? 'l\'invio email automatico è configurato; l\'esito viene registrato nello storico stato di ogni ordine.'
              : 'l\'invio email automatico non è configurato: segnando un ordine come "inviato" la trasmissione resta manuale e lo storico stato lo riporta esplicitamente.'}
          </p>
        </div>
      </SectionCard>
    </div>
  );
}
