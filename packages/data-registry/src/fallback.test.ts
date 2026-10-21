import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { Breakpoint } from './breakpoint.ts';
import { DataRegistry } from './registry.ts';

/**
 * 测试夹具，数值虚构：只用于验证回退顺序与证据降级，不是真实人口数据。
 */
const birthsAA = {
  id: 'test/AA/births',
  indicator: 'births',
  geographyId: 'country:AA',
  unit: 'thousand-persons',
  ageBasis: 'none',
  sex: 'both',
  evidence: {
    grade: 'B',
    sourceIds: ['un-wpp:2024'],
    modelVersion: 'fixture',
    geographyId: 'country:AA',
    yearRange: [1946, 1958],
  },
  points: [
    { year: 1950, age: null, value: 10, projected: false },
    { year: 1951, age: null, value: 11, projected: false },
    { year: 1952, age: null, value: null, missingReason: 'fixture gap 1952', projected: false },
    { year: 1953, age: null, value: 13, projected: false },
    { year: 1954, age: null, value: 14, projected: false },
    { year: 1958, age: null, value: 18, projected: false },
  ],
};

/** 测试夹具，数值虚构。 */
const urbanAA = {
  id: 'test/AA/urban-share',
  indicator: 'urban-share',
  geographyId: 'country:AA',
  unit: 'share',
  ageBasis: 'none',
  sex: 'both',
  evidence: {
    grade: 'B',
    sourceIds: ['worldbank-wdi:SP.URB.TOTL.IN.ZS'],
    modelVersion: 'fixture',
    geographyId: 'country:AA',
    yearRange: [1960, 1962],
  },
  points: [
    { year: 1960, age: null, value: 0.3, projected: false },
    { year: 1961, age: null, value: 0.31, projected: false },
    { year: 1962, age: null, value: 0.32, projected: false },
  ],
};

const breakpoint: Breakpoint = {
  id: 'bp-1956',
  geographyIds: ['country:AA'],
  date: '1956-01-01',
  indicators: ['births'],
  reason: 'fixture breakpoint',
  sourceIds: ['adr:0005'],
};

const registry = new DataRegistry([birthsAA, urbanAA], {
  breakpoints: [breakpoint],
  parents: { 'place:aa-city': 'country:AA' },
});

describe('DataRegistry fallback chain', () => {
  it('prefers the exact value and keeps the original evidence', () => {
    expect(
      registry.lookup({ indicator: 'births', geographyId: 'country:AA', year: 1951 }),
    ).toMatchObject({
      status: 'found',
      method: 'exact',
      value: 11,
      evidence: { grade: 'B' },
    });
  });

  it('falls back to a neighboring year and prefers the earlier year on a tie', () => {
    expect(
      registry.lookup({ indicator: 'births', geographyId: 'country:AA', year: 1952 }),
    ).toMatchObject({
      status: 'found',
      method: 'fallback-neighbor-year',
      value: 11,
      sourceYear: 1951,
      evidence: { grade: 'C', methodId: 'fallback-neighbor-year' },
    });
  });

  it('does not cross a breakpoint when falling back', () => {
    expect(
      registry.lookup({ indicator: 'births', geographyId: 'country:AA', year: 1956 }),
    ).toMatchObject({
      method: 'fallback-neighbor-year',
      value: 18,
      sourceYear: 1958,
    });
    expect(
      registry.lookup({ indicator: 'births', geographyId: 'country:AA', year: 1955 }),
    ).toMatchObject({
      method: 'fallback-neighbor-year',
      value: 14,
      sourceYear: 1954,
    });
    expect(
      registry.lookup({ indicator: 'births', geographyId: 'country:AA', year: 1957 }),
    ).toMatchObject({
      method: 'fallback-neighbor-year',
      value: 18,
      sourceYear: 1958,
    });
  });

  it('returns missing when no neighbor exists', () => {
    expect(
      registry.lookup({ indicator: 'births', geographyId: 'country:AA', year: 1946 }),
    ).toMatchObject({
      status: 'missing',
    });
  });

  it('falls back to the parent geography for an exact parent value only', () => {
    expect(
      registry.lookup({ indicator: 'births', geographyId: 'place:aa-city', year: 2000 }),
    ).toMatchObject({ status: 'missing' });
    expect(
      registry.lookup({ indicator: 'births', geographyId: 'place:aa-city', year: 1950 }),
    ).toMatchObject({
      method: 'fallback-parent-geography',
      value: 10,
      sourceGeographyId: 'country:AA',
      evidence: { grade: 'C', methodId: 'fallback-parent-geography' },
    });
  });

  it('holds the first observed urban share only within ten years', () => {
    expect(
      registry.lookup({ indicator: 'urban-share', geographyId: 'country:AA', year: 1955 }),
    ).toMatchObject({
      method: 'hold-first-observed',
      value: 0.3,
      sourceYear: 1960,
      projected: false,
      evidence: { grade: 'D', methodId: 'hold-first-observed' },
    });
    expect(
      registry.lookup({ indicator: 'urban-share', geographyId: 'country:AA', year: 1949 }),
    ).toMatchObject({ status: 'missing' });
  });

  it('lets neighbor-year fallback win over hold-first-observed', () => {
    expect(
      registry.lookup({ indicator: 'urban-share', geographyId: 'country:AA', year: 1958 }),
    ).toMatchObject({
      method: 'fallback-neighbor-year',
      value: 0.3,
      sourceYear: 1960,
      evidence: { grade: 'C' },
    });
  });

  it('does not raise the grade of a D-grade series', () => {
    const dGrade = new DataRegistry([
      { ...birthsAA, evidence: { ...birthsAA.evidence, grade: 'D' } },
    ]);
    expect(
      dGrade.lookup({ indicator: 'births', geographyId: 'country:AA', year: 1952 }),
    ).toMatchObject({ evidence: { grade: 'D' } });
  });

  it('records the method without mutating the source series', () => {
    expect(birthsAA.evidence).not.toHaveProperty('methodId');
    const result = registry.lookup({ indicator: 'births', geographyId: 'country:AA', year: 1952 });
    expect(result.status).toBe('found');
    if (result.status !== 'found') return;
    expect(result.evidence.methodId).toBe('fallback-neighbor-year');
    expect(birthsAA.evidence).not.toHaveProperty('methodId');
  });

  it('never fabricates a zero while falling back', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1940, max: 1970 }), (year) => {
        const result = registry.lookup({ indicator: 'births', geographyId: 'country:AA', year });
        if (result.status === 'missing') return;
        expect(result.value).toBeGreaterThan(0);
        expect([10, 11, 13, 14, 18]).toContain(result.value);
        expect(Math.abs(result.sourceYear - year)).toBeLessThanOrEqual(2);
      }),
    );
  });
});
