import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { StatSeriesSchema } from '../../../packages/content-schema/src/index.ts';
import { toSrbSeries } from './srb.mjs';

const root = resolve(import.meta.dirname, '../../..');

type SrbRow = {
  LocID: string;
  Location: string;
  Time: string;
  Variant: string;
  SRB: string;
};

type FixtureOptions = {
  variant?: string;
  location?: string;
  srb?: (year: number) => string;
};

/**
 * 测试夹具，数值虚构：1950—2100 年的完整行，外加其他地区、其他方案与 2101 年的干扰行。
 */
function fixtureRows(options: FixtureOptions = {}): SrbRow[] {
  const variant = options.variant ?? 'Medium';
  const location = options.location ?? 'China';
  const srb = options.srb ?? ((year) => String(100 + (year % 20)));
  const rows: SrbRow[] = [];
  for (let year = 1950; year <= 2100; year += 1) {
    rows.push({
      LocID: '156',
      Location: location,
      Time: String(year),
      Variant: variant,
      SRB: srb(year),
    });
  }
  rows.push({ LocID: '392', Location: 'Japan', Time: '1950', Variant: 'Medium', SRB: '104' });
  rows.push({ LocID: '156', Location: 'China', Time: '1950', Variant: 'Low', SRB: '104' });
  // WPP 文件另有 2101 年的行（数值为空，用于 2101 年初人口）；项目只覆盖到 2100。
  rows.push({ LocID: '156', Location: 'China', Time: '2101', Variant: 'Medium', SRB: '' });
  return rows;
}

describe('toSrbSeries', () => {
  it('builds 151 yearly points that pass the schema', () => {
    const series = toSrbSeries(fixtureRows(), 'CN');
    expect(StatSeriesSchema.safeParse(series).success).toBe(true);
    expect(series.id).toBe('wpp2024/CN/srb');
    expect(series.indicator).toBe('sex-ratio-at-birth');
    expect(series.geographyId).toBe('country:CN');
    expect(series.unit).toBe('males-per-100-females');
    expect(series.ageBasis).toBe('none');
    expect(series.sex).toBe('both');
    expect(series.points).toHaveLength(151);
    expect(series.points[0]).toMatchObject({ year: 1950, age: null, value: 110, projected: false });
    expect(series.points[series.points.length - 1]).toMatchObject({ year: 2100, value: 100 });
  });

  it('marks 2023 as an estimate and 2024 as projected', () => {
    const series = toSrbSeries(fixtureRows(), 'CN');
    expect(series.points.find((point) => point.year === 2023)?.projected).toBe(false);
    expect(series.points.find((point) => point.year === 2024)?.projected).toBe(true);
  });

  it('ignores other regions, other variants and the 2101 row', () => {
    expect(toSrbSeries(fixtureRows(), 'CN').points).toHaveLength(151);
  });

  it('rejects a mismatched location name', () => {
    expect(() => toSrbSeries(fixtureRows({ location: 'China mainland' }), 'CN')).toThrow(/China/);
  });

  it('rejects a missing year', () => {
    const rows = fixtureRows().filter((row) => !(row.LocID === '156' && row.Time === '2000'));
    expect(() => toSrbSeries(rows, 'CN')).toThrow(/2000/);
  });

  it('rejects a non-numeric, an empty and an out-of-range sex ratio at birth', () => {
    expect(() =>
      toSrbSeries(fixtureRows({ srb: (year) => (year === 2000 ? 'not-a-number' : '105') }), 'CN'),
    ).toThrow(/2000/);
    expect(() =>
      toSrbSeries(
        fixtureRows().map((row) => (row.Time === '2010' ? { ...row, SRB: '' } : row)),
        'CN',
      ),
    ).toThrow(/2010/);
    // 合理范围 90—130：超出时报错停下，不修正数据（值本身虚构）。
    expect(() => toSrbSeries(fixtureRows({ srb: () => '131' }), 'CN')).toThrow(/131/);
    expect(() => toSrbSeries(fixtureRows({ srb: () => '89.9' }), 'CN')).toThrow(/89.9/);
  });
});

describe('wpp2024 出生性别比数据文件', () => {
  const packs = ['CN', 'JP', 'KP', 'KR', 'RU'] as const;
  /** 各国 SRB 抽查值，逐条取自 WPP2024_Demographic_Indicators_Medium.csv.gz（Medium）。 */
  const expected: Record<string, { '1950': number; '2020': number }> = {
    CN: { '1950': 106.1, '2020': 111.2 },
    JP: { '1950': 105.9, '2020': 105.1 },
    KP: { '1950': 106, '2020': 106 },
    KR: { '1950': 106.2, '2020': 105.7 },
    RU: { '1950': 105.4, '2020': 105.8 },
  };

  it.each(packs)('validates the generated %s file against the raw WPP values', (packId) => {
    const path = join(root, `packages/country-packs/data/${packId}/wpp2024-srb.json`);
    expect(existsSync(path), path).toBe(true);
    const series = StatSeriesSchema.parse(JSON.parse(readFileSync(path, 'utf8')));
    expect(series.points).toHaveLength(151);
    expect(series.evidence).toMatchObject({
      grade: 'B',
      sourceIds: ['un-wpp:2024'],
      modelVersion: 'wpp2024-medium',
      geographyId: `country:${packId}`,
      yearRange: [1950, 2100],
    });
    for (const [year, value] of Object.entries(expected[packId] ?? {})) {
      expect(series.points.find((point) => point.year === Number(year))?.value, year).toBe(value);
    }
    for (const point of series.points) {
      expect(point.value).not.toBeNull();
      if (point.value === null) continue;
      expect(point.value).toBeGreaterThanOrEqual(90);
      expect(point.value).toBeLessThanOrEqual(130);
      expect(point.projected).toBe(point.year >= 2024);
    }
  });
});
