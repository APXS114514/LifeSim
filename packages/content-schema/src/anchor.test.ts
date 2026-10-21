import { describe, expect, it } from 'vitest';
import { HistoricalAnchorSchema } from './anchor.ts';

/** 测试夹具，非真实历史：实体 ID 与数值均为虚构。 */
const evidence = {
  grade: 'D',
  sourceIds: ['adr:0005'],
  modelVersion: 'fixture',
  geographyId: 'country:RU',
  yearRange: [1991, 1991],
} as const;

describe('HistoricalAnchorSchema polity-change', () => {
  const polityChange = {
    id: 'anchor:test-polity-change',
    at: '1991-12-26',
    regionIds: ['RU'],
    evidence,
    kind: 'polity-change',
    fromEntityId: 'polity:test-old',
    toEntityId: 'polity:test-new',
  } as const;

  it('accepts a polity change between two different entities', () => {
    expect(HistoricalAnchorSchema.safeParse(polityChange).success).toBe(true);
  });

  it('rejects a polity change whose entities are identical', () => {
    expect(
      HistoricalAnchorSchema.safeParse({ ...polityChange, toEntityId: polityChange.fromEntityId })
        .success,
    ).toBe(false);
  });

  it('rejects a missing target entity and extra fields', () => {
    const { toEntityId: _missing, ...withoutTarget } = polityChange;
    expect(HistoricalAnchorSchema.safeParse(withoutTarget).success).toBe(false);
    expect(HistoricalAnchorSchema.safeParse({ ...polityChange, extra: true }).success).toBe(false);
  });

  it('still accepts the M1 anchor kinds', () => {
    expect(
      HistoricalAnchorSchema.safeParse({
        id: 'anchor:test-redenomination',
        at: '1970-01-01',
        regionIds: ['RU'],
        evidence,
        kind: 'redenomination',
        currencyCode: 'RUB',
        fromVersion: 1,
        toVersion: 2,
        divisor: 100,
      }).success,
    ).toBe(true);
    expect(
      HistoricalAnchorSchema.safeParse({
        id: 'anchor:test-economy',
        at: '1970-01-01',
        regionIds: ['RU'],
        evidence,
        kind: 'economy-phase',
        phase: 'recession',
      }).success,
    ).toBe(true);
  });
});
