import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { StatSeriesSchema } from '../../../packages/content-schema/src/index.ts';
import { toQxSeries } from './qx.mjs';

const root = resolve(import.meta.dirname, '../../..');

type FixtureRecord = {
  LocID: string;
  Location: string;
  Time: string;
  Variant: string;
  SexID: string;
  Sex: string;
  AgeGrpStart: string;
  AgeGrpSpan: string;
  qx: string;
};

/** 测试夹具，数值虚构：1950—2100 年、0—100 岁的完整记录。 */
function fixtureRecords(): FixtureRecord[] {
  const records: FixtureRecord[] = [];
  for (let year = 1950; year <= 2100; year += 1) {
    for (let age = 0; age <= 100; age += 1) {
      records.push({
        LocID: '156',
        Location: 'China',
        Time: String(year),
        Variant: 'Medium',
        SexID: '3',
        Sex: 'Total',
        AgeGrpStart: String(age),
        AgeGrpSpan: age === 100 ? '-1' : '1',
        qx: age === 100 ? '1' : '0.001',
      });
    }
  }
  return records;
}

function replace(
  records: FixtureRecord[],
  year: number,
  age: number,
  patch: Partial<FixtureRecord>,
) {
  const index = records.findIndex(
    (record) => record.Time === String(year) && record.AgeGrpStart === String(age),
  );
  if (index >= 0) records[index] = { ...(records[index] as FixtureRecord), ...patch };
  return records;
}

describe('toQxSeries', () => {
  it('builds 151 × 101 sorted points that pass the schema', () => {
    const series = toQxSeries(fixtureRecords(), 'CN');
    expect(StatSeriesSchema.safeParse(series).success).toBe(true);
    expect(series.points).toHaveLength(15251);
    expect(series.points[0]).toMatchObject({ year: 1950, age: 0 });
    expect(series.points[series.points.length - 1]).toMatchObject({ year: 2100, age: 100 });
  });

  it('marks 2023 as an estimate and 2024 as projected', () => {
    const series = toQxSeries(fixtureRecords(), 'CN');
    const at = (year: number, age: number) =>
      series.points.find((point) => point.year === year && point.age === age);
    expect(at(2023, 0)?.projected).toBe(false);
    expect(at(2024, 0)?.projected).toBe(true);
  });

  it('rejects a missing age and names the year and age', () => {
    const records = fixtureRecords().filter(
      (record) => !(record.Time === '2000' && record.AgeGrpStart === '50'),
    );
    expect(() => toQxSeries(records, 'CN')).toThrow(/2000.*50/);
  });

  it('rejects a missing year and names it', () => {
    const records = fixtureRecords().filter((record) => record.Time !== '2000');
    expect(() => toQxSeries(records, 'CN')).toThrow(/2000/);
  });

  it('rejects a qx above one, a non-open-group qx at 100, and a five-year age group', () => {
    expect(() => toQxSeries(replace(fixtureRecords(), 2000, 10, { qx: '1.2' }), 'CN')).toThrow(
      /2000.*10/,
    );
    expect(() => toQxSeries(replace(fixtureRecords(), 2000, 100, { qx: '0.9' }), 'CN')).toThrow(
      /100/,
    );
    expect(() => toQxSeries(replace(fixtureRecords(), 2000, 5, { AgeGrpSpan: '5' }), 'CN')).toThrow(
      /2000.*5/,
    );
  });

  it('ignores rows for other regions and variants', () => {
    const records = fixtureRecords();
    records.push({
      LocID: '392',
      Location: 'Japan',
      Time: '2000',
      Variant: 'Medium',
      SexID: '3',
      Sex: 'Total',
      AgeGrpStart: '0',
      AgeGrpSpan: '1',
      qx: '0.9',
    });
    records.push({
      LocID: '156',
      Location: 'China',
      Time: '2000',
      Variant: 'Low',
      SexID: '3',
      Sex: 'Total',
      AgeGrpStart: '0',
      AgeGrpSpan: '1',
      qx: '0.9',
    });
    expect(toQxSeries(records, 'CN').points).toHaveLength(15251);
  });

  it('validates every generated data file when present', () => {
    for (const packId of ['CN', 'JP', 'KP', 'KR', 'RU']) {
      const path = join(root, `packages/country-packs/data/${packId}/wpp2024-qx.json`);
      if (!existsSync(path)) continue;
      const series = StatSeriesSchema.parse(JSON.parse(readFileSync(path, 'utf8')));
      expect(series.points).toHaveLength(15251);
      for (const year of [1950, 2000, 2100]) {
        expect(series.points.find((point) => point.year === year && point.age === 100)?.value).toBe(
          1,
        );
      }
    }
  });
});
