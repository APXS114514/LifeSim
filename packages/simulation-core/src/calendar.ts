import { decodeISODate, type ISODate } from '@lifesim/content-schema';

/**
 * 公历日期运算，只用整数算术，不经过 `Date`（时区与实现差异会破坏确定性）。
 * 日序号以 1970-01-01 为 0；换算采用 Howard Hinnant 的 days-from-civil 算法。
 *
 * 日期在这里统一解码成 `YYYYMMDD` 的整数（见 `decodeISODate`）：校验与取年、月、日
 * 是同一次扫描，省掉字符串切片与临时对象。合法性与抛错行为与逐段解析完全相同。
 */

/** 解出 `YYYYMMDD` 的整数；非法日期抛 RangeError（信息与行为保持不变）。 */
function codeOf(date: ISODate): number {
  const code = decodeISODate(date);
  if (code < 0) throw new RangeError(`Not a calendar date: ${date}`);
  return code;
}

const yearOfCode = (code: number): number => (code / 10000) | 0;
const monthOfCode = (code: number): number => ((code / 100) | 0) % 100;
const dayOfCode = (code: number): number => code % 100;

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
  const code = codeOf(date);
  const year = yearOfCode(code);
  const month = monthOfCode(code);
  const day = dayOfCode(code);
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
  const code = codeOf(date);
  const year = yearOfCode(code);
  const month = monthOfCode(code);
  const day = dayOfCode(code);
  const target = year + years;
  const clampedDay = month === 2 && day === 29 && !isLeapYear(target) ? 28 : day;
  return format(target, month, clampedDay);
}

export function yearOf(date: ISODate): number {
  return yearOfCode(codeOf(date));
}

/**
 * 某日的周岁：满足 `addYears(birthDate, n) <= date` 的最大 n；出生前为 -1。
 * 与 `addYears` 共用 2 月 29 日规则，因此「生日」与「周岁增加」永远在同一天。
 *
 * 这里不构造 `addYears` 的结果字符串：同一目标年内比较（月、日）即可；
 * 2 月 29 日出生且目标年是平年时，日按 28 号比较，与 `addYears` 的落点逐日相同。
 */
export function ageOn(birthDate: ISODate, date: ISODate): number {
  if (date < birthDate) return -1;
  const birth = codeOf(birthDate);
  const current = codeOf(date);
  const birthYear = yearOfCode(birth);
  const birthMonth = monthOfCode(birth);
  const birthDay = dayOfCode(birth);
  const years = yearOfCode(current) - birthYear;
  const clampedDay =
    birthMonth === 2 && birthDay === 29 && !isLeapYear(birthYear + years) ? 28 : birthDay;
  const currentMonth = monthOfCode(current);
  const currentDay = dayOfCode(current);
  const reached =
    birthMonth < currentMonth || (birthMonth === currentMonth && clampedDay <= currentDay);
  return reached ? years : years - 1;
}
