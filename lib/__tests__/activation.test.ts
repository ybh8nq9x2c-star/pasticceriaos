import { describe, expect, it } from 'vitest';
import { buildActivationTasks, type ActivationCounts } from '../activation';

const empty: ActivationCounts = {
  ingredients: 0, ingredientsWithThreshold: 0, ingredientsWithPrice: 0,
  recipes: 0, completedReceipts: 0, completedPlans: 0,
  posReady: false, posConfigured: false,
};

describe('buildActivationTasks', () => {
  it('org vuota → 0% e ogni task spiega cosa sblocca', () => {
    const { tasks, pct } = buildActivationTasks(empty);
    expect(pct).toBe(0);
    for (const t of tasks) expect(t.unlocks.length).toBeGreaterThan(10);
  });

  it('le soglie non contano finché non esistono ingredienti', () => {
    const { tasks } = buildActivationTasks({ ...empty, ingredientsWithThreshold: 3 });
    expect(tasks.find((t) => t.key === 'thresholds')?.done).toBe(false);
  });

  it('il primo flusso vale sia da ricevimento sia da produzione', () => {
    expect(buildActivationTasks({ ...empty, completedReceipts: 1 }).tasks.find((t) => t.key === 'first-flow')?.done).toBe(true);
    expect(buildActivationTasks({ ...empty, completedPlans: 1 }).tasks.find((t) => t.key === 'first-flow')?.done).toBe(true);
  });

  it('POS: basta la config iniziata (non tutti hanno una cassa collegabile subito)', () => {
    const { tasks } = buildActivationTasks({ ...empty, posConfigured: true });
    expect(tasks.find((t) => t.key === 'pos')?.done).toBe(true);
  });

  it('tutto attivo → 100% (la card sparisce)', () => {
    const { pct } = buildActivationTasks({
      ingredients: 10, ingredientsWithThreshold: 5, ingredientsWithPrice: 8,
      recipes: 4, completedReceipts: 2, completedPlans: 3, posReady: true, posConfigured: true,
    });
    expect(pct).toBe(100);
  });
});
