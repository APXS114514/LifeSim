import { describe, expect, it } from 'vitest';
import { syntheticRegion } from './region.ts';

describe('M3-012a：合成地区的 D 级学制', () => {
  it('systemAt 与 rules 的学制常数逐项等价（黄金指纹不变的前提）', () => {
    for (const year of [1950, 1960, 1990, 2026, 2100]) {
      expect(syntheticRegion.queries.education.systemAt(year)).toEqual({
        primaryStartAge: syntheticRegion.rules.primaryStartAge,
        primaryYears: syntheticRegion.rules.primaryYears,
        secondaryYears: syntheticRegion.rules.secondaryYears,
        tertiaryYears: syntheticRegion.rules.tertiaryYears,
        compulsoryYears: 0,
        entranceExam: { kind: 'none' },
        feeShare: 0,
        grade: 'D',
        sourceIds: ['adr:0003'],
      });
    }
  });

  it('同一年的查询是纯函数（不随调用次数或年份改变）', () => {
    const first = syntheticRegion.queries.education.systemAt(1970);
    const second = syntheticRegion.queries.education.systemAt(2000);
    expect(first).toEqual(second);
  });
});
