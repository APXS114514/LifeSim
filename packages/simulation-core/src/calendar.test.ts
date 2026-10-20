import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { addDays, addYears, ageOn, fromDayNumber, toDayNumber, yearOf } from './calendar.ts';

// 0001-01-01 到 9999-12-31 对应的日序号。
const dayNumbers = fc.integer({ min: -719162, max: 2932896 });

describe('calendar', () => {
  it('maps known dates to day numbers', () => {
    expect(toDayNumber('1970-01-01')).toBe(0);
    expect(toDayNumber('2000-03-01')).toBe(11017);
    expect(fromDayNumber(-1)).toBe('1969-12-31');
    expect(fromDayNumber(19723)).toBe('2024-01-01');
  });

  it('round-trips every day number', () => {
    fc.assert(
      fc.property(dayNumbers, (n) => {
        expect(toDayNumber(fromDayNumber(n))).toBe(n);
      }),
    );
  });

  it('advances by exactly one day across month, year and leap boundaries', () => {
    expect(addDays('1999-12-31', 1)).toBe('2000-01-01');
    expect(addDays('2000-02-28', 1)).toBe('2000-02-29');
    expect(addDays('1900-02-28', 1)).toBe('1900-03-01');
    fc.assert(
      fc.property(fc.integer({ min: -719162, max: 2932895 }), (n) => {
        expect(addDays(fromDayNumber(n), 1)).toBe(fromDayNumber(n + 1));
      }),
    );
  });

  it('clamps 29 February to 28 February in common years', () => {
    expect(addYears('2000-02-29', 1)).toBe('2001-02-28');
    expect(addYears('2000-02-29', 4)).toBe('2004-02-29');
  });

  it('counts whole years of age consistently with addYears', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -7000, max: 30000 }),
        fc.integer({ min: 1, max: 110 }),
        (n, k) => {
          const birth = fromDayNumber(n);
          const birthday = addYears(birth, k);
          expect(ageOn(birth, birthday)).toBe(k);
          expect(ageOn(birth, addDays(birthday, -1))).toBe(k - 1);
        },
      ),
    );
    expect(ageOn('2000-02-29', '2001-02-28')).toBe(1);
    expect(ageOn('2000-01-01', '1999-12-31')).toBe(-1);
    expect(yearOf('0950-01-01')).toBe(950);
  });

  it('rejects impossible dates', () => {
    expect(() => toDayNumber('2023-02-29')).toThrow(RangeError);
  });
});
