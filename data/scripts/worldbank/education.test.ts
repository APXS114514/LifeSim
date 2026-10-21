import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { StatSeriesSchema } from '../../../packages/content-schema/src/index.ts';
import { toEducationSeries } from './education.mjs';

const root = resolve(import.meta.dirname, '../../..');

type Row = {
  indicator: { id: string; value: string };
  countryiso3code: string;
  date: string;
  value: number | null;
};

/** 测试夹具，数值虚构：降序年份、一个 null、一个年份缺口、一个其他国家干扰记录。 */
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
      row('JPN', '2000', 100),
    ],
  ];
}

describe('toEducationSeries', () => {
  it('keeps gross percent, drops nulls and allows gaps between observed years', () => {
    const series = toEducationSeries(fixtureResponse('SE.SEC.ENRR'), 'CN', 'education-enrollment');
    expect(series).not.toBeNull();
    if (!series) throw new Error('expected a series');
    expect(StatSeriesSchema.safeParse(series).success).toBe(true);
    expect(series.unit).toBe('percent-gross');
    expect(series.points.map((point) => point.year)).toEqual([2000, 2002, 2004]);
    expect(series.points.map((point) => point.value)).toEqual([50, 55, 60]);
    expect(series.evidence.yearRange).toEqual([2000, 2004]);
    expect(series.evidence.sourceIds).toEqual(['worldbank-wdi:SE.SEC.ENRR']);
  });

  it('converts upper-secondary completion percentages to shares', () => {
    const series = toEducationSeries(
      fixtureResponse('SE.SEC.CUAT.UP.ZS'),
      'CN',
      'education-completion',
    );
    expect(series).not.toBeNull();
    if (!series) throw new Error('expected a series');
    expect(series.unit).toBe('share');
    expect(series.points.map((point) => point.value)).toEqual([0.5, 0.55, 0.6]);
    expect(series.evidence.sourceIds).toEqual(['worldbank-wdi:SE.SEC.CUAT.UP.ZS']);
  });

  it('returns null when a country has no observation', () => {
    const series = toEducationSeries(fixtureResponse('SE.SEC.ENRR'), 'KP', 'education-enrollment');
    expect(series).toBeNull();
  });

  it('rejects duplicate years, wrong indicators and malformed responses', () => {
    const [meta, rows] = fixtureResponse('SE.SEC.ENRR');
    expect(() =>
      toEducationSeries([meta, [...rows, rows[0] as Row]], 'CN', 'education-enrollment'),
    ).toThrow(/重复/);
    expect(() => toEducationSeries([meta, rows], 'CN', 'education-completion')).toThrow(/指标 ID/);
    expect(() => toEducationSeries({}, 'CN', 'education-enrollment')).toThrow(/长度为 2/);
    expect(() => toEducationSeries([meta], 'CN', 'education-enrollment')).toThrow(/长度为 2/);
  });

  it('validates every generated education file when present', () => {
    for (const packId of ['CN', 'JP', 'KP', 'KR', 'RU']) {
      const enrollmentPath = join(
        root,
        `packages/country-packs/data/${packId}/wdi-education-enrollment.json`,
      );
      if (existsSync(enrollmentPath)) {
        const series = StatSeriesSchema.parse(JSON.parse(readFileSync(enrollmentPath, 'utf8')));
        expect(series.unit).toBe('percent-gross');
        for (const point of series.points) {
          if (point.value !== null) {
            expect(point.value).toBeGreaterThanOrEqual(0);
            expect(point.value).toBeLessThanOrEqual(200);
          }
        }
      }
      const completionPath = join(
        root,
        `packages/country-packs/data/${packId}/wdi-education-completion.json`,
      );
      if (existsSync(completionPath)) {
        const series = StatSeriesSchema.parse(JSON.parse(readFileSync(completionPath, 'utf8')));
        expect(series.unit).toBe('share');
        for (const point of series.points) {
          if (point.value !== null) {
            expect(point.value).toBeGreaterThanOrEqual(0);
            expect(point.value).toBeLessThanOrEqual(1);
          }
        }
      }
    }
    expect(
      existsSync(join(root, 'packages/country-packs/data/KP/wdi-education-completion.json')),
    ).toBe(false);
  });
});
