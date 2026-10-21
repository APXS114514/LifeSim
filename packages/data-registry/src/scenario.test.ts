import { describe, expect, it } from 'vitest';
import { DataRegistry } from './registry.ts';

/**
 * 测试夹具，数值虚构：只用于验证预测标记与情景规则，不是真实生命表。
 */
const qxAA = {
  id: 'test/AA/qx',
  indicator: 'life-table-qx',
  geographyId: 'country:AA',
  unit: 'probability',
  ageBasis: 'single-year',
  sex: 'both',
  evidence: {
    grade: 'B',
    sourceIds: ['un-wpp:2024'],
    modelVersion: 'fixture',
    geographyId: 'country:AA',
    yearRange: [2098, 2100],
  },
  points: [
    { year: 2098, age: 0, value: 0.03, projected: false },
    { year: 2098, age: 1, value: 0.01, projected: false },
    { year: 2099, age: 0, value: 0.025, projected: true },
    { year: 2099, age: 1, value: 0.009, projected: true },
    { year: 2100, age: 0, value: 0.02, projected: true },
    { year: 2100, age: 1, value: 0.008, projected: true },
  ],
};

const registry = new DataRegistry([qxAA]);

describe('DataRegistry scenario rule', () => {
  it('returns an exact projected point regardless of allowScenario', () => {
    expect(
      registry.lookup({
        indicator: 'life-table-qx',
        geographyId: 'country:AA',
        year: 2099,
        age: 0,
      }),
    ).toMatchObject({ status: 'found', method: 'exact', projected: true });
    expect(
      registry.lookup(
        { indicator: 'life-table-qx', geographyId: 'country:AA', year: 2099, age: 0 },
        { allowScenario: true },
      ),
    ).toMatchObject({ status: 'found', method: 'exact', projected: true });
  });

  it('explains the series end and the disabled scenario after 2100', () => {
    const result = registry.lookup({
      indicator: 'life-table-qx',
      geographyId: 'country:AA',
      year: 2103,
      age: 0,
    });
    expect(result.status).toBe('missing');
    if (result.status !== 'missing') return;
    expect(result.reason).toContain('beyond the series end (2100)');
    expect(result.reason).toContain('scenario not allowed');
  });

  it('holds the last value only when the caller explicitly allows a scenario', () => {
    expect(
      registry.lookup(
        { indicator: 'life-table-qx', geographyId: 'country:AA', year: 2103, age: 0 },
        { allowScenario: true },
      ),
    ).toMatchObject({
      status: 'found',
      method: 'scenario-hold-last',
      value: 0.02,
      sourceYear: 2100,
      projected: true,
      evidence: { grade: 'D', methodId: 'scenario-hold-last' },
    });
  });

  it('lets neighbor-year fallback win before the scenario rule', () => {
    expect(
      registry.lookup(
        { indicator: 'life-table-qx', geographyId: 'country:AA', year: 2102, age: 0 },
        { allowScenario: true },
      ),
    ).toMatchObject({
      method: 'fallback-neighbor-year',
      value: 0.02,
      sourceYear: 2100,
      evidence: { grade: 'C' },
    });
  });

  it('holds the last value for the requested age, not for age zero', () => {
    expect(
      registry.lookup(
        { indicator: 'life-table-qx', geographyId: 'country:AA', year: 2130, age: 1 },
        { allowScenario: true },
      ),
    ).toMatchObject({
      method: 'scenario-hold-last',
      value: 0.008,
      sourceYear: 2100,
    });
  });

  it('does not extend backwards and still uses neighbors near the start', () => {
    expect(
      registry.lookup(
        { indicator: 'life-table-qx', geographyId: 'country:AA', year: 2097, age: 0 },
        { allowScenario: true },
      ),
    ).toMatchObject({ method: 'fallback-neighbor-year', sourceYear: 2098 });
    expect(
      registry.lookup(
        { indicator: 'life-table-qx', geographyId: 'country:AA', year: 2090, age: 0 },
        { allowScenario: true },
      ),
    ).toMatchObject({ status: 'missing' });
  });

  it('does not invent a series or a parent for scenario queries', () => {
    expect(
      registry.lookup(
        { indicator: 'life-table-qx', geographyId: 'country:ZZ', year: 2103, age: 0 },
        { allowScenario: true },
      ),
    ).toEqual({ status: 'missing', reason: 'no life-table-qx series for country:ZZ' });
  });
});
