import type { SimEventFact } from '@lifesim/content-schema';
import { lifeEventCatalog, lifeEventType } from '@lifesim/systems';
import { describe, expect, it } from 'vitest';
import { factCategory, isBackgroundDecision, isDailyLifeFact } from './fact-category.ts';

/** 夹具：类别判定只看 type 与 details。 */
function fact(
  type: string,
  details?: Record<string, string | number | boolean | null>,
): SimEventFact {
  return {
    id: 'fact:0',
    sequence: 0,
    at: '2000-01-01',
    type,
    actorIds: ['protagonist'],
    causeEventIds: [],
    outcomeCode: 'fixture',
    templateId: 'fixture/template',
    evidenceIds: ['adr:0006'],
    eventVersion: 1,
    ...(details ? { details } : {}),
  };
}

describe('fact categories (M4-020b)', () => {
  it('files every M3-042 catalog prototype under daily, without a handwritten list', () => {
    const catalog = lifeEventCatalog();
    expect(catalog.length).toBeGreaterThan(0);
    for (const prototype of catalog) {
      const type = lifeEventType(prototype.id);
      expect(isDailyLifeFact(type)).toBe(true);
      expect(factCategory(fact(type))).toBe('daily');
    }
  });

  it('keeps protagonist birth and death in life and other life.* facts out of daily', () => {
    expect(factCategory(fact('life.birth'))).toBe('life');
    expect(factCategory(fact('life.death'))).toBe('life');
    expect(isDailyLifeFact('life.birth')).toBe(false);
    expect(isDailyLifeFact('life.death')).toBe(false);
    expect(factCategory(fact('life.birthday'))).toBe('other');
  });

  it('recognizes only the yearly-focus decision as a background decision', () => {
    const yearlyFocus = fact('decision.made', { decision: 'choice.yearly-focus' });
    expect(isBackgroundDecision(yearlyFocus)).toBe(true);
    // 时间线仍然显示它，并保留决定图标；人生方格用 isBackgroundDecision 把它排除。
    expect(factCategory(yearlyFocus)).toBe('decision');

    expect(
      isBackgroundDecision(fact('decision.made', { decision: 'choice.after-secondary' })),
    ).toBe(false);
    expect(isBackgroundDecision(fact('decision.made'))).toBe(false);
    expect(isBackgroundDecision(fact('life.daily-routine'))).toBe(false);
  });
});
