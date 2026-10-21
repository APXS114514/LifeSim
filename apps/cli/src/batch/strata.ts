// 分层批量模拟的层枚举与种子推导（M5-001）。纯函数，无 I/O、无时钟。
//
// 层 = 国家 × 出生年代 × 城乡；顺序固定，因为报告指纹依赖它：
// 国家按命令行给出的顺序 → 年代升序 → 城乡 urban 先于 rural → 局序号升序（局序号在 run.ts 里循环）。
import type { BirthRegionId } from '@lifesim/content-schema';

export type Settlement = 'urban' | 'rural';

export interface BatchConfig {
  countries: readonly BirthRegionId[];
  decades: readonly number[];
  settlements: readonly Settlement[];
  livesPerCell: number;
  seedPrefix: string;
  maxAttemptsPerLife: number;
}

export interface Stratum {
  country: BirthRegionId;
  decade: number;
  settlement: Settlement;
}

/** 城乡的固定顺序：urban 先于 rural（指纹依赖它）。 */
export const SETTLEMENTS: readonly Settlement[] = ['urban', 'rural'];

/** 出生年代：1950、1960…2020。2020s 层因此只覆盖 2020—2026。 */
export function decades(): readonly number[] {
  return [1950, 1960, 1970, 1980, 1990, 2000, 2010, 2020];
}

/** 一个年代内可用的出生年数；2020s 只有 2020—2026 七年。 */
function span(decade: number): number {
  return Math.min(10, 2027 - decade);
}

/** 层内第 `lifeIndex` 局用哪一年出生：年代内循环取年，保持出生日期分布连续。 */
export function yearFor(decade: number, lifeIndex: number): number {
  return decade + (lifeIndex % span(decade));
}

/**
 * 一局的种子。`attempt === 0` 时是 `<prefix>-<country>-<decade>-<settlement>-<i>`，
 * 拒绝抽样重试用 `-r<attempt>` 后缀。同一层内不同 i 的种子互不相同。
 */
export function seedFor(cell: Stratum, lifeIndex: number, attempt: number, prefix: string): string {
  const base = `${prefix}-${cell.country}-${cell.decade}-${cell.settlement}-${lifeIndex}`;
  return attempt === 0 ? base : `${base}-r${attempt}`;
}

/** 按固定顺序展开全部层：国家（给定顺序）→ 年代升序 → urban、rural。 */
export function enumerateCells(config: BatchConfig): Stratum[] {
  const decadeList = [...config.decades].sort((left, right) => left - right);
  const settlementList = SETTLEMENTS.filter((settlement) =>
    config.settlements.includes(settlement),
  );
  const cells: Stratum[] = [];
  for (const country of config.countries) {
    for (const decade of decadeList) {
      for (const settlement of settlementList) {
        cells.push({ country, decade, settlement });
      }
    }
  }
  return cells;
}
