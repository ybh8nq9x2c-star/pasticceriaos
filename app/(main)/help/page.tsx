// =============================================================================
// app/(main)/help/page.tsx — LIVELLO C: guida centrale.
// Organizzata per COMPITO (la giornata dell'operatore), non per sitemap tecnica.
// Server Component: contenuto statico, veloce, mobile-first.
// =============================================================================

import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, LifeBuoy } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { HELP_ARTICLES, HELP_SECTIONS, slugForArticle } from '@/lib/help/content';

export const metadata: Metadata = { title: 'Guida' };

export default function HelpIndexPage() {
  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-3xl mx-auto">
      <PageHeader
        title="Guida"
        subtitle="Come si lavora in BakeryOS, per quello che stai facendo. Ogni scheda è corta e concreta."
      />

      <div className="mb-6 flex items-start gap-3 rounded-2xl border border-primary-soft bg-primary-light/50 p-4">
        <LifeBuoy size={18} aria-hidden="true" className="mt-0.5 shrink-0 text-primary" />
        <p className="text-sm text-ink">
          In ogni schermata trovi il <strong>?</strong> in alto: apre l’aiuto di <em>quella</em> pagina.
          Qui trovi tutto, in ordine di giornata.
        </p>
      </div>

      <div className="space-y-6">
        {HELP_SECTIONS.map((section) => (
          <section key={section.id}>
            <h2 className="text-xs font-bold uppercase tracking-wide text-ink-faint mb-2">{section.title}</h2>
            <div className="rounded-2xl border border-border bg-surface-2 divide-y divide-divider overflow-hidden">
              {section.articleIds.map((id) => {
                const a = HELP_ARTICLES[id];
                if (!a) return null;
                return (
                  <Link
                    key={id}
                    href={`/help/${slugForArticle(id)}`}
                    className="flex items-center gap-3 px-4 py-3.5 hover:bg-surface-offset transition-colors group"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-ink">{a.title}</p>
                      <p className="text-xs text-ink-muted mt-0.5 line-clamp-2">{a.lede}</p>
                    </div>
                    <ArrowRight size={16} aria-hidden="true" className="shrink-0 text-ink-faint group-hover:text-primary transition-colors" />
                  </Link>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
