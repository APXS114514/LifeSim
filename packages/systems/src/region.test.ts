import { describe, expect, it } from 'vitest';
import { FIXTURE_REGION } from './__fixtures__/focus-region.ts';

describe('M3-012a：测试夹具的学制查询', () => {
  it('systemAt 与 rules 的学制常数逐项等价', () => {
    for (const year of [1950, 1970, 2026, 2200]) {
      const system = FIXTURE_REGION.queries.education.systemAt(year);
      expect(system.primaryStartAge).toBe(FIXTURE_REGION.rules.primaryStartAge);
      expect(system.primaryYears).toBe(FIXTURE_REGION.rules.primaryYears);
      expect(system.secondaryYears).toBe(FIXTURE_REGION.rules.secondaryYears);
      expect(system.tertiaryYears).toBe(FIXTURE_REGION.rules.tertiaryYears);
      expect(system.compulsoryYears).toBe(0);
      expect(system.entranceExam).toEqual({ kind: 'none' });
      expect(system.feeShare).toBe(0);
      expect(system.grade).toBe('D');
    }
  });
});
