import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { StatSeriesSchema } from '../../../packages/content-schema/src/index.ts';
import { toBirthSeries } from './births.mjs';

const root = resolve(import.meta.dirname, '../../..');

type FixtureOptions = {
  variant?: string;
  births?: (year: number) => string;
  location?: string;
};

type BirthRow = {
  LocID: string;
  Location: string;
  Time: string;
  Variant: string;
  Births: string;
};

/**
 * 测试夹具，数值虚构：生成 1950—2100 年的完整行，含带逗号的地名与其他地区干扰行。
 */
function fixtureRows(options: FixtureOptions = {}): BirthRow[] {
  const variant = options.variant ?? 'Medium';
  const births = options.births ?? ((year) => String(1000 + year));
  const location = options.location ?? 'China';
  const rows: BirthRow[] = [];
  for (let year = 1950; year <= 2100; year += 1) {
    rows.push({
      LocID: '156',
      Location: location,
      Time: String(year),
      Variant: variant,
      Births: births(year),
    });
  }
  rows.push({
    LocID: '344',
    Location: 'China, Hong Kong SAR',
    Time: '1950',
    Variant: 'Medium',
    Births: '9999',
  });
  rows.push({
    LocID: '392',
    Location: 'Japan',
    Time: '1950',
    Variant: 'Medium',
    Births: '8888',
  });
  return rows;
}

describe('toBirthSeries', () => {
  it('selects only the requested region and Medium variant, and passes the schema', () => {
    const rows = fixtureRows();
    rows.push({ LocID: '156', Location: 'China', Time: '1950', Variant: 'Low', Births: '1' });
    const series = toBirthSeries(rows, 'CN');
    expect(StatSeriesSchema.safeParse(series).success).toBe(true);
    expect(series.id).toBe('wpp2024/CN/births');
    expect(series.geographyId).toBe('country:CN');
    expect(series.points).toHaveLength(151);
    expect(series.points[0]).toMatchObject({ year: 1950, age: null, value: 2950 });
  });

  it('marks 2023 as an estimate and 2024 as projected', () => {
    const series = toBirthSeries(fixtureRows(), 'CN');
    expect(series.points.find((point) => point.year === 2023)?.projected).toBe(false);
    expect(series.points.find((point) => point.year === 2024)?.projected).toBe(true);
  });

  it('rejects a mismatched location name', () => {
    expect(() => toBirthSeries(fixtureRows({ location: 'China mainland' }), 'CN')).toThrow(/China/);
  });

  it('rejects a missing year', () => {
    const rows = fixtureRows().filter((row) => !(row.LocID === '156' && row.Time === '2000'));
    expect(() => toBirthSeries(rows, 'CN')).toThrow(/2000/);
  });

  it('rejects a non-numeric birth count and names the year', () => {
    const rows = fixtureRows({
      births: (year) => (year === 2000 ? 'not-a-number' : String(year)),
    });
    expect(() => toBirthSeries(rows, 'CN')).toThrow(/2000/);
  });

  it('sorts points by year even when the input rows are shuffled', () => {
    const rows = fixtureRows();
    const header = rows.shift();
    const shuffled = [...rows].reverse();
    if (header) shuffled.unshift(header);
    const series = toBirthSeries(shuffled, 'CN');
    expect(series.points.map((point) => point.year)).toEqual(
      Array.from({ length: 151 }, (_, index) => 1950 + index),
    );
  });

  it('validates every generated data file when present', () => {
    for (const packId of ['CN', 'JP', 'KP', 'KR', 'RU']) {
      const path = join(root, `packages/country-packs/data/${packId}/wpp2024-births.json`);
      if (!existsSync(path)) continue;
      const series = StatSeriesSchema.parse(JSON.parse(readFileSync(path, 'utf8')));
      expect(series.points).toHaveLength(151);
      for (const point of series.points) {
        expect(point.value).toBeGreaterThan(0);
      }
    }
  });
});
