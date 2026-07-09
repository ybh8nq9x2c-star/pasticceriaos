'use client';

// =============================================================================
// <HelpLauncher> — LIVELLO B: "Aiuto su questa schermata".
// Un trigger "?" (nella topbar) apre un bottom-sheet mobile-first con
// l'articolo pertinente alla rotta corrente (routeToHelpId, puro/testato).
// Nessun prop per-pagina: montato una volta, copre tutte le schermate P0.
// Se la rotta non ha un articolo dedicato, il drawer manda alla guida centrale.
// =============================================================================

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { HelpCircle, X, BookOpen } from 'lucide-react';
import { HELP_ARTICLES, routeToHelpId, slugForArticle } from '@/lib/help/content';
import { HelpArticleBody } from './HelpArticleBody';

export function HelpLauncher({ className }: { className?: string }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Chiudi al cambio rotta; Esc chiude; blocca lo scroll del body mentre è aperto.
  useEffect(() => { setOpen(false); }, [pathname]);
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setOpen(false); }
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [open]);

  const articleId = routeToHelpId(pathname);
  const article = articleId ? HELP_ARTICLES[articleId] : null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Aiuto su questa schermata"
        aria-haspopup="dialog"
        className={
          className ??
          'inline-flex items-center justify-center w-10 h-10 rounded-md text-ink-muted hover:text-ink hover:bg-surface-offset transition-colors'
        }
      >
        <HelpCircle size={20} aria-hidden="true" />
      </button>

      {open && (
        <div className="fixed inset-0 z-[60]" role="dialog" aria-modal="true" aria-label="Aiuto">
          <button
            type="button"
            aria-label="Chiudi l'aiuto"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-black/40"
          />
          {/* Bottom-sheet su mobile; pannello centrato su desktop. */}
          <div
            className="absolute inset-x-0 bottom-0 sm:inset-0 sm:m-auto sm:h-fit sm:max-w-lg
                       flex flex-col max-h-[88dvh] sm:max-h-[85vh]
                       rounded-t-2xl sm:rounded-2xl bg-surface border-t sm:border border-border shadow-lg pb-safe"
            style={{ animation: 'bk-sheet-in 220ms cubic-bezier(0.16,1,0.3,1) both' }}
          >
            <div className="flex items-center justify-between gap-3 px-4 pt-3 pb-2 border-b border-divider shrink-0">
              <span className="inline-flex items-center gap-2 min-w-0">
                <HelpCircle size={18} aria-hidden="true" className="text-primary shrink-0" />
                <span className="text-md font-bold text-ink truncate">
                  {article ? article.title : 'Aiuto'}
                </span>
              </span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Chiudi"
                className="inline-flex items-center justify-center w-9 h-9 rounded-md text-ink-muted hover:bg-surface-offset shrink-0"
              >
                <X size={18} aria-hidden="true" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-4">
              {article ? (
                <HelpArticleBody article={article} />
              ) : (
                <p className="text-sm text-ink-muted">
                  Per questa schermata non c’è una guida dedicata. Apri la guida completa qui sotto:
                  è organizzata per quello che stai facendo.
                </p>
              )}
            </div>

            <div className="px-4 py-3 border-t border-divider shrink-0">
              <Link
                href={article ? `/help/${slugForArticle(article.id)}` : '/help'}
                className="flex items-center justify-center gap-2 min-h-[44px] rounded-xl border border-border text-sm font-semibold text-ink hover:bg-surface-offset transition-colors"
              >
                <BookOpen size={16} aria-hidden="true" />
                {article ? 'Apri la guida completa' : 'Vai alla guida'}
              </Link>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
