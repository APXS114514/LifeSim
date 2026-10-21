import type { LifePrinciples } from '@lifesim/content-schema';
import { describe, expect, it } from 'vitest';
import { chooseByPrinciples, scoreOption } from './policy.ts';

const balanced: LifePrinciples = {
  family: 0.5,
  wealth: 0.5,
  health: 0.5,
  knowledge: 0.5,
  risk: 0.5,
  stability: 0.5,
};

describe('life-principle policy', () => {
  it('scores an option as the weighted sum of its principle scores', () => {
    expect(
      scoreOption({ ...balanced, knowledge: 1 }, { knowledge: 0.8, wealth: -0.2 }),
    ).toBeCloseTo(0.7, 12);
  });

  it('never picks an ineligible option, even if it scores highest', () => {
    const choice = chooseByPrinciples(balanced, [
      { id: 'best-but-forbidden', eligible: false, scores: { wealth: 1 } },
      { id: 'allowed', eligible: true, scores: { wealth: 0.1 } },
    ]);
    expect(choice?.optionId).toBe('allowed');
  });

  it('breaks ties by list order', () => {
    const choice = chooseByPrinciples(balanced, [
      { id: 'first', eligible: true, scores: { health: 0.4 } },
      { id: 'second', eligible: true, scores: { health: 0.4 } },
    ]);
    expect(choice?.optionId).toBe('first');
  });

  it('explains a choice with at most two positive contributions, largest first', () => {
    const choice = chooseByPrinciples({ ...balanced, risk: 1, knowledge: 0.9 }, [
      {
        id: 'study',
        eligible: true,
        scores: { knowledge: 0.9, risk: 0.5, stability: -0.3, wealth: 0.1 },
      },
    ]);
    expect(choice?.reasons).toEqual(['knowledge', 'risk']);
  });

  it('returns null when nothing is eligible', () => {
    expect(chooseByPrinciples(balanced, [{ id: 'x', eligible: false, scores: {} }])).toBeNull();
  });
});
