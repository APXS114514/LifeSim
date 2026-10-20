import { describe, expect, it } from 'vitest';
import { AdvanceRequestSchema } from './index';

describe('AdvanceRequestSchema', () => {
  it('accepts a bounded request', () => {
    const request = { targetDate: '2026-12-31', stopAtMajorDecision: true, maxWorkUnits: 500 };
    expect(AdvanceRequestSchema.safeParse(request).success).toBe(true);
  });

  it('requires a positive integer work budget so a call can never run unbounded', () => {
    for (const maxWorkUnits of [0, -1, 1.5, Infinity]) {
      const request = { targetDate: '2026-12-31', stopAtMajorDecision: false, maxWorkUnits };
      expect(AdvanceRequestSchema.safeParse(request).success).toBe(false);
    }
  });

  it('accepts target dates beyond 2026, which the birth-year limit does not cap', () => {
    const request = { targetDate: '2091-06-30', stopAtMajorDecision: true, maxWorkUnits: 1 };
    expect(AdvanceRequestSchema.safeParse(request).success).toBe(true);
  });
});
