import type { ISODate, SimEventFact } from '@lifesim/content-schema';
import {
  factCategory,
  isBackgroundDecision,
  type FactCategory,
} from '../components/fact-category.ts';

/**
 * 人生方格（M4-020）：一年一格，按当年的主要经历着色。
 *
 * 只是展示：类别复用时间线的 factCategory，优先级固定，不重新模拟、不影响玩家这一局。
 * 已发生的时间段一律含两端（出生年与去世年），仍在世时最后一年是权威时钟的年份；不造未来格。
 *
 * M4-020b：每年自动结算的年度重点（后台决定）不参与着色；M3-042 的日常事件有独立类别。
 * 优先级里 daily 排在 history 之后、finance 之前：日常经历比年度收支更能代表那一年，
 * 而 finance 仍在没有任何更高优先级事实时着色。
 */

export type GridCategory =
  | 'life'
  | 'decision'
  | 'education'
  | 'career'
  | 'health'
  | 'family'
  | 'history'
  | 'daily'
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
  'daily',
  'finance',
  'other',
];

/** 图例顺序与上面的着色优先级一致，最后是空的年份。 */
export const GRID_CATEGORIES: readonly GridCategory[] = [...CATEGORY_PRIORITY, 'none'];

function rank(category: FactCategory): number {
  return CATEGORY_PRIORITY.indexOf(category);
}

function categoryForYear(facts: readonly SimEventFact[], year: number): GridCategory {
  let best: FactCategory | null = null;
  const prefix = String(year) + '-';
  for (const fact of facts) {
    if (!fact.at.startsWith(prefix)) continue;
    // 年度重点是每年自动发生的后台决定，不能把整张方格染成同一种颜色（M4-020b）。
    if (isBackgroundDecision(fact)) continue;
    const category = factCategory(fact);
    if (best === null || rank(category) < rank(best)) best = category;
  }
  return best ?? 'none';
}

/**
 * 把时间线的揭示进度换算成方格输入（M4-020b）：只取已揭示的事实，当前年份取揭示日期，
 * 去世年只在死亡事实已经揭示时才有。播放动画时不会提前显示当年颜色或死亡格。
 */
export function revealedGridInput(input: {
  facts: readonly SimEventFact[];
  /** 时间线的 visibleCount。 */
  visibleCount: number;
  /** 年进度条显示的日期（≤ 权威时钟）。 */
  revealDate: ISODate;
}): { facts: readonly SimEventFact[]; currentYear: number; deathYear: number | null } {
  const count = Math.max(0, Math.min(Math.trunc(input.visibleCount), input.facts.length));
  const facts = input.facts.slice(0, count);
  const death = facts.find((fact) => fact.type === 'life.death');
  return {
    facts,
    currentYear: Number(input.revealDate.slice(0, 4)),
    deathYear: death ? Number(death.at.slice(0, 4)) : null,
  };
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
