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
  ['education-enrollment-secondary', 'percent-gross', 101.7],
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

  it('checks percent-gross, index and usd-per-capita ranges', () => {
    expect(
      StatSeriesSchema.safeParse(m3Fixture('education-enrollment-secondary', 'percent-gross', 150))
        .success,
    ).toBe(true);
    expect(
      StatSeriesSchema.safeParse(
        m3Fixture('education-enrollment-secondary', 'percent-gross', 200.1),
      ).success,
    ).toBe(false);
    expect(
      StatSeriesSchema.safeParse(m3Fixture('education-enrollment-secondary', 'percent-gross', -1))
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
    expect(StatSeriesSchema.safeParse(m3Fixture('cpi-index', 'share', 0.135)).success).toBe(false);
  });
});

/** M3-047 夹具，数值虚构，只为覆盖 schema 规则（不是真实生命表或出生性别比）。 */
function sexFixture(sex: 'female' | 'male' | 'other'): Record<string, unknown> {
  return {
    ...qx,
    id: `test/CN/qx-${sex}`,
    sex,
    evidence: { ...qx.evidence, methodId: 'fixture' },
  };
}

/** M3-047 夹具，数值虚构。 */
function srbFixture(value: number): StatSeries {
  return {
    id: 'test/CN/sex-ratio-at-birth',
    indicator: 'sex-ratio-at-birth',
    geographyId: 'country:CN',
    unit: 'males-per-100-females',
    ageBasis: 'none',
    sex: 'both',
    evidence: {
      grade: 'B',
      sourceIds: ['un-wpp:2024'],
      modelVersion: 'fixture',
      geographyId: 'country:CN',
      yearRange: [1950, 2100],
    },
    points: [{ year: 1950, age: null, value, projected: false }],
  };
}

describe('M3-047 性别与出生性别比', () => {
  it('accepts series labelled female and male', () => {
    expect(StatSeriesSchema.safeParse(sexFixture('female')).success).toBe(true);
    expect(StatSeriesSchema.safeParse(sexFixture('male')).success).toBe(true);
  });

  it('rejects any sex other than both, female or male', () => {
    expect(StatSeriesSchema.safeParse(sexFixture('other')).success).toBe(false);
    expect(StatSeriesSchema.safeParse({ ...qx, sex: 'total' }).success).toBe(false);
  });

  it('defines the sex-ratio-at-birth indicator spec', () => {
    expect(INDICATOR_SPEC['sex-ratio-at-birth']).toEqual({
      unit: 'males-per-100-females',
      ageBasis: 'none',
    });
    expect(INDICATORS).toContain('sex-ratio-at-birth');
  });

  it('accepts a plausible sex ratio at birth and both range ends', () => {
    for (const value of [90, 105.9, 130, 111.2]) {
      expect(StatSeriesSchema.safeParse(srbFixture(value)).success, String(value)).toBe(true);
    }
  });

  it('rejects a sex ratio at birth of zero, a negative value or above 130', () => {
    for (const value of [0, -1, -105.9, 131, 130.01]) {
      const result = StatSeriesSchema.safeParse(srbFixture(value));
      expect(result.success, String(value)).toBe(false);
      if (result.success) continue;
      expect(result.error.issues.some((issue) => issue.path.includes('value'))).toBe(true);
    }
  });

  it('rejects a sex ratio at birth with a null value and no reason, like every other indicator', () => {
    const withoutReason = {
      ...srbFixture(105),
      points: [{ year: 1950, age: null, value: null, projected: false }],
    } as unknown as StatSeries;
    expect(StatSeriesSchema.safeParse(withoutReason).success).toBe(false);
  });

  it('requires the males-per-100-females unit for sex ratio at birth', () => {
    expect(StatSeriesSchema.safeParse({ ...srbFixture(105), unit: 'ratio' }).success).toBe(false);
    expect(StatSeriesSchema.safeParse({ ...srbFixture(105), unit: 'index' }).success).toBe(false);
  });
});
