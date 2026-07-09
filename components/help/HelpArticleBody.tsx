// =============================================================================
// <HelpArticleBody> — rende un HelpArticle in blocchi scansionabili.
// Presentational puro (no client): riusato dal drawer contestuale E dalla
// pagina /help. Ogni tipo di blocco ha la sua etichetta e la sua icona di
// senso; niente muri di testo.
// =============================================================================

import Link from 'next/link';
import {
  Clock, Hand, Cog, Eye, AlertTriangle, Ban, CornerDownRight, ArrowRight,
} from 'lucide-react';
import type { HelpArticle, HelpBlockKind } from '@/lib/help/content';

const BLOCK_META: Record<HelpBlockKind, { label: string; icon: typeof Clock; tone: string }> = {
  when:     { label: 'Quando',            icon: Clock,          tone: 'text-ink-muted' },
  what:     { label: 'Cosa fai qui',      icon: Hand,           tone: 'text-primary' },
  system:   { label: 'Cosa succede',      icon: Cog,            tone: 'text-primary' },
  see:      { label: 'Guarda subito',     icon: Eye,            tone: 'text-ink' },
  mistakes: { label: 'Errori comuni',     icon: AlertTriangle,  tone: 'text-warning-strong' },
  never:    { label: 'Non fare mai',      icon: Ban,            tone: 'text-danger' },
  ifthen:   { label: 'Se succede questo', icon: CornerDownRight, tone: 'text-ink' },
  links:    { label: 'Vedi anche',        icon: ArrowRight,     tone: 'text-primary' },
};

export function HelpArticleBody({ article }: { article: HelpArticle }) {
  return (
    <div className="space-y-5">
      <p className="text-sm text-ink leading-relaxed bg-primary-light/50 rounded-xl px-4 py-3">
        {article.lede}
      </p>

      {article.blocks.map((block, i) => {
        const meta = BLOCK_META[block.kind];
        const Icon = meta.icon;
        return (
          <section key={i} aria-label={meta.label}>
            <h3 className={`flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide mb-1.5 ${meta.tone}`}>
              <Icon size={13} aria-hidden="true" className="shrink-0" />
              {meta.label}
            </h3>

            {block.lines && (
              <ul className="space-y-1.5">
                {block.lines.map((line, j) => (
                  <li key={j} className="flex gap-2 text-sm text-ink leading-snug">
                    <span aria-hidden="true" className="text-ink-faint select-none">·</span>
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            )}

            {block.pairs && block.kind === 'links' && (
              <ul className="space-y-1">
                {block.pairs.map((p, j) => (
                  <li key={j}>
                    {p.href ? (
                      <Link href={p.href} className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline">
                        {p.label} <ArrowRight size={13} aria-hidden="true" />
                      </Link>
                    ) : (
                      <span className="text-sm text-ink">{p.label}</span>
                    )}
                  </li>
                ))}
              </ul>
            )}

            {block.pairs && block.kind !== 'links' && (
              <ul className="space-y-1.5">
                {block.pairs.map((p, j) => (
                  <li key={j} className="flex gap-2 text-sm leading-snug">
                    <CornerDownRight size={14} aria-hidden="true" className="mt-0.5 shrink-0 text-ink-faint" />
                    {p.href ? (
                      <Link href={p.href} className="text-primary font-medium hover:underline">{p.label}</Link>
                    ) : (
                      <span className="text-ink">{p.label}</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}
