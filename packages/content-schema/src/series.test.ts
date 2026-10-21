import { describe, expect, it } from 'vitest';
import { INDICATOR_SPEC, INDICATORS, StatSeriesSchema, type StatSeries } from './series.ts';

/**
 * 测试夹具，非真实数据：数值只为覆盖 schema 规则而设。
 */
const births: StatSeries = {
  id: 'test/CN/births',
  indicator: 'births',
  geographyId: 'country:CN',
  unit: 'thousand-persons',
  ageBasis: 'none',
  sex: 'both',
  evidence: {
    grade: 'B',
    sourceIds: ['un-wpp:2024'],
    modelVersion: 'fixture',
    geographyId: 'country:CN',
    yearRange: [1950, 2100],
  },
  points: [
    { year: 1950, age: null, value: 20000, projected: false },
    { year: 1951, age: null, value: 20500.5, projected: false },
    { year: 2024, age: null, value: 9000, projected: true },
  ],
};

/** 测试夹具，非真实数据。 */
const qx: StatSeries = {
  id: 'test/CN/qx',
  indicator: 'life-table-qx',
  geographyId: 'country:CN',
  unit: 'probability',
  ageBasis: 'single-year',
  sex: 'both',
  evidence: {
    grade: 'B',
    sourceIds: ['un-wpp:2024'],
    modelVersion: 'fixture',
    geographyId: 'country:CN',
    yearRange: [2000, 2000],
  },
  points: [
    { year: 2000, age: 0, value: 0.01, projected: false },
    { year: 2000, age: 1, value: 0.001, projected: false },
    { year: 2000, age: 2, value: 0.0005, projected: false },
  ],
};

describe('StatSeriesSchema', () => {
  it('accepts the births and qx fixtures', () => {
    expect(StatSeriesSchema.safeParse(births).success).toBe(true);
    expect(StatSeriesSchema.safeParse(qx).success).toBe(true);
  });

  it('accepts an explicit null point only when a missing reason is present', () => {
    const missing = {
      year: 1952,
      age: null,
      value: null,
      missingReason: 'not reported',
      projected: false,
    };
    expect(
      StatSeriesSchema.safeParse({ ...births, points: [births.points[0], missing] }).success,
    ).toBe(true);
    const withoutReason = { ...missing } as Record<string, unknown>;
    delete withoutReason.missingReason;
    expect(
      StatSeriesSchema.safeParse({ ...births, points: [births.points[0], withoutReason] }).success,
    ).toBe(false);
  });

  it.each([
    ['wrong unit', { ...births, unit: 'probability' }, 'unit'],
    ['wrong age basis', { ...births, ageBasis: 'single-year' }, 'ageBasis'],
    [
      'mismatched evidence geography',
      { ...births, evidence: { ...births.evidence, geographyId: 'country:JP' } },
      'geographyId',
    ],
    [
      'age present on a none series',
      {
        ...births,
        points: [{ year: 1950, age: 0, value: 1, projected: false }],
      },
      'age',
    ],
    [
      'duplicate year and age',
      {
        ...births,
        points: [
          { year: 1950, age: null, value: 1, projected: false },
          { year: 1950, age: null, value: 2, projected: false },
        ],
      },
      'points',
    ],
    [
      'points out of order',
      {
        ...births,
        points: [
          { year: 1951, age: null, value: 1, projected: false },
          { year: 1950, age: null, value: 2, projected: false },
        ],
      },
      'points',
    ],
    [
      'point year outside the evidence range',
      {
        ...births,
        points: [{ year: 1949, age: null, value: 1, projected: false }],
      },
      'year',
    ],
    [
      'value outside the unit range',
      {
        ...qx,
        points: [{ year: 2000, age: 0, value: 1.2, projected: false }],
      },
      'value',
    ],
  ])('rejects a series violating rule %s', (_label, candidate, pathPart) => {
    const result = StatSeriesSchema.safeParse(candidate);
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues.some((issue) => issue.path.includes(pathPart))).toBe(true);
  });

  it('rejects unknown indicators and extra fields', () => {
    expect(StatSeriesSchema.safeParse({ ...births, indicator: 'gdp' }).success).toBe(false);
    expect(StatSeriesSchema.safeParse({ ...births, unexpected: true }).success).toBe(false);
  });

  it('defines a unit and age basis for every indicator', () => {
    for (const indicator of INDICATORS) {
      expect(INDICATOR_SPEC[indicator]).toBeDefined();
    }
  });
});

/** M3 新增指标的测试夹具，数值虚构，只为覆盖 schema 规则。 */
const m3Indicators = [
  ['education-enrollment-secondary', 'percent', 62],
  ['education-completion-upper-secondary', 'share', 0.42],
  ['labor-force-participation', 'share', 0.61],
  ['employment-agriculture-share', 'share', 0.35],
  ['cpi-index', 'index', 135.2],
  ['health-out-of-pocket-share', 'share', 0.28],
  ['health-expenditure-per-capita', 'usd-per-capita', 640.5],
] as const;

function m3Fixture(
  indicator: (typeof m3Indicators)[number][0],
  unit: (typeof m3Indicators)[number][1],
  value: number,
  year = 2000,
): StatSeries {
  return {
    id: `test/CN/${indicator}`,
    indicator,
    geographyId: 'country:CN',
    unit,
    ageBasis: 'none',
    sex: 'both',
    evidence: {
      grade: 'B',
      sourceIds: ['worldbank-wdi:fixture'],
      modelVersion: 'fixture',
      geographyId: 'country:CN',
      yearRange: [1950, 2100],
    },
    points: [{ year, age: null, value, projected: false }],
  };
}

describe('M3 indicator units', () => {
  it('accepts a fixture for every new indicator', () => {
    for (const [indicator, unit, value] of m3Indicators) {
      expect(StatSeriesSchema.safeParse(m3Fixture(indicator, unit, value)).success, indicator).toBe(
        true,
      );
    }
  });

  it('checks percent, index and usd-per-capita ranges', () => {
    expect(
      StatSeriesSchema.safeParse(m3Fixture('education-enrollment-secondary', 'percent', 100))
        .success,
    ).toBe(true);
    expect(
      StatSeriesSchema.safeParse(m3Fixture('education-enrollment-secondary', 'percent', 100.1))
        .success,
    ).toBe(false);
    expect(
      StatSeriesSchema.safeParse(m3Fixture('education-enrollment-secondary', 'percent', -1))
        .success,
    ).toBe(false);

    expect(StatSeriesSchema.safeParse(m3Fixture('cpi-index', 'index', 1)).success).toBe(true);
    expect(StatSeriesSchema.safeParse(m3Fixture('cpi-index', 'index', 0)).success).toBe(false);

    expect(
      StatSeriesSchema.safeParse(m3Fixture('health-expenditure-per-capita', 'usd-per-capita', 0))
        .success,
    ).toBe(true);
    expect(
      StatSeriesSchema.safeParse(m3Fixture('health-expenditure-per-capita', 'usd-per-capita', -1))
        .success,
    ).toBe(false);
  });

  it('rejects an indicator paired with the wrong unit', () => {
    expect(
      StatSeriesSchema.safeParse(m3Fixture('education-enrollment-secondary', 'share', 0.62))
        .success,
    ).toBe(false);
    expect(StatSeriesSchema.safeParse(m3Fixture('cpi-index', 'percent', 135)).success).toBe(false);
  });
});
