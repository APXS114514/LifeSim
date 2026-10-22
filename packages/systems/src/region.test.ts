import { describe, expect, it } from 'vitest';
import { FIXTURE_REGION } from './__fixtures__/focus-region.ts';

describe('M3-012a：测试夹具的学制查询', () => {
  it('systemAt 与夹具的 D 级学制常数逐项等价', () => {
    for (const year of [1950, 1970, 2026, 2200]) {
      const system = FIXTURE_REGION.queries.education.systemAt(year);
      expect(system.primaryStartAge).toBe(6);
      expect(system.primaryYears).toBe(6);
      expect(system.secondaryYears).toBe(6);
      expect(system.tertiaryYears).toBe(4);
      expect(system.compulsoryYears).toBe(0);
      expect(system.entranceExam).toEqual({ kind: 'none' });
      expect(system.feeShare).toBe(0);
      expect(system.grade).toBe('D');
    }
  });
});
