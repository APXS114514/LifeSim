import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  AdminUnitSchema,
  PlaceAssignmentSchema,
  PlaceSchema,
  PoliticalEntitySchema,
  findGaps,
  findOverlaps,
  isValidOn,
  resolveOn,
  type Validity,
} from './geography.ts';

/** 测试夹具，非真实历史：ID 与名称为虚构数据。 */
const sourceIds = ['adr:0005'];

/** 测试夹具，非真实历史。 */
const entity = {
  id: 'polity:test-a',
  names: { 'zh-Hans': '测试甲', en: 'Test A' },
  validFrom: null,
  validTo: '1991-12-26',
  sourceIds,
};

const admin = {
  id: 'admin:test-a',
  names: { 'zh-Hans': '测试行政区', en: 'Test Admin' },
  level: 'province',
  validFrom: null,
  validTo: null,
  sourceIds,
};

const place = {
  id: 'place:test-a',
  kind: 'city',
  settlement: 'urban',
  names: [{ validFrom: null, validTo: null, names: { 'zh-Hans': '测试城', en: 'Test City' } }],
  sourceIds,
};

const assignment = {
  placeId: 'place:test-a',
  adminUnitId: 'admin:test-a',
  politicalEntityId: 'polity:test-a',
  validFrom: null,
  validTo: null,
  sourceIds,
};

describe('validity helpers', () => {
  it.each([
    [{ validFrom: '1991-12-26', validTo: null }, '1991-12-25', false],
    [{ validFrom: '1991-12-26', validTo: null }, '1991-12-26', true],
    [{ validFrom: null, validTo: '1991-12-26' }, '1991-12-26', false],
    [{ validFrom: null, validTo: null }, '2000-01-01', true],
  ] as const)('isValidOn(%o, %s) is %s', (record, date, expected) => {
    expect(isValidOn(record, date)).toBe(expected);
  });

  it('finds overlapping records and allows touching endpoints', () => {
    expect(
      findOverlaps([
        { validFrom: null, validTo: '2000-01-01' },
        { validFrom: '1999-06-01', validTo: null },
      ]),
    ).toEqual([[0, 1]]);
    expect(
      findOverlaps([
        { validFrom: null, validTo: '2000-01-01' },
        { validFrom: '2000-01-01', validTo: null },
      ]),
    ).toEqual([]);
  });

  it('finds uncovered gaps', () => {
    expect(
      findGaps(
        [
          { validFrom: null, validTo: '1991-09-06' },
          { validFrom: '1991-09-07', validTo: null },
        ],
        '1950-01-01',
        null,
      ),
    ).toEqual([{ from: '1991-09-06', to: '1991-09-07' }]);
    expect(findGaps([{ validFrom: '1960-01-01', validTo: null }], '1950-01-01', null)).toEqual([
      { from: '1950-01-01', to: '1960-01-01' },
    ]);
    expect(findGaps([], '1950-01-01', null)).toEqual([{ from: '1950-01-01', to: null }]);
  });

  it('throws when more than one record is valid on the same date', () => {
    expect(() =>
      resolveOn(
        [
          { validFrom: null, validTo: '2000-01-01' },
          { validFrom: '1999-06-01', validTo: null },
        ],
        '1999-12-31',
      ),
    ).toThrow(Error);
  });
});

describe('geography schemas', () => {
  it('accepts the fixtures', () => {
    expect(PoliticalEntitySchema.safeParse(entity).success).toBe(true);
    expect(AdminUnitSchema.safeParse(admin).success).toBe(true);
    expect(PlaceSchema.safeParse(place).success).toBe(true);
    expect(PlaceAssignmentSchema.safeParse(assignment).success).toBe(true);
  });

  it('rejects reversed validity intervals', () => {
    expect(
      PoliticalEntitySchema.safeParse({ ...entity, validFrom: '2000-01-01', validTo: '1990-01-01' })
        .success,
    ).toBe(false);
    expect(
      AdminUnitSchema.safeParse({ ...admin, validFrom: '2000-01-01', validTo: '1990-01-01' })
        .success,
    ).toBe(false);
    expect(
      PlaceAssignmentSchema.safeParse({
        ...assignment,
        validFrom: '2000-01-01',
        validTo: '1990-01-01',
      }).success,
    ).toBe(false);
    expect(
      PlaceSchema.safeParse({
        ...place,
        names: [
          {
            validFrom: '2000-01-01',
            validTo: '1990-01-01',
            names: { 'zh-Hans': '测试城', en: 'Test City' },
          },
        ],
      }).success,
    ).toBe(false);
  });

  it('rejects an unknown admin level and an unknown place kind', () => {
    expect(AdminUnitSchema.safeParse({ ...admin, level: 'village' }).success).toBe(false);
    expect(PlaceSchema.safeParse({ ...place, kind: 'town' }).success).toBe(false);
  });

  it('rejects overlapping name periods', () => {
    expect(
      PlaceSchema.safeParse({
        ...place,
        names: [
          {
            validFrom: null,
            validTo: '2000-01-01',
            names: { 'zh-Hans': '旧名', en: 'Old name' },
          },
          {
            validFrom: '1999-01-01',
            validTo: null,
            names: { 'zh-Hans': '新名', en: 'New name' },
          },
        ],
      }).success,
    ).toBe(false);
  });

  it('rejects an other-rural place with urban settlement', () => {
    expect(
      PlaceSchema.safeParse({ ...place, kind: 'other-rural', settlement: 'urban' }).success,
    ).toBe(false);
    expect(
      PlaceSchema.safeParse({ ...place, kind: 'other-urban', settlement: 'rural' }).success,
    ).toBe(false);
  });
});

const DAY = 24 * 60 * 60 * 1000;
function addDays(date: string, days: number): string {
  return new Date(
    Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10))) +
      days * DAY,
  )
    .toISOString()
    .slice(0, 10);
}

describe('contiguous validity sequences', () => {
  it('have no overlaps or gaps and resolve to exactly one record', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 1, max: 365 }), { minLength: 1, maxLength: 20 }),
        fc.nat(5000),
        (durations, offset) => {
          const records: Validity[] = [];
          let cursor = '1950-01-01';
          for (const duration of durations) {
            records.push({ validFrom: cursor, validTo: addDays(cursor, duration) });
            cursor = addDays(cursor, duration);
          }
          // 最后一段延伸到无穷，覆盖 [1950-01-01, ∞) 且没有缝隙。
          const last = records[records.length - 1] as Validity;
          last.validTo = null;

          const first = records[0] as Validity;
          expect(first.validFrom).toBe('1950-01-01');
          expect(findOverlaps(records)).toEqual([]);
          expect(findGaps(records, '1950-01-01', null)).toEqual([]);

          const date = addDays('1950-01-01', offset);
          expect(resolveOn(records, date)).not.toBeNull();
          expect(resolveOn(records, '1949-12-31')).toBeNull();
        },
      ),
    );
  });
});
