// =============================================================================
// app/(main)/help/[topic]/page.tsx — articolo della guida (URL da mestiere,
// es. /help/ricevimenti). Riusa lo stesso HelpArticleBody del drawer.
// =============================================================================

import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { HELP_SLUGS, articleBySlug } from '@/lib/help/content';
import { HelpArticleBody } from '@/components/help/HelpArticleBody';

export function generateStaticParams() {
  return Object.values(HELP_SLUGS).map((topic) => ({ topic }));
}

export function generateMetadata({ params }: { params: { topic: string } }): Metadata {
  const a = articleBySlug(params.topic);
  return { title: a ? `Guida · ${a.title}` : 'Guida' };
}

export default function HelpArticlePage({ params }: { params: { topic: string } }) {
  const article = articleBySlug(params.topic);
  if (!article) notFound();

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-2xl mx-auto">
      <Link href="/help" className="inline-flex items-center gap-1 text-sm text-ink-muted hover:text-ink transition-colors mb-3">
        <ArrowLeft size={14} aria-hidden="true" /> Guida
      </Link>
      <h1 className="text-2xl font-bold text-ink mb-4">{article.title}</h1>
      <HelpArticleBody article={article} />

      <p className="mt-8 text-xs text-ink-faint">
        Questa scheda è anche il <strong>?</strong> in cima alla schermata corrispondente.
      </p>
    </div>
  );
}
