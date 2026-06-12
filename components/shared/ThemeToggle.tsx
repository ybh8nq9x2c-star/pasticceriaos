// =============================================================================
// <ThemeToggle> — light/dark. Persiste la scelta in localStorage
// ('bakeryos-theme'); il primo paint è gestito dallo script inline nel layout.
// =============================================================================

'use client';

import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import { cn } from '@/lib/utils';

export function ThemeToggle({ className }: { className?: string }) {
  const [theme, setTheme] = useState<'light' | 'dark' | null>(null);

  useEffect(() => {
    const current = document.documentElement.getAttribute('data-theme');
    setTheme(current === 'dark' ? 'dark' : 'light');
  }, []);

  function toggle() {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    document.documentElement.setAttribute('data-theme', next);
    try {
      localStorage.setItem('bakeryos-theme', next);
    } catch {
      /* storage non disponibile: il toggle resta valido per la sessione */
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={theme === 'dark' ? 'Passa al tema chiaro' : 'Passa al tema scuro'}
      className={cn(
        'inline-flex items-center justify-center w-9 h-9 rounded-md text-ink-muted',
        'hover:text-ink hover:bg-surface-offset transition-colors',
        className,
      )}
    >
      {/* Renderizza entrambe e nasconde via CSS: niente flash di hydration */}
      <Sun size={16} className="hidden [html[data-theme=dark]_&]:block" aria-hidden="true" />
      <Moon size={16} className="block [html[data-theme=dark]_&]:hidden" aria-hidden="true" />
    </button>
  );
}
