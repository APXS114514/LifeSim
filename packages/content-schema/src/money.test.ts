import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { HistoricalAnchorSchema } from './anchor.ts';
import { addMinor, redenominateMinor, roundHalfAwayFromZero, scaleMinor } from './money.ts';

describe('integer money helpers', () => {
  it('adds minor units and refuses to leave the safe integer range', () => {
    expect(addMinor(150, -40, 5)).toBe(115);
    expect(() => addMinor(Number.MAX_SAFE_INTEGER, 1)).toThrow(RangeError);
    expect(() => addMinor(0.5)).toThrow(RangeError);
  });

  it('rounds halves away from zero', () => {
    expect([2.5, -2.5, 2.4, -2.6].map(roundHalfAwayFromZero)).toEqual([3, -3, 2, -3]);
    expect(scaleMinor(1001, 0.5)).toBe(501);
  });

  it('redenominates with exact integer division', () => {
    expect(redenominateMinor(12_345, 100)).toBe(123);
    expect(redenominateMinor(12_350, 100)).toBe(124);
    expect(redenominateMinor(-12_350, 100)).toBe(-124);
    expect(redenominateMinor(Number.MAX_SAFE_INTEGER, 1000)).toBe(9_007_199_254_741);
  });

  it('never moves a redenominated amount by more than half a new unit', () => {
    fc.assert(
      fc.property(fc.maxSafeInteger(), fc.integer({ min: 2, max: 10_000 }), (amount, divisor) => {
        const converted = BigInt(redenominateMinor(amount, divisor));
        const error = converted * BigInt(divisor) - BigInt(amount);
        const magnitude = error < 0n ? -error : error;
        expect(magnitude * 2n <= BigInt(divisor)).toBe(true);
      }),
    );
  });
});

describe('HistoricalAnchorSchema', () => {
  const evidence = {
    grade: 'D',
    sourceIds: ['adr:0003'],
    modelVersion: 'synthetic-1',
    geographyId: 'polity:syn-republic',
    yearRange: [1970, 1970],
  } as const;

  it('accepts a redenomination that moves to a newer currency version', () => {
    const anchor = {
      id: 'anchor:syn-redenomination-1970',
      at: '1970-01-01',
      regionIds: ['ZZ-SYN'],
      evidence,
      kind: 'redenomination',
      currencyCode: 'SYN',
      fromVersion: 1,
      toVersion: 2,
      divisor: 100,
    };
    expect(HistoricalAnchorSchema.safeParse(anchor).success).toBe(true);
    expect(HistoricalAnchorSchema.safeParse({ ...anchor, toVersion: 1 }).success).toBe(false);
  });
});
