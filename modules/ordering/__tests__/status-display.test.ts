// =============================================================================
// SPRINT 1 flusso ordini — onestà dello stato "inviato" e pipeline a 3 nodi.
// Logica PURA: garantisce che "Inviato" appaia SOLO con recapito attestato.
// =============================================================================

import { describe, it, expect } from 'vitest';
import {
  orderStatusBadge,
  needsManualSend,
  pipelineIndex,
  ORDER_PIPELINE,
} from '../status-display';

describe('orderStatusBadge — invio onesto', () => {
  it('draft → Bozza', () => {
    expect(orderStatusBadge('draft', null)).toEqual({ label: 'Bozza', variant: 'gray' });
  });

  it('sent + delivered → "Inviato" (recapito attestato)', () => {
    expect(orderStatusBadge('sent', 'delivered')).toEqual({ label: 'Inviato', variant: 'blue' });
  });

  it('sent + manual → "Da inviare a mano" (nessun canale)', () => {
    expect(orderStatusBadge('sent', 'manual')).toEqual({ label: 'Da inviare a mano', variant: 'amber' });
  });

  it('sent + failed → "Da inviare a mano" (invio non riuscito)', () => {
    expect(orderStatusBadge('sent', 'failed')).toEqual({ label: 'Da inviare a mano', variant: 'amber' });
  });

  it('sent + null (legacy / pre-feature) → NON mostra "Inviato"', () => {
    const b = orderStatusBadge('sent', null);
    expect(b.label).toBe('Da inviare a mano');
    expect(b.label).not.toBe('Inviato');
  });

  it('confirmed → Confermato (stato legacy, ancora etichettato)', () => {
    expect(orderStatusBadge('confirmed', null)).toEqual({ label: 'Confermato', variant: 'indigo' });
  });

  it('received → Ricevuto; cancelled → Annullato', () => {
    expect(orderStatusBadge('received', null)).toEqual({ label: 'Ricevuto', variant: 'green' });
    expect(orderStatusBadge('cancelled', null)).toEqual({ label: 'Annullato', variant: 'red' });
  });
});

describe('needsManualSend', () => {
  it('true solo per ordini sent NON attestati', () => {
    expect(needsManualSend('sent', null)).toBe(true);
    expect(needsManualSend('sent', 'manual')).toBe(true);
    expect(needsManualSend('sent', 'failed')).toBe(true);
    expect(needsManualSend('sent', 'delivered')).toBe(false);
    expect(needsManualSend('draft', null)).toBe(false);
    expect(needsManualSend('received', null)).toBe(false);
  });
});

describe('pipeline a 3 nodi (Bozza → Inviato → Ricevuto)', () => {
  it('ORDER_PIPELINE non contiene confirmed', () => {
    expect(ORDER_PIPELINE).toEqual(['draft', 'sent', 'received']);
  });

  it('confirmed mappa sul passo "Inviato"; cancelled fuori pipeline', () => {
    expect(pipelineIndex('draft')).toBe(0);
    expect(pipelineIndex('sent')).toBe(1);
    expect(pipelineIndex('confirmed')).toBe(1);
    expect(pipelineIndex('received')).toBe(2);
    expect(pipelineIndex('cancelled')).toBe(-1);
  });
});
