import { describe, expect, it } from 'vitest';
import { DataRegistry } from './registry.ts';

/**
 * 测试夹具，数值虚构：只用于验证查询语义，不是真实人口数据。
 */
const birthsCN = {
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

/** 测试夹具，数值虚构。 */
const qxCN = {
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

/** 测试夹具，数值虚构。 */
const birthsJP = {
  id: 'test/JP/births',
  indicator: 'births',
  geographyId: 'country:JP',
  unit: 'thousand-persons',
  ageBasis: 'none',
  sex: 'both',
  evidence: {
    grade: 'B',
    sourceIds: ['un-wpp:2024'],
    modelVersion: 'fixture',
    geographyId: 'country:JP',
    yearRange: [1950, 1951],
  },
  points: [
    { year: 1950, age: null, value: 1500, projected: false },
    {
      year: 1951,
      age: null,
      value: null,
      missingReason: 'fixture gap',
      projected: false,
    },
  ],
};

const registry = new DataRegistry([birthsCN, qxCN, birthsJP]);

describe('DataRegistry exact lookup', () => {
  it('returns an exact births value and keeps the projected flag', () => {
    expect(
      registry.lookup({ indicator: 'births', geographyId: 'country:CN', year: 1951 }),
    ).toMatchObject({
      status: 'found',
      value: 20500.5,
      method: 'exact',
      sourceYear: 1951,
      sourceGeographyId: 'country:CN',
      projected: false,
    });
    expect(
      registry.lookup({ indicator: 'births', geographyId: 'country:CN', year: 2024 }),
    ).toMatchObject({ status: 'found', projected: true });
  });

  it('looks up single-year qx by age and misses a missing age', () => {
    expect(
      registry.lookup({
        indicator: 'life-table-qx',
        geographyId: 'country:CN',
        year: 2000,
        age: 1,
      }),
    ).toMatchObject({ status: 'found', value: 0.001, method: 'exact' });
    expect(
      registry.lookup({
        indicator: 'life-table-qx',
        geographyId: 'country:CN',
        year: 2000,
        age: 3,
      }),
    ).toMatchObject({ status: 'missing' });
  });

  it('returns the point-level missing reason and never substitutes zero', () => {
    // M2-007 会先尝试相邻年份；这里只保留缺失点，验证没有任何可回退值时的行为。
    const isolated = new DataRegistry([
      {
        ...birthsJP,
        points: [
          { year: 1951, age: null, value: null, missingReason: 'fixture gap', projected: false },
        ],
      },
    ]);
    const result = isolated.lookup({ indicator: 'births', geographyId: 'country:JP', year: 1951 });
    expect(result).toEqual({ status: 'missing', reason: 'fixture gap' });
    expect('value' in result).toBe(false);
  });

  it('misses an unregistered geography', () => {
    expect(registry.lookup({ indicator: 'births', geographyId: 'country:ZZ', year: 1950 })).toEqual(
      {
        status: 'missing',
        reason: 'no births series for country:ZZ',
      },
    );
  });

  it('rejects a query with the wrong age basis', () => {
    expect(() =>
      registry.lookup({ indicator: 'births', geographyId: 'country:CN', year: 1950, age: 0 }),
    ).toThrow(TypeError);
    expect(() =>
      registry.lookup({ indicator: 'life-table-qx', geographyId: 'country:CN', year: 2000 }),
    ).toThrow(TypeError);
  });

  it('rejects duplicate series and invalid series with the index in the message', () => {
    expect(() => new DataRegistry([birthsCN, birthsCN])).toThrow(/test\/CN\/births/);
    expect(() => new DataRegistry([{ ...birthsCN, unit: 'share' }])).toThrow(/index 0/);
  });

  it('returns a copy of the evidence so callers cannot mutate the registry', () => {
    const first = registry.lookup({ indicator: 'births', geographyId: 'country:CN', year: 1950 });
    expect(first.status).toBe('found');
    if (first.status !== 'found') return;
    first.evidence.sourceIds.push('example:mutated');
    const second = registry.lookup({ indicator: 'births', geographyId: 'country:CN', year: 1950 });
    expect(second.status).toBe('found');
    if (second.status !== 'found') return;
    expect(second.evidence.sourceIds).toEqual(['un-wpp:2024']);
  });

  it('exposes the parsed series and breakpoints', () => {
    const withBreakpoint = new DataRegistry([birthsCN], {
      breakpoints: [
        {
          id: 'bp-fixture',
          geographyIds: ['country:CN'],
          date: '1956-01-01',
          indicators: ['births'],
          reason: 'fixture breakpoint',
          sourceIds: ['adr:0005'],
        },
      ],
    });
    expect(withBreakpoint.series).toHaveLength(1);
    expect(withBreakpoint.breakpoints.map((breakpoint) => breakpoint.id)).toEqual(['bp-fixture']);
  });
});

/**
 * M3-047 的测试夹具，数值虚构：只用于验证分性别查询与「不跨性别回退」，不是真实人口数据。
 */
const qxFemale = {
  ...qxCN,
  id: 'test/CN/qx-female',
  sex: 'female',
  evidence: { ...qxCN.evidence, yearRange: [2000, 2020] },
  points: [
    { year: 2000, age: 0, value: 0.02, projected: false },
    { year: 2000, age: 1, value: 0.002, projected: false },
    { year: 2000, age: 2, value: 0.001, projected: false },
    { year: 2010, age: 0, value: 0.03, projected: false },
  ],
};

/** 测试夹具，数值虚构：只有 2010 年，用来验证不向其他性别回退。 */
const qxMale = {
  ...qxCN,
  id: 'test/CN/qx-male',
  sex: 'male',
  evidence: { ...qxCN.evidence, yearRange: [2000, 2020] },
  points: [
    { year: 2010, age: 0, value: 0.04, projected: false },
    { year: 2010, age: 1, value: 0.004, projected: false },
    { year: 2010, age: 2, value: 0.002, projected: false },
  ],
};

describe('M3-047 分性别查询', () => {
  const sexRegistry = new DataRegistry([qxCN, qxFemale, qxMale], {
    parents: { 'place:cn-city': 'country:CN' },
  });

  it('keeps the both, female and male series apart and returns the matching one', () => {
    const female = sexRegistry.lookup({
      indicator: 'life-table-qx',
      geographyId: 'country:CN',
      year: 2000,
      age: 0,
      sex: 'female',
    });
    expect(female).toMatchObject({
      status: 'found',
      method: 'exact',
      value: 0.02,
      seriesId: 'test/CN/qx-female',
    });
    const male = sexRegistry.lookup({
      indicator: 'life-table-qx',
      geographyId: 'country:CN',
      year: 2010,
      age: 0,
      sex: 'male',
    });
    expect(male).toMatchObject({ status: 'found', value: 0.04, seriesId: 'test/CN/qx-male' });
    const both = sexRegistry.lookup({
      indicator: 'life-table-qx',
      geographyId: 'country:CN',
      year: 2000,
      age: 0,
    });
    expect(both).toMatchObject({ status: 'found', value: 0.01, seriesId: 'test/CN/qx' });
    expect(sexRegistry.series).toHaveLength(3);
  });

  it('never falls back to another sex or to the both series and names the sex in the reason', () => {
    const femaleNeighbor = sexRegistry.lookup({
      indicator: 'life-table-qx',
      geographyId: 'country:CN',
      year: 2001,
      age: 0,
      sex: 'female',
    });
    expect(femaleNeighbor).toMatchObject({
      status: 'found',
      method: 'fallback-neighbor-year',
      value: 0.02,
      sourceYear: 2000,
      seriesId: 'test/CN/qx-female',
    });
    const male = sexRegistry.lookup({
      indicator: 'life-table-qx',
      geographyId: 'country:CN',
      year: 2000,
      age: 0,
      sex: 'male',
    });
    expect(male.status).toBe('missing');
    if (male.status !== 'missing') return;
    expect(male.reason).toContain('male');
    expect(male.reason).not.toContain('0.01');
  });

  it('reports a missing female series instead of substituting the both series', () => {
    const registryWithoutFemale = new DataRegistry([qxCN, qxMale]);
    const result = registryWithoutFemale.lookup({
      indicator: 'life-table-qx',
      geographyId: 'country:CN',
      year: 2000,
      age: 0,
      sex: 'female',
    });
    expect(result.status).toBe('missing');
    if (result.status !== 'missing') return;
    expect(result.reason).toContain('female');
  });

  it('keeps the parent-geography fallback inside the same sex', () => {
    const result = sexRegistry.lookup({
      indicator: 'life-table-qx',
      geographyId: 'place:cn-city',
      year: 2000,
      age: 0,
      sex: 'female',
    });
    expect(result).toMatchObject({
      status: 'found',
      method: 'fallback-parent-geography',
      value: 0.02,
      sourceGeographyId: 'country:CN',
      seriesId: 'test/CN/qx-female',
    });
  });

  it('rejects a duplicate series for the same sex but accepts the same indicator for two sexes', () => {
    expect(() => new DataRegistry([qxFemale, qxFemale])).toThrow(/qx-female/);
    expect(() => new DataRegistry([qxCN, qxFemale, qxMale])).not.toThrow();
  });

  it('defaults the sex to both when the query omits it', () => {
    expect(
      sexRegistry.lookup({
        indicator: 'life-table-qx',
        geographyId: 'country:CN',
        year: 2000,
        age: 1,
      }),
    ).toMatchObject({ status: 'found', value: 0.001, seriesId: 'test/CN/qx' });
    expect(
      sexRegistry.lookup({
        indicator: 'life-table-qx',
        geographyId: 'country:CN',
        year: 2000,
        age: 1,
        sex: 'both',
      }),
    ).toMatchObject({ status: 'found', value: 0.001, seriesId: 'test/CN/qx' });
  });
});
