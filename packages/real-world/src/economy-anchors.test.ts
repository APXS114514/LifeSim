import { describe, expect, it } from 'vitest';
import { createRealLifeSimulation } from './index.ts';

describe('economy-phase anchors in a real life', () => {
  it('emits the Japanese 1991 recession and 1993 recovery facts', () => {
    const session = createRealLifeSimulation({
      seed: 'economy-anchor-jp',
      region: 'JP',
      year: 1990,
    });
    const result = session.simulation.advanceTo({
      targetDate: '1995-01-01',
      stopAtMajorDecision: false,
      maxWorkUnits: 100_000,
    });
    expect(['target-reached', 'protagonist-died']).toContain(result.stopReason);

    const anchors = session.simulation.facts
      .filter((fact) => fact.type === 'history.anchor')
      .map((fact) => (fact.details as { anchor?: string }).anchor);
    expect(anchors).toContain('anchor:jp-recession-1991');
    expect(anchors).toContain('anchor:jp-recovery-1993');
  });
});
