import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { expDet, lnDet, scaleAnnualProbability } from './det-math.ts';

function relativeError(actual: number, expected: number): number {
  return expected === 0 ? Math.abs(actual) : Math.abs((actual - expected) / expected);
}

describe('deterministic exp / ln', () => {
  it('match Math.exp within 1e-14 relative error', () => {
    fc.assert(
      fc.property(fc.double({ min: -700, max: 700, noNaN: true }), (x) => {
        expect(relativeError(expDet(x), Math.exp(x))).toBeLessThan(1e-14);
      }),
    );
  });

  it('match Math.log within 1e-14 relative error (or 1e-15 absolute near 1)', () => {
    fc.assert(
      fc.property(fc.double({ min: 1e-300, max: 1e300, noNaN: true }), (x) => {
        const expected = Math.log(x);
        const error =
          Math.abs(expected) < 1
            ? Math.abs(lnDet(x) - expected)
            : relativeError(lnDet(x), expected);
        expect(error).toBeLessThan(1e-14);
      }),
    );
  });

  it('handle the edges', () => {
    expect(expDet(0)).toBe(1);
    expect(lnDet(1)).toBe(0);
    expect(lnDet(0)).toBe(-Infinity);
    expect(Number.isNaN(lnDet(-1))).toBe(true);
    expect(expDet(1000)).toBe(Infinity);
    expect(expDet(-1000)).toBe(0);
  });
});

describe('scaleAnnualProbability', () => {
  it('returns q unchanged for a multiplier of 1 and stays within [0, 1]', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 0.999, noNaN: true }),
        fc.double({ min: 0, max: 20, noNaN: true }),
        (q, m) => {
          const p = scaleAnnualProbability(q, m);
          expect(p).toBeGreaterThanOrEqual(0);
          expect(p).toBeLessThanOrEqual(1);
          if (m === 1) expect(Math.abs(p - q)).toBeLessThan(1e-12);
        },
      ),
    );
    expect(scaleAnnualProbability(0.1, 1)).toBeCloseTo(0.1, 12);
  });

  it('combines like independent hazards: doubling the multiplier gives 1-(1-q)^2', () => {
    expect(scaleAnnualProbability(0.1, 2)).toBeCloseTo(0.19, 12);
  });

  it('treats q = 1 as certain death unless the hazard is removed entirely', () => {
    expect(scaleAnnualProbability(1, 0.5)).toBe(1);
    expect(scaleAnnualProbability(1, 0)).toBe(0);
  });
});
