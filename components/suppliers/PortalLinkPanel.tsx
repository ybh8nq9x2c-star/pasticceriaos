'use client';

// =============================================================================
// components/suppliers/PortalLinkPanel.tsx
// Genera/rigenera il link del portale fornitore (copia negli appunti).
// Rigenerare REVOCA i link precedenti (portal_token_version).
// =============================================================================

import { useState } from 'react';
import { generateSupplierLinkAction } from '@/modules/catalog/actions';

export function PortalLinkPanel({ supplierId }: { supplierId: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [copied, setCopied] = useState(false);

  async function handleGenerate() {
    setPending(true);
    setError(null);
    setCopied(false);
    const result = await generateSupplierLinkAction(supplierId);
    setPending(false);
    if ('error' in result) setError(result.error);
    else setUrl(result.url);
  }

  async function handleCopy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setError('Copia non riuscita: seleziona e copia il link manualmente.');
    }
  }

  return (
    <div className="bg-surface-2 rounded-2xl border border-border p-5">
      <h2 className="text-xs font-semibold text-ink-muted uppercase tracking-wide mb-2">
        Portale fornitore
      </h2>
      <p className="text-xs text-ink-muted mb-3">
        Invia al fornitore un link per vedere e confermare i tuoi ordini e
        caricarti DDT/fatture — senza registrazione.
      </p>

      {error && <p className="text-xs text-danger mb-2">{error}</p>}

      {url ? (
        <div className="space-y-2">
          <div className="rounded-xl bg-bg border border-border p-2.5 break-all text-xs font-mono text-ink">
            {url}
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleCopy}
              className="flex-1 min-h-[44px] bg-primary text-primary-fg rounded-xl text-sm font-semibold hover:bg-primary-hover"
            >
              {copied ? '✓ Copiato' : 'Copia link'}
            </button>
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="min-h-[44px] px-4 inline-flex items-center border border-border rounded-xl text-sm font-semibold text-ink hover:bg-surface-offset"
            >
              Apri ↗
            </a>
          </div>
          <p className="text-xs text-ink-muted">
            Valido 1 anno, nessuna registrazione richiesta. Rigenerarlo revoca i link precedenti.
          </p>
        </div>
      ) : (
        <button
          onClick={handleGenerate}
          disabled={pending}
          className="w-full min-h-[44px] bg-primary text-primary-fg rounded-xl text-sm font-semibold hover:bg-primary-hover disabled:opacity-60"
        >
          {pending ? 'Generazione…' : '🔗 Genera link portale'}
        </button>
      )}
    </div>
  );
}
