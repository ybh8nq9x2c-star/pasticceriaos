// =============================================================================
// lib/server-routes.ts — ECCEZIONI DICHIARATE al gate di sessione del middleware.
//
// Unico elenco delle route server-to-server che NON hanno una sessione Supabase
// per costruzione e si autenticano da sole nel route handler. Il middleware le
// lascia passare SOLO perché stanno qui; aggiungerne una richiede che il suo
// handler verifichi una credenziale propria (firma, token) prima di ogni scrittura.
//
//   /api/webhooks/<provider>   firma HMAC per config POS (modules/pos/secret.ts,
//                              ADR 003). Senza questa eccezione la cassa riceveva
//                              un 307 verso /login e gli scontrini si perdevano.
//
// Il portale fornitore (/portal/<token>) è un'eccezione separata e storica:
// token JWT nel path, gestita in middleware.ts.
// NB: il `matcher` di middleware.ts deve restare allineato (Next richiede un
// letterale statico): lib/__tests__/server-routes.test.ts lo verifica.
// =============================================================================

export const SERVER_TO_SERVER_PREFIXES = ['/api/webhooks/'] as const;

export function isServerToServerRoute(pathname: string): boolean {
  return SERVER_TO_SERVER_PREFIXES.some((p) => pathname.startsWith(p));
}
