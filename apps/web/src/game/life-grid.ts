import type { SimEventFact } from '@lifesim/content-schema';
import { factCategory, type FactCategory } from '../components/fact-category.ts';

/**
 * 人生方格（M4-020）：一年一格，按当年的主要经历着色。
 *
 * 只是展示：类别复用时间线的 `factCategory`，优先级固定，不重新模拟、不影响玩家这一局。
 * 已发生的时间段一律含两端（出生年与去世年），仍在世时最后一年是权威时钟的年份；不造未来格。
 */

export type GridCategory =
  | 'life'
  | 'decision'
  | 'education'
  | 'career'
  | 'health'
  | 'family'
  | 'history'
  | 'finance'
  | 'other'
  | 'none';

export interface GridCell {
  year: number;
  category: GridCategory;
}

/** 一年里出现多类事实时，按这个顺序取最高的一个。 */
const CATEGORY_PRIORITY: readonly FactCategory[] = [
  'life',
  'decision',
  'education',
  'career',
  'health',
  'family',
  'history',
  'finance',
  'other',
];

function rank(category: FactCategory): number {
  return CATEGORY_PRIORITY.indexOf(category);
}

function categoryForYear(facts: readonly SimEventFact[], year: number): GridCategory {
  let best: FactCategory | null = null;
  const prefix = String(year) + '-';
  for (const fact of facts) {
    if (!fact.at.startsWith(prefix)) continue;
    const category = factCategory(fact);
    if (best === null || rank(category) < rank(best)) best = category;
  }
  return best ?? 'none';
}

export function buildLifeGrid(input: {
  birthYear: number;
  /** 去世年份；尚在世时传 null。 */
  deathYear: number | null;
  /** 权威时钟的年份。 */
  currentYear: number;
  facts: readonly SimEventFact[];
}): readonly GridCell[] {
  const lastYear = input.deathYear ?? input.currentYear;
  if (lastYear < input.birthYear) return [];
  const cells: GridCell[] = [];
  for (let year = input.birthYear; year <= lastYear; year += 1) {
    cells.push({ year, category: categoryForYear(input.facts, year) });
  }
  return cells;
}
