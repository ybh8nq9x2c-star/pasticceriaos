// =============================================================================
// SPRINT 1 MOBILE — "Da fare adesso": priorità, cap a 2, deep-link corretti.
// =============================================================================

import { describe, it, expect } from 'vitest';
import { getMobilePriorityTasks, buildBulkOrderHref } from '../priority-tasks';

const alert = (id: string, qty = 2) => ({ ingredientProductId: id, suggestedQty: qty });

describe('getMobilePriorityTasks', () => {
  it('tutti e tre i segnali presenti → max 2 task, in ordine di priorità', () => {
    const tasks = getMobilePriorityTasks({
      alerts: [alert('a'), alert('b')],
      awaitingOrders: [{ id: 'o1', supplierName: 'Molino Rossi' }],
      todayPlan: { id: 'p1', status: 'draft' },
    });
    expect(tasks).toHaveLength(2);
    expect(tasks[0].kind).toBe('order_missing');
    expect(tasks[1].kind).toBe('receive_order');
  });

  it('1 solo ordine in arrivo → link diretto al dettaglio con nome fornitore', () => {
    const tasks = getMobilePriorityTasks({
      alerts: [],
      awaitingOrders: [{ id: 'o1', supplierName: 'Molino Rossi' }],
      todayPlan: null,
    });
    expect(tasks[0].kind).toBe('receive_order');
    expect(tasks[0].href).toBe('/orders/o1');
    expect(tasks[0].title).toContain('Molino Rossi');
  });

  it('più ordini in arrivo → lista ordini', () => {
    const tasks = getMobilePriorityTasks({
      alerts: [],
      awaitingOrders: [
        { id: 'o1', supplierName: 'A' },
        { id: 'o2', supplierName: 'B' },
      ],
      todayPlan: { id: 'p1', status: 'completed' },
    });
    expect(tasks).toHaveLength(1);
    expect(tasks[0].href).toBe('/orders');
  });

  it('piano: assente → crea; aperto → completa; completato → nessun task', () => {
    expect(
      getMobilePriorityTasks({ alerts: [], awaitingOrders: [], todayPlan: null })[0],
    ).toMatchObject({ kind: 'create_plan', href: '/production/new' });
    expect(
      getMobilePriorityTasks({ alerts: [], awaitingOrders: [], todayPlan: { id: 'p9', status: 'in_progress' } })[0],
    ).toMatchObject({ kind: 'complete_plan', href: '/production/p9' });
    expect(
      getMobilePriorityTasks({ alerts: [], awaitingOrders: [], todayPlan: { id: 'p9', status: 'completed' } }),
    ).toHaveLength(0);
  });

  it('nessun segnale → nessun task (la sezione non compare)', () => {
    expect(
      getMobilePriorityTasks({ alerts: [], awaitingOrders: [], todayPlan: { id: 'p', status: 'completed' } }),
    ).toEqual([]);
  });
});

describe('buildBulkOrderHref', () => {
  it('prefilla id:qty per gli alert con quantità suggerita > 0', () => {
    const href = buildBulkOrderHref([alert('aaa', 1.5), alert('bbb', 0), alert('ccc', 3)]);
    expect(href).toBe(`/orders/new?ingredients=${encodeURIComponent('aaa:1.5,ccc:3')}`);
  });

  it('nessuna qty utilizzabile → form ordine nudo', () => {
    expect(buildBulkOrderHref([alert('aaa', 0)])).toBe('/orders/new');
  });

  it('cap a 20 ingredienti (URL corto)', () => {
    const many = Array.from({ length: 30 }, (_, i) => alert(`id${i}`, 1));
    const href = buildBulkOrderHref(many);
    expect(decodeURIComponent(href.split('=')[1]).split(',')).toHaveLength(20);
  });
});
