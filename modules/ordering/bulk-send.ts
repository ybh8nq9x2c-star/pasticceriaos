// =============================================================================
// modules/ordering/bulk-send.ts
// Tipi ed esito ONESTO dell'invio massivo di bozze. La logica di riepilogo è
// pura (nessun I/O) così da poter essere testata: garantisce che un ordine NON
// recapitato non venga mai contato tra gli "inviati".
// =============================================================================

export type BulkSendItemOutcome = 'delivered' | 'manual' | 'failed' | 'error';

export interface BulkSendItemResult {
  orderId: string;
  outcome: BulkSendItemOutcome;
  /** Messaggio d'errore quando outcome === 'error'. */
  error?: string;
}

export interface BulkSendSummary {
  delivered: number; // recapitati davvero
  manual: number;    // passati a "inviato" ma da completare a mano
  errored: number;   // non elaborati, restano bozza
  /** Riepilogo onesto pronto da mostrare. */
  message: string;
}

export interface BulkSendResult extends BulkSendSummary {
  results: BulkSendItemResult[];
}

/**
 * Riduce gli esiti per-ordine in un riepilogo onesto. `delivered` conta SOLO i
 * recapiti attestati; `manual` gli ordini passati a "inviato" ma non recapitati
 * dal sistema (da completare a mano); `errored` quelli non elaborati (restano
 * bozza). Il messaggio non usa mai "✓ N inviati" quando N non è stato recapitato.
 */
export function summarizeBulkSend(results: BulkSendItemResult[]): BulkSendSummary {
  const delivered = results.filter((r) => r.outcome === 'delivered').length;
  const manual = results.filter((r) => r.outcome === 'manual' || r.outcome === 'failed').length;
  const errored = results.filter((r) => r.outcome === 'error').length;

  const parts: string[] = [];
  if (delivered > 0) parts.push(`${delivered} inviat${delivered === 1 ? 'o' : 'i'}`);
  if (manual > 0) parts.push(`${manual} da completare a mano`);
  if (errored > 0) parts.push(`${errored} non elaborat${errored === 1 ? 'o' : 'i'}`);
  const message = parts.length > 0 ? parts.join(' · ') : 'Nessun ordine elaborato.';

  return { delivered, manual, errored, message };
}
