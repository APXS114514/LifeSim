import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { StatSeriesSchema } from '../../../packages/content-schema/src/index.ts';
import { toLaborSeries } from './labor.mjs';

const root = resolve(import.meta.dirname, '../../..');

type Row = {
  indicator: { id: string; value: string };
  countryiso3code: string;
  date: string;
  value: number | null;
};

/** 测试夹具，数值虚构：降序年份、一个 null、一个缺口、一个其他国家干扰记录。 */
function fixtureResponse(code: string): [Record<string, unknown>, Row[]] {
  const row = (country: string, date: string, value: number | null): Row => ({
    indicator: { id: code, value: 'fixture' },
    countryiso3code: country,
    date,
    value,
  });
  return [
    { page: 1, pages: 1, per_page: 20000, lastupdated: '2026-10-08' },
    [
      row('CHN', '2004', 60),
      row('CHN', '2002', 55),
      row('CHN', '2001', null),
      row('CHN', '2000', 50),
      row('JPN', '2000', 64),
    ],
  ];
}

describe('toLaborSeries', () => {
  it('converts percentages to shares, drops nulls and allows gaps', () => {
    const series = toLaborSeries(fixtureResponse('SL.TLF.CACT.ZS'), 'CN', 'labor-participation');
    expect(series).not.toBeNull();
    if (!series) throw new Error('expected a series');
    expect(StatSeriesSchema.safeParse(series).success).toBe(true);
    expect(series.unit).toBe('share');
    expect(series.points.map((point) => point.year)).toEqual([2000, 2002, 2004]);
    expect(series.points.map((point) => point.value)).toEqual([0.5, 0.55, 0.6]);
    expect(series.evidence.sourceIds).toEqual(['worldbank-wdi:SL.TLF.CACT.ZS']);
  });

  it('converts agriculture employment the same way', () => {
    const series = toLaborSeries(fixtureResponse('SL.AGR.EMPL.ZS'), 'CN', 'employment-agriculture');
    expect(series).not.toBeNull();
    if (!series) throw new Error('expected a series');
    expect(series.id).toBe('wdi/CN/employment-agriculture-share');
    expect(series.points.map((point) => point.value)).toEqual([0.5, 0.55, 0.6]);
  });

  it('rejects out-of-range percentages, duplicates, wrong indicators and malformed responses', () => {
    const [meta, rows] = fixtureResponse('SL.TLF.CACT.ZS');
    expect(() =>
      toLaborSeries(
        [meta, [...rows, { ...(rows[0] as Row), date: '2005', value: 120 }]],
        'CN',
        'labor-participation',
      ),
    ).toThrow(/百分比超出/);
    expect(() =>
      toLaborSeries([meta, [...rows, rows[0] as Row]], 'CN', 'labor-participation'),
    ).toThrow(/重复/);
    expect(() => toLaborSeries([meta, rows], 'CN', 'employment-agriculture')).toThrow(/指标 ID/);
    expect(() => toLaborSeries({}, 'CN', 'labor-participation')).toThrow(/长度为 2/);
  });

  it('returns null when a country has no observation', () => {
    const [meta] = fixtureResponse('SL.TLF.CACT.ZS');
    expect(toLaborSeries([meta, []], 'CN', 'labor-participation')).toBeNull();
  });

  it('validates every generated labor file when present', () => {
    let files = 0;
    for (const packId of ['CN', 'JP', 'KP', 'KR', 'RU']) {
      for (const name of ['wdi-labor-participation.json', 'wdi-employment-agriculture.json']) {
        const path = join(root, `packages/country-packs/data/${packId}/${name}`);
        if (!existsSync(path)) continue;
        files += 1;
        const series = StatSeriesSchema.parse(JSON.parse(readFileSync(path, 'utf8')));
        expect(series.unit).toBe('share');
        for (const point of series.points) {
          if (point.value !== null) {
            expect(point.value).toBeGreaterThanOrEqual(0);
            expect(point.value).toBeLessThanOrEqual(1);
          }
        }
      }
    }
    expect(files).toBe(10);
  });
});
