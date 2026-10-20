import { isISODate, type ISODate } from '@lifesim/content-schema';

/**
 * 公历日期运算，只用整数算术，不经过 `Date`（时区与实现差异会破坏确定性）。
 * 日序号以 1970-01-01 为 0；换算采用 Howard Hinnant 的 days-from-civil 算法。
 */

function parse(date: ISODate): [number, number, number] {
  const valid: boolean = isISODate(date);
  if (!valid) throw new RangeError(`Not a calendar date: ${date}`);
  return [Number(date.slice(0, 4)), Number(date.slice(5, 7)), Number(date.slice(8, 10))];
}

function format(year: number, month: number, day: number): ISODate {
  if (year < 1 || year > 9999) throw new RangeError(`Year out of range: ${year}`);
  const mm = String(month).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return `${String(year).padStart(4, '0')}-${mm}-${dd}`;
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function toDayNumber(date: ISODate): number {
  const [year, month, day] = parse(date);
  const y = month <= 2 ? year - 1 : year;
  const era = Math.floor(y / 400);
  const yearOfEra = y - era * 400;
  const shiftedMonth = (month + 9) % 12; // 三月为 0
  const dayOfYear = Math.floor((153 * shiftedMonth + 2) / 5) + day - 1;
  const dayOfEra =
    yearOfEra * 365 + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100) + dayOfYear;
  return era * 146097 + dayOfEra - 719468;
}

export function fromDayNumber(dayNumber: number): ISODate {
  if (!Number.isSafeInteger(dayNumber)) throw new RangeError(`Invalid day number: ${dayNumber}`);
  const z = dayNumber + 719468;
  const era = Math.floor(z / 146097);
  const dayOfEra = z - era * 146097;
  const yearOfEra = Math.floor(
    (dayOfEra -
      Math.floor(dayOfEra / 1460) +
      Math.floor(dayOfEra / 36524) -
      Math.floor(dayOfEra / 146096)) /
      365,
  );
  const dayOfYear =
    dayOfEra - (365 * yearOfEra + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100));
  const shiftedMonth = Math.floor((5 * dayOfYear + 2) / 153);
  const day = dayOfYear - Math.floor((153 * shiftedMonth + 2) / 5) + 1;
  const month = shiftedMonth < 10 ? shiftedMonth + 3 : shiftedMonth - 9;
  const year = yearOfEra + era * 400 + (month <= 2 ? 1 : 0);
  return format(year, month, day);
}

export function addDays(date: ISODate, days: number): ISODate {
  return fromDayNumber(toDayNumber(date) + days);
}

/** 加整年；2 月 29 日落到平年时取 2 月 28 日。 */
export function addYears(date: ISODate, years: number): ISODate {
  const [year, month, day] = parse(date);
  const target = year + years;
  const clampedDay = month === 2 && day === 29 && !isLeapYear(target) ? 28 : day;
  return format(target, month, clampedDay);
}

export function yearOf(date: ISODate): number {
  return parse(date)[0];
}

/**
 * 某日的周岁：满足 `addYears(birthDate, n) <= date` 的最大 n；出生前为 -1。
 * 与 `addYears` 共用 2 月 29 日规则，因此「生日」与「周岁增加」永远在同一天。
 */
export function ageOn(birthDate: ISODate, date: ISODate): number {
  if (date < birthDate) return -1;
  const years = yearOf(date) - yearOf(birthDate);
  return addYears(birthDate, years) <= date ? years : years - 1;
}
