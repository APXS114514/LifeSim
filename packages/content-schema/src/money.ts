import { z } from 'zod';
import { EntityIdSchema } from './primitives.ts';

/**
 * 金额一律用整数最小货币单位（GDD §8.1），禁止浮点累加。
 * 超出安全整数范围的结果直接报错，而不是悄悄失去精度。
 */
export const MinorUnitsSchema = z
  .number()
  .int()
  .refine(Number.isSafeInteger, { message: 'Amount exceeds the safe integer range' });

/**
 * 币种与币制版本。重定值后版本号递增，例如旧币 v1 按 100:1 换成新币 v2；
 * 金额只有在同一币种、同一版本下才能相加。
 */
export const CurrencyVersionSchema = z.strictObject({
  code: z.string().regex(/^[A-Z]{3}$/, { message: 'Currency codes are three capital letters' }),
  version: z.number().int().positive(),
});
export type CurrencyVersion = z.infer<typeof CurrencyVersionSchema>;

export const HouseholdAccountSchema = z.strictObject({
  id: EntityIdSchema,
  ownerIds: z.array(EntityIdSchema).min(1),
  currency: CurrencyVersionSchema,
  /** 可以为负：负数表示负债。 */
  balanceMinor: MinorUnitsSchema,
});
export type HouseholdAccount = z.infer<typeof HouseholdAccountSchema>;

export function sameCurrency(a: CurrencyVersion, b: CurrencyVersion): boolean {
  return a.code === b.code && a.version === b.version;
}

function assertSafe(value: number, what: string): number {
  if (!Number.isSafeInteger(value)) throw new RangeError(`${what} is not a safe integer: ${value}`);
  return value;
}

/** 整数金额相加；任何输入或结果超出安全整数范围都会报错。 */
export function addMinor(...amounts: readonly number[]): number {
  let total = 0;
  for (const amount of amounts) total = assertSafe(total + assertSafe(amount, 'Amount'), 'Sum');
  return total;
}

/** 四舍五入（.5 远离零）到整数。 */
export function roundHalfAwayFromZero(value: number): number {
  return Math.sign(value) * Math.round(Math.abs(value));
}

/** 金额乘以比例（如养老金替代率），结果四舍五入到最小单位。 */
export function scaleMinor(amountMinor: number, factor: number): number {
  return assertSafe(
    roundHalfAwayFromZero(assertSafe(amountMinor, 'Amount') * factor),
    'Scaled amount',
  );
}

/**
 * 币制重定值：按整数除法换算，余数 .5 远离零舍入。
 * 用 BigInt 计算，避免大额时浮点除法的舍入误差。
 */
export function redenominateMinor(amountMinor: number, divisor: number): number {
  assertSafe(amountMinor, 'Amount');
  if (!Number.isInteger(divisor) || divisor < 1) throw new RangeError(`Invalid divisor ${divisor}`);
  const amount = BigInt(amountMinor);
  const by = BigInt(divisor);
  const quotient = amount / by;
  const remainder = amount % by;
  const magnitude = remainder < 0n ? -remainder : remainder;
  const carry = magnitude * 2n >= by ? (amount < 0n ? -1n : 1n) : 0n;
  return Number(quotient + carry);
}
