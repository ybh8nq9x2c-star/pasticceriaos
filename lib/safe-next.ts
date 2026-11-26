// =============================================================================
// lib/safe-next.ts — destinazione post-login/conferma SOLO interna (F-10).
//
// Il vecchio controllo `startsWith('/') && !startsWith('//')` lasciava passare
// `/\evil.com`: i browser normalizzano `\` in `/`, quindi `Location: /\evil.com`
// diventa `//evil.com` → open redirect (phishing dopo un login vero).
// Qui: niente `\`, niente caratteri di controllo, e il risultato deve restare
// sulla stessa origine anche dopo il parsing URL. PURO (testabile, client-safe).
// =============================================================================

const BASE = 'http://bakeryos.invalid';

export function safeNextPath(raw: unknown, fallback: string): string {
  if (typeof raw !== 'string') return fallback;
  const v = raw.trim();
  if (!v.startsWith('/') || v.startsWith('//')) return fallback;
  // backslash e caratteri di controllo (tab/newline vengono rimossi dai browser)
  if (/[\\\u0000-\u001f\u007f]/.test(v)) return fallback;
  try {
    const u = new URL(v, BASE);
    if (u.origin !== BASE) return fallback;
    return `${u.pathname}${u.search}${u.hash}`;
  } catch {
    return fallback;
  }
}
