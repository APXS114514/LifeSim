import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { StatSeriesSchema } from '../../../packages/content-schema/src/index.ts';
import { toUrbanShareSeries } from './urban-share.mjs';

const root = resolve(import.meta.dirname, '../../..');

type Row = {
  indicator: { id: string; value: string };
  countryiso3code: string;
  date: string;
  value: number | null;
};

/** 测试夹具，数值虚构：降序年份、一个 null 值、一个其他国家的干扰记录。 */
function fixtureResponse(): [Record<string, unknown>, Row[]] {
  const rows: Row[] = [
    {
      indicator: { id: 'SP.URB.TOTL.IN.ZS', value: 'Urban population' },
      countryiso3code: 'CHN',
      date: '2005',
      value: 56,
    },
    {
      indicator: { id: 'SP.URB.TOTL.IN.ZS', value: 'Urban population' },
      countryiso3code: 'CHN',
      date: '2004',
      value: 55.5,
    },
    {
      indicator: { id: 'SP.URB.TOTL.IN.ZS', value: 'Urban population' },
      countryiso3code: 'CHN',
      date: '2003',
      value: null,
    },
    {
      indicator: { id: 'SP.URB.TOTL.IN.ZS', value: 'Urban population' },
      countryiso3code: 'CHN',
      date: '2002',
      value: 54.5,
    },
    {
      indicator: { id: 'SP.URB.TOTL.IN.ZS', value: 'Urban population' },
      countryiso3code: 'CHN',
      date: '2001',
      value: 54,
    },
    {
      indicator: { id: 'SP.URB.TOTL.IN.ZS', value: 'Urban population' },
      countryiso3code: 'CHN',
      date: '2000',
      value: 53.5,
    },
    {
      indicator: { id: 'SP.URB.TOTL.IN.ZS', value: 'Urban population' },
      countryiso3code: 'JPN',
      date: '2000',
      value: 99,
    },
  ];
  return [{ page: 1, pages: 1, per_page: 20000 }, rows];
}

describe('toUrbanShareSeries', () => {
  it('converts percentages to shares, sorts ascending and passes the schema', () => {
    const series = toUrbanShareSeries(fixtureResponse(), 'CN');
    expect(StatSeriesSchema.safeParse(series).success).toBe(true);
    expect(series.points.map((point) => point.year)).toEqual([2000, 2001, 2002, 2003, 2004, 2005]);
    expect(series.points.find((point) => point.year === 2004)?.value).toBeCloseTo(0.555, 12);
    expect(series.points[0]?.value).toBeCloseTo(0.535, 12);
  });

  it('keeps a null value as an explicit missing point rather than zero or a dropped year', () => {
    const series = toUrbanShareSeries(fixtureResponse(), 'CN');
    const point = series.points.find((candidate) => candidate.year === 2003);
    expect(point).toEqual({
      year: 2003,
      age: null,
      value: null,
      missingReason: 'not reported in World Bank WDI',
      projected: false,
    });
    expect(series.points).toHaveLength(6);
  });

  it('rejects a gap, a duplicate year and a malformed response', () => {
    const [meta, rows] = fixtureResponse();
    expect(() =>
      toUrbanShareSeries([meta, rows.filter((row) => row.date !== '2001')], 'CN'),
    ).toThrow(/不连续/);
    expect(() => toUrbanShareSeries([meta, [...rows, rows[0] as Row]], 'CN')).toThrow(/重复/);
    expect(() => toUrbanShareSeries({}, 'CN')).toThrow(/长度为 2/);
    expect(() => toUrbanShareSeries([meta], 'CN')).toThrow(/长度为 2/);
  });

  it('ignores other countries', () => {
    const series = toUrbanShareSeries(fixtureResponse(), 'CN');
    expect(series.points.every((point) => point.value === null || point.value < 1)).toBe(true);
  });

  it('validates every generated data file when present', () => {
    for (const packId of ['CN', 'JP', 'KP', 'KR', 'RU']) {
      const path = join(root, `packages/country-packs/data/${packId}/wdi-urban-share.json`);
      if (!existsSync(path)) continue;
      const series = StatSeriesSchema.parse(JSON.parse(readFileSync(path, 'utf8')));
      for (const point of series.points) {
        if (point.value !== null) {
          expect(point.value).toBeGreaterThanOrEqual(0);
          expect(point.value).toBeLessThanOrEqual(1);
        }
      }
    }
  });
});
