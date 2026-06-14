// =============================================================================
// lib/public-origin.ts
// Origin PUBBLICO della richiesta per i redirect dei route handler. Dietro il
// proxy Railway `new URL(request.url).origin` è l'origin INTERNO (localhost:8080):
// usarlo nei redirect manderebbe l'utente su localhost. Si preferiscono gli
// header x-forwarded-* (impostati dal proxy), poi NEXT_PUBLIC_APP_URL, infine
// l'origin della richiesta come ultimo fallback.
// =============================================================================

export function publicOrigin(request: Request): string {
  const h = request.headers;
  const host = h.get('x-forwarded-host') ?? h.get('host');
  if (host) {
    const proto = h.get('x-forwarded-proto') ?? 'https';
    return `${proto}://${host}`;
  }
  const env = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/+$/, '');
  if (env) return env;
  return new URL(request.url).origin;
}
