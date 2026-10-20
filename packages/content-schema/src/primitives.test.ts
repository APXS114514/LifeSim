import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { RelativePathSchema, compareISODate, isISODate } from './primitives';

describe('isISODate', () => {
  it.each(['1950-01-01', '2026-12-31', '2000-02-29', '1991-12-26'])('accepts %s', (value) => {
    expect(isISODate(value)).toBe(true);
  });

  it.each(['1900-02-29', '2023-02-29', '1991-13-01', '1991-04-31', '0000-01-01', '1991-1-1', ''])(
    'rejects %s',
    (value) => {
      expect(isISODate(value)).toBe(false);
    },
  );
});

describe('compareISODate', () => {
  // 1950-01-01 到 2200-12-31 之间的任意真实日期。
  const isoDate = fc
    .date({
      min: new Date(Date.UTC(1950, 0, 1)),
      max: new Date(Date.UTC(2200, 11, 31)),
      noInvalidDate: true,
    })
    .map((date) => date.toISOString().slice(0, 10));

  it('orders dates the same way as the calendar does', () => {
    fc.assert(
      fc.property(isoDate, isoDate, (a, b) => {
        const calendarOrder = Math.sign(Date.parse(a) - Date.parse(b));
        expect(Math.sign(compareISODate(a, b))).toBe(calendarOrder);
      }),
    );
  });

  it('is antisymmetric', () => {
    fc.assert(
      fc.property(isoDate, isoDate, (a, b) => {
        expect(Math.sign(compareISODate(a, b)) + Math.sign(compareISODate(b, a))).toBe(0);
      }),
    );
  });
});

describe('RelativePathSchema', () => {
  it.each(['population.json', 'data/births.csv'])('accepts %s', (path) => {
    expect(RelativePathSchema.safeParse(path).success).toBe(true);
  });

  it.each([
    '/etc/passwd',
    '../outside.json',
    'data/../../x',
    'C:\\pack',
    'https://x.test/a',
    'a//b',
  ])('rejects %s', (path) => {
    expect(RelativePathSchema.safeParse(path).success).toBe(false);
  });
});
