import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { StatSeriesSchema } from '../../../packages/content-schema/src/index.ts';
import { toPricesHealthSeries } from './prices-health.mjs';

const root = resolve(import.meta.dirname, '../../..');

type Row = {
  indicator: { id: string; value: string };
  countryiso3code: string;
  date: string;
  value: number | null;
};

/** 测试夹具，数值虚构：降序年份、一个 null、一个缺口、一个其他国家干扰记录。 */
function fixtureResponse(
  code: string,
  values: [number | null, number | null, number | null, number | null, number | null] = [
    120,
    110,
    null,
    100,
    100,
  ],
): [Record<string, unknown>, Row[]] {
  const row = (country: string, date: string, value: number | null): Row => ({
    indicator: { id: code, value: 'fixture' },
    countryiso3code: country,
    date,
    value,
  });
  return [
    { page: 1, pages: 1, per_page: 20000, lastupdated: '2026-10-08' },
    [
      row('CHN', '2004', values[0]),
      row('CHN', '2002', values[1]),
      row('CHN', '2001', values[2]),
      row('CHN', '2000', values[3]),
      row('JPN', '2000', values[4]),
    ],
  ];
}

describe('toPricesHealthSeries', () => {
  it('keeps CPI as an index and allows gaps', () => {
    const series = toPricesHealthSeries(fixtureResponse('FP.CPI.TOTL'), 'CN', 'cpi');
    expect(series).not.toBeNull();
    if (!series) throw new Error('expected a series');
    expect(StatSeriesSchema.safeParse(series).success).toBe(true);
    expect(series.unit).toBe('index');
    expect(series.points.map((point) => point.year)).toEqual([2000, 2002, 2004]);
    expect(series.points.map((point) => point.value)).toEqual([100, 110, 120]);
  });

  it('converts out-of-pocket percentages to shares and keeps USD expenditure', () => {
    const oop = toPricesHealthSeries(
      fixtureResponse('SH.XPD.OOPC.CH.ZS', [40, 35, null, 30, 50]),
      'CN',
      'health-out-of-pocket',
    );
    expect(oop?.unit).toBe('share');
    expect(oop?.points.map((point) => point.value)).toEqual([0.3, 0.35, 0.4]);

    const expenditure = toPricesHealthSeries(
      fixtureResponse('SH.XPD.CHEX.PC.CD'),
      'CN',
      'health-expenditure',
    );
    expect(expenditure?.unit).toBe('usd-per-capita');
    expect(expenditure?.points.map((point) => point.value)).toEqual([100, 110, 120]);
  });

  it('rejects a non-positive CPI, out-of-range share and duplicate year', () => {
    const [meta, rows] = fixtureResponse('FP.CPI.TOTL');
    expect(() =>
      toPricesHealthSeries(
        [meta, [...rows, { ...(rows[0] as Row), date: '2005', value: 0 }]],
        'CN',
        'cpi',
      ),
    ).toThrow(/CPI 不是正数/);
    const [oopMeta, oopRows] = fixtureResponse('SH.XPD.OOPC.CH.ZS', [40, 35, null, 30, 50]);
    expect(() =>
      toPricesHealthSeries(
        [oopMeta, [...oopRows, { ...(oopRows[0] as Row), date: '2005', value: 120 }]],
        'CN',
        'health-out-of-pocket',
      ),
    ).toThrow(/百分比超出/);
    expect(() => toPricesHealthSeries([meta, [...rows, rows[0] as Row]], 'CN', 'cpi')).toThrow(
      /重复/,
    );
    expect(() => toPricesHealthSeries([meta, rows], 'CN', 'health-expenditure')).toThrow(/指标 ID/);
    expect(() => toPricesHealthSeries({}, 'CN', 'cpi')).toThrow(/长度为 2/);
  });

  it('returns null when a country has no observation', () => {
    const [meta] = fixtureResponse('FP.CPI.TOTL');
    expect(toPricesHealthSeries([meta, []], 'KP', 'cpi')).toBeNull();
  });

  it('validates every generated price/health file when present', () => {
    let files = 0;
    for (const packId of ['CN', 'JP', 'KR', 'RU']) {
      const expected = [
        ['wdi-cpi.json', 'index'],
        ['wdi-health-out-of-pocket.json', 'share'],
        ['wdi-health-expenditure.json', 'usd-per-capita'],
      ];
      for (const [name, unit] of expected) {
        const path = join(root, `packages/country-packs/data/${packId}/${name}`);
        expect(existsSync(path), path).toBe(true);
        files += 1;
        const series = StatSeriesSchema.parse(JSON.parse(readFileSync(path, 'utf8')));
        expect(series.unit).toBe(unit);
      }
    }
    expect(files).toBe(12);
    expect(existsSync(join(root, 'packages/country-packs/data/KP/wdi-cpi.json'))).toBe(false);
  });
});
