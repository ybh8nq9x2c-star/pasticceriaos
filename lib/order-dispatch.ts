// =============================================================================
// lib/order-dispatch.ts
// Astrazione del canale di invio ordine al fornitore (email-anagrafica).
//
// Canali reali disponibili oggi:
//   - marketplace: gli ordini verso fornitori collegati viaggiano via
//     marketplace_orders e compaiono nel workspace del fornitore (canale API
//     nativo, già implementato in modules/marketplace).
//   - webhook email: se ORDER_DISPATCH_WEBHOOK_URL è configurato, l'ordine
//     viene POSTato a un servizio di invio email esterno.
//   - fallback ESPLICITO: nessun canale configurato -> l'ordine viene marcato
//     'sent' e la history riporta chiaramente che l'invio è manuale.
//     Nessuna finzione di consegna.
// =============================================================================

export interface OrderDispatchPayload {
  orderId: string;
  supplierName: string;
  supplierEmail: string;
  orderDate: string;
  expectedDate: string | null;
  notes: string | null;
  lines: {
    name: string;
    quantity: number;
    unit: string;
    unitPrice: number | null;
  }[];
}

export interface DispatchResult {
  channel: 'email_webhook' | 'manual';
  delivered: boolean;
  detail: string;
}

export async function dispatchOrderToSupplier(
  payload: OrderDispatchPayload,
): Promise<DispatchResult> {
  const webhookUrl = process.env.ORDER_DISPATCH_WEBHOOK_URL;

  if (!webhookUrl) {
    return {
      channel: 'manual',
      delivered: false,
      detail: `Canale email non configurato: ordine segnato come inviato manualmente a ${payload.supplierEmail}.`,
    };
  }

  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'purchase_order.sent', order: payload }),
      // L'invio non deve bloccare la transizione di stato oltre il ragionevole.
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      return {
        channel: 'email_webhook',
        delivered: false,
        detail: `Invio email fallito (HTTP ${res.status}): ordine comunque segnato come inviato.`,
      };
    }
    return {
      channel: 'email_webhook',
      delivered: true,
      detail: `Ordine inviato via email a ${payload.supplierEmail}.`,
    };
  } catch {
    return {
      channel: 'email_webhook',
      delivered: false,
      detail: 'Invio email non riuscito (timeout/rete): ordine comunque segnato come inviato.',
    };
  }
}
