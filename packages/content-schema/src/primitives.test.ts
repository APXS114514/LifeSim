import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { RelativePathSchema, compareISODate, decodeISODate, isISODate } from './primitives.ts';

/**
 * `isISODate` 的规格参考实现：GDD §4.1 的 `YYYY-MM-DD` 正则加日期范围检查。
 * 生产实现为了速度改成字符码扫描，两者必须逐值一致——下面用性质测试锁住这一点。
 */
function referenceISODate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  const daysInMonth = month === 2 ? (leap ? 29 : 28) : [4, 6, 9, 11].includes(month) ? 30 : 31;
  return year >= 1 && month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth;
}

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

  it('agrees with the regular-expression specification on arbitrary strings', () => {
    // 覆盖随机字符串（含 Unicode、超长、控制字符）与「几乎合法」的数字/连字符组合。
    const nearlyDate = fc.tuple(
      fc.string({ minLength: 1, maxLength: 5 }),
      fc.string({ minLength: 0, maxLength: 4 }),
      fc.string({ minLength: 0, maxLength: 4 }),
    );
    fc.assert(
      fc.property(
        fc.oneof(
          fc.string({ maxLength: 14 }),
          nearlyDate.map((p) => p.join('-')),
        ),
        (value) => {
          expect(isISODate(value)).toBe(referenceISODate(value));
        },
      ),
    );
    fc.assert(
      fc.property(fc.string({ maxLength: 14 }), (value) => {
        const code = decodeISODate(value);
        if (referenceISODate(value)) {
          expect(code).toBe(Number(value.slice(0, 4) + value.slice(5, 7) + value.slice(8, 10)));
        } else {
          expect(code).toBe(-1);
        }
      }),
    );
  });

  it('decodes every real calendar date in the supported range', () => {
    const someDate = fc
      .date({
        min: new Date(Date.UTC(1, 0, 1)),
        max: new Date(Date.UTC(9999, 11, 31)),
        noInvalidDate: true,
      })
      .map((date) => date.toISOString().slice(0, 10));
    fc.assert(
      fc.property(someDate, (value) => {
        expect(isISODate(value)).toBe(true);
        expect(decodeISODate(value)).toBe(Number(value.replaceAll('-', '')));
      }),
    );
  });
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
