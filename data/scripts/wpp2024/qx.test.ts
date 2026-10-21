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

/** 测试夹具，数值虚构：同一份记录里同时有 Total、Female、Male 三组行。 */
function threeSexRecords(): FixtureRecord[] {
  const records: FixtureRecord[] = [];
  const groups: { sexId: string; sex: string; qx: string }[] = [
    { sexId: '3', sex: 'Total', qx: '0.001' },
    { sexId: '2', sex: 'Female', qx: '0.002' },
    { sexId: '1', sex: 'Male', qx: '0.003' },
  ];
  for (let year = 1950; year <= 2100; year += 1) {
    for (let age = 0; age <= 100; age += 1) {
      for (const group of groups) {
        records.push({
          LocID: '156',
          Location: 'China',
          Time: String(year),
          Variant: 'Medium',
          SexID: group.sexId,
          Sex: group.sex,
          AgeGrpStart: String(age),
          AgeGrpSpan: age === 100 ? '-1' : '1',
          qx: age === 100 ? '1' : group.qx,
        });
      }
    }
  }
  return records;
}

describe('toQxSeries 分性别', () => {
  it('takes the rows of the requested sex when one file holds Total, Female and Male', () => {
    const records = threeSexRecords();
    const both = toQxSeries(records, 'CN');
    const female = toQxSeries(records, 'CN', 'female');
    const male = toQxSeries(records, 'CN', 'male');
    expect(both.points[0]?.value).toBe(0.001);
    expect(female.points[0]?.value).toBe(0.002);
    expect(male.points[0]?.value).toBe(0.003);
    expect(both).toMatchObject({ id: 'wpp2024/CN/qx', sex: 'both' });
    expect(female).toMatchObject({ id: 'wpp2024/CN/qx-female', sex: 'female' });
    expect(male).toMatchObject({ id: 'wpp2024/CN/qx-male', sex: 'male' });
    expect(female.evidence.methodId).toBe('wpp2024-life-table-single-age-female');
    expect(male.evidence.methodId).toBe('wpp2024-life-table-single-age-male');
    expect(StatSeriesSchema.safeParse(female).success).toBe(true);
    expect(StatSeriesSchema.safeParse(male).success).toBe(true);
    expect(female.points).toHaveLength(15251);
  });

  it('keeps the both output byte-identical when female and male rows are added', () => {
    const fromTotalOnly = JSON.stringify(toQxSeries(fixtureRecords(), 'CN'));
    const fromThreeSexes = JSON.stringify(toQxSeries(threeSexRecords(), 'CN'));
    expect(fromThreeSexes).toBe(fromTotalOnly);
  });

  it('rejects an unknown sex and never borrows another sex when the requested one has no rows', () => {
    expect(() => toQxSeries(threeSexRecords(), 'CN', 'other' as never)).toThrow(/other/);
    // 夹具里只有 Total 行：要 Female 就应该报缺年份，而不是拿合计行顶替。
    expect(() => toQxSeries(fixtureRecords(), 'CN', 'female')).toThrow(/CN 缺少 1950 年/);
  });
});

describe('wpp2024 分性别生命表数据文件', () => {
  const packs = ['CN', 'JP', 'KP', 'KR', 'RU'] as const;

  /**
   * 各国分性别 qx 抽查值，逐条取自 WPP2024_Life_Table_Complete_Medium_{Female,Male}_1950-2023.csv.gz
   * （Medium，单岁生命表），年龄取 1950 年 0 岁、1990 年 40 岁、2020 年 70 岁。
   */
  const spot: Record<string, { female: [number, number, number]; male: [number, number, number] }> =
    {
      CN: {
        female: [0.12056116, 0.00212283, 0.01476152],
        male: [0.13346748, 0.003316, 0.02874039],
      },
      JP: {
        female: [0.05262516, 0.00086962, 0.00687628],
        male: [0.05941638, 0.00158874, 0.01700419],
      },
      KP: {
        female: [0.22380657, 0.00110898, 0.02298446],
        male: [0.25859732, 0.0026404, 0.0380911],
      },
      KR: {
        female: [0.16836629, 0.00228758, 0.00609462],
        male: [0.18876581, 0.00543488, 0.0154],
      },
      RU: {
        female: [0.09910253, 0.00195096, 0.02521046],
        male: [0.11795095, 0.00713473, 0.05451873],
      },
    };
  const spotYears = [1950, 1990, 2020];
  const spotAges = [0, 40, 70];

  it.each(packs)(
    'validates the %s male and female life tables against the raw WPP values',
    (packId) => {
      for (const sex of ['female', 'male'] as const) {
        const path = join(root, `packages/country-packs/data/${packId}/wpp2024-qx-${sex}.json`);
        expect(existsSync(path), path).toBe(true);
        const series = StatSeriesSchema.parse(JSON.parse(readFileSync(path, 'utf8')));
        expect(series).toMatchObject({
          id: `wpp2024/${packId}/qx-${sex}`,
          indicator: 'life-table-qx',
          geographyId: `country:${packId}`,
          unit: 'probability',
          ageBasis: 'single-year',
          sex,
        });
        expect(series.evidence).toMatchObject({
          grade: 'B',
          sourceIds: ['un-wpp:2024'],
          modelVersion: 'wpp2024-medium',
          yearRange: [1950, 2100],
          methodId: `wpp2024-life-table-single-age-${sex}`,
        });
        expect(series.points).toHaveLength(15251);
        spotYears.forEach((year, index) => {
          const point = series.points.find(
            (candidate) => candidate.year === year && candidate.age === spotAges[index],
          );
          expect(point?.value, `${packId} ${sex} ${year}/${spotAges[index]}`).toBe(
            spot[packId]?.[sex][index],
          );
          expect(point?.projected).toBe(false);
        });
        for (const point of series.points) {
          expect(point.projected).toBe(point.year >= 2024);
          if (point.age === 100) expect(point.value).toBe(1);
        }
      }
    },
  );

  it.each(packs)(
    'keeps male qx at or above female qx for at least 80 percent of ages 15—60 (%s)',
    (packId) => {
      const read = (sex: 'female' | 'male') =>
        StatSeriesSchema.parse(
          JSON.parse(
            readFileSync(
              join(root, `packages/country-packs/data/${packId}/wpp2024-qx-${sex}.json`),
              'utf8',
            ),
          ),
        );
      const female = read('female');
      const male = read('male');
      const at = (series: typeof female, year: number, age: number) =>
        series.points.find((point) => point.year === year && point.age === age)?.value ?? null;
      for (let year = 1950; year <= 2100; year += 1) {
        let higher = 0;
        let total = 0;
        for (let age = 15; age <= 60; age += 1) {
          const femaleValue = at(female, year, age);
          const maleValue = at(male, year, age);
          if (femaleValue === null || maleValue === null) continue;
          total += 1;
          if (maleValue >= femaleValue) higher += 1;
        }
        // 只作告警阈值：不满足时报告，不修正数据。
        expect(total).toBe(46);
        expect(higher / total, `${packId} ${year}`).toBeGreaterThanOrEqual(0.8);
      }
    },
  );
});
