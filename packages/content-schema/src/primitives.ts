import { z } from 'zod';

/** 公历日历日期 `YYYY-MM-DD`（GDD §4.1）。固定宽度，因此字符串字典序即时间序。 */
export type ISODate = string;

/** 稳定实体 ID（GDD §11.4：历史 ID 永不复用）。 */
export type EntityId = string;

const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

/** 是否为真实存在的公历日期（拒绝 `2023-02-29`、`1991-13-01` 等）。 */
export function isISODate(value: string): value is ISODate {
  const match = ISO_DATE_PATTERN.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  return year >= 1 && month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(year, month);
}

/** 比较两个已校验的 ISO 日期：`a` 早于 `b` 返回负数，相等返回 0。 */
export function compareISODate(a: ISODate, b: ISODate): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

export const ISODateSchema = z
  .string()
  .refine(isISODate, { message: 'Expected a real calendar date in YYYY-MM-DD form' });

export const EntityIdSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/, {
    message: 'Entity IDs use letters, digits and . _ : - only',
  });

/** `major.minor.patch`，可带预发布标签。 */
export const SemverSchema = z
  .string()
  .regex(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/, { message: 'Expected a semantic version' });

/**
 * 包内相对路径：不允许绝对路径、反斜杠、`..` 段或 URL scheme，
 * 防止数据包清单把加载器引到包目录之外（GDD §11.4 的路径污染约束）。
 */
export const RelativePathSchema = z
  .string()
  .min(1)
  .refine(
    (path) =>
      !path.startsWith('/') &&
      !path.includes('\\') &&
      !path.includes(':') &&
      path.split('/').every((segment) => segment !== '' && segment !== '.' && segment !== '..'),
    { message: 'Expected a relative path that stays inside the pack' },
  );

/** 首发界面语言（GDD §2 决定 21）。 */
export const SUPPORTED_LOCALES = ['zh-Hans', 'en'] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];
export const LocaleSchema = z.enum(SUPPORTED_LOCALES);
