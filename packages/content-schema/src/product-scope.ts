/**
 * v0.1 冻结的产品边界（GDD §2）。UI 与引擎都从这里读取，不各自硬编码。
 */

/**
 * 决定 04：首发五个可出生地区。ID 采用 GDD §11.3 约定：
 * `CN` 指中国大陆，`KP` 为朝鲜，`KR` 为韩国，`RU` 覆盖苏联时期的俄罗斯地区。
 */
export const BIRTH_REGION_IDS = ['CN', 'JP', 'KP', 'KR', 'RU'] as const;
export type BirthRegionId = (typeof BIRTH_REGION_IDS)[number];

/** 决定 05：可选出生年份。只约束出生选择，不是死亡或模拟截止年份（GDD §4.1）。 */
export const BIRTH_YEAR_MIN = 1950;
export const BIRTH_YEAR_MAX = 2026;

export function isBirthRegionId(value: string): value is BirthRegionId {
  return (BIRTH_REGION_IDS as readonly string[]).includes(value);
}

export function isSelectableBirthYear(year: number): boolean {
  return Number.isInteger(year) && year >= BIRTH_YEAR_MIN && year <= BIRTH_YEAR_MAX;
}
