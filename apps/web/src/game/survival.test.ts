import { createRealRegion } from '@lifesim/real-world';
import { describe, expect, it } from 'vitest';
import { buildSurvivalCurve, survivalChartSegments, type SurvivalLookup } from './survival.ts';

const SERIES_END_YEAR = 2100;

/**
 * 夹具：桩查询，按年龄给值（不按年份），所以能直接对照任务文件里手算的累乘结果；
 * 真实生命表那一组测试用下面的 realLookup，年份的滚动由它验证。
 */
function stubLookup(values: Readonly<Record<number, number>>, grade: 'B' | 'C' = 'B') {
  return (_year: number, age: number): SurvivalLookup | null => {
    const value = values[age];
    return value === undefined ? null : { value, grade, projected: false };
  };
}

/** 真实 WPP 生命表（中国大陆），只把 DataValue 适配成纯函数的输入。 */
function realLookup() {
  const region = createRealRegion('CN', '1950-01-01');
  return (year: number, age: number): SurvivalLookup | null => {
    const value = region.tables.ageValue('life-table-qx', year, age);
    return value === null
      ? null
      : { value: value.value, grade: value.grade, projected: value.projected };
  };
}

describe('survival curve', () => {
  it('multiplies the annual survival probability by hand for a stub table', () => {
    const curve = buildSurvivalCurve({
      birthYear: 1950,
      packId: 'CN',
      lookup: stubLookup({ 0: 0.1, 1: 0.2, 2: 0.3 }),
      seriesEndYear: SERIES_END_YEAR,
    });

    expect(curve.points[0]).toEqual({
      age: 0,
      survived: 1,
      periodYear: 1950,
      projected: false,
      method: 'period-table',
      grade: 'B',
    });
    expect(curve.points[1]?.survived).toBeCloseTo(0.9, 12);
    expect(curve.points[2]?.survived).toBeCloseTo(0.72, 12);
    expect(curve.points[3]?.survived).toBeCloseTo(0.504, 12);
    expect(curve.points.map((point) => point.age)).toEqual([0, 1, 2, 3]);
    expect(curve.points.map((point) => point.periodYear)).toEqual([1950, 1950, 1951, 1952]);
    expect(curve.scenarioFrom).toBeNull();
    expect(curve.truncatedAt).toBe(3);
    expect(curve.worstGrade).toBe('B');
  });

  it('uses the real WPP single-age table for China 1950 and keeps the raw values', () => {
    const curve = buildSurvivalCurve({
      birthYear: 1950,
      packId: 'CN',
      lookup: realLookup(),
      seriesEndYear: SERIES_END_YEAR,
    });

    // 数据文件原值：q(1950, 0) = 0.12711866，所以 S(1) = 0.87288134。
    expect(curve.points[1]?.survived).toBeCloseTo(0.87288134, 8);
    // 活到 2 岁这一步用的是「出生年 + 1」= 1951 那一列（沿出生队列逐年取当年的 q），
    // 数据文件原值 q(1951, 1) = 0.03066535，所以 S(2) = 0.87288134 × 0.96933465。
    // 任务文件 §2 的手算示例用的是 q(1950, 1) = 0.03384495（把年份固定在出生年），
    // 与同一节的算法（y = birthYear + a）、periodYear 规则和验收测试 8（2026 年出生 → 75 岁起情景）
    // 不一致；这里按算法与 8 实现并在报告里列出该处矛盾。
    expect(curve.points[2]?.survived).toBeCloseTo(0.87288134 * (1 - 0.03066535), 8);
    expect(curve.points[1]?.grade).toBe('B');
    expect(curve.points[1]?.periodYear).toBe(1950);
    expect(curve.points[2]?.periodYear).toBe(1951);
    expect(curve.points).toHaveLength(101);
    expect(curve.points[100]?.age).toBe(100);
    expect(curve.scenarioFrom).toBeNull();
    expect(curve.truncatedAt).toBeNull();
    expect(curve.worstGrade).toBe('B');
  });

  it('holds the last table year constant from 2101 on and marks it as a D-grade scenario', () => {
    const curve = buildSurvivalCurve({
      birthYear: 2026,
      packId: 'CN',
      lookup: realLookup(),
      seriesEndYear: SERIES_END_YEAR,
    });

    // 2026 + 75 = 2101，超过生命表末年，所以从 75 岁起改用 2100 年那一列。
    expect(curve.scenarioFrom).toBe(75);
    expect(curve.points[75]).toMatchObject({
      age: 75,
      periodYear: 2100,
      method: 'period-table',
      grade: 'B',
      projected: true,
    });
    expect(curve.points[76]).toMatchObject({
      age: 76,
      periodYear: 2100,
      method: 'scenario-hold-last',
      grade: 'D',
      projected: true,
    });
    expect(curve.worstGrade).toBe('D');
    expect(curve.truncatedAt).toBeNull();
  });

  it('stops early without inventing points when the table has a hole', () => {
    const values: Record<number, number> = {};
    for (let age = 0; age < 40; age += 1) values[age] = 0.01;
    const curve = buildSurvivalCurve({
      birthYear: 1950,
      packId: 'CN',
      lookup: stubLookup(values),
      seriesEndYear: SERIES_END_YEAR,
    });

    expect(curve.truncatedAt).toBe(40);
    expect(curve.points).toHaveLength(41);
    expect(curve.points[40]?.age).toBe(40);
    expect(curve.points.some((point) => point.age > 40)).toBe(false);
  });

  it('splits the observed and scenario segments and anchors the dashed line', () => {
    const curve = buildSurvivalCurve({
      birthYear: 2026,
      packId: 'CN',
      lookup: realLookup(),
      seriesEndYear: SERIES_END_YEAR,
    });
    const segments = survivalChartSegments(curve);

    expect(segments.observed[segments.observed.length - 1]?.age).toBe(75);
    expect(segments.scenario[0]).toBe(segments.observed[segments.observed.length - 1]);
    expect(segments.scenario[0]?.age).toBe(75);
    expect(segments.scenario[1]?.method).toBe('scenario-hold-last');
    expect(segments.scenario[segments.scenario.length - 1]?.age).toBe(100);
    expect(segments.missingPoint).toBeNull();
  });

  it('marks the last known point instead of silently ending the line', () => {
    const values: Record<number, number> = {};
    for (let age = 0; age < 40; age += 1) values[age] = 0.01;
    const curve = buildSurvivalCurve({
      birthYear: 1950,
      packId: 'CN',
      lookup: stubLookup(values),
      seriesEndYear: SERIES_END_YEAR,
    });
    const segments = survivalChartSegments(curve);

    expect(curve.truncatedAt).toBe(40);
    expect(segments.missingPoint?.age).toBe(40);
    expect(segments.scenario).toEqual([]);
  });

  it('keeps the worst grade across observed and scenario points', () => {
    const curve = buildSurvivalCurve({
      birthYear: 1950,
      packId: 'CN',
      lookup: stubLookup({ 0: 0.1 }, 'C'),
      seriesEndYear: SERIES_END_YEAR,
    });

    expect(curve.points[1]?.grade).toBe('C');
    expect(curve.worstGrade).toBe('C');
    expect(curve.birthYear).toBe(1950);
    expect(curve.packId).toBe('CN');
  });
});
