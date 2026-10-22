import type { SimEventFact } from '@lifesim/content-schema';
import { EVENT, lifeEventCatalog, lifeEventType } from '@lifesim/systems';

/** 事实类别 → 时间线图标；只用于展示，不改变事实本身。 */
export type FactCategory =
  | 'life'
  | 'family'
  | 'education'
  | 'career'
  | 'finance'
  | 'health'
  | 'history'
  | 'daily'
  | 'decision'
  | 'other';

/** M3-042 通用人生事件的原型类型。按目录派生，不在这里手写类型列表。 */
const DAILY_LIFE_TYPES: ReadonlySet<string> = new Set(
  lifeEventCatalog().map((prototype) => lifeEventType(prototype.id)),
);

/** 这条事实是否是 M3-042 原型目录产出的日常生活事件（life.<原型>）。 */
export function isDailyLifeFact(type: string): boolean {
  return DAILY_LIFE_TYPES.has(type);
}

/**
 * 每年生日自动结算的年度重点（choice.yearly-focus）是后台决定：时间线照常显示，
 * 但它不代表人生里的一个决定，不参与人生方格着色（M4-020b）。
 */
export function isBackgroundDecision(fact: SimEventFact): boolean {
  return fact.type === 'decision.made' && fact.details?.['decision'] === EVENT.yearlyFocus;
}

export function factCategory(fact: SimEventFact): FactCategory {
  const type = fact.type;
  if (type === 'life.birth' || type === 'life.death') return 'life';
  // M3-011：家人（Tier1 NPC）的事实都是 npc.* 类型，包括 npc.death；它们属于「家庭」，不是主角的生死。
  if (
    type.startsWith('family.') ||
    type.startsWith('npc.') ||
    type.startsWith('tier2.') ||
    type.startsWith('identity.')
  ) {
    return 'family';
  }
  if (type.startsWith('education.')) return 'education';
  if (type.startsWith('career.')) return 'career';
  if (type.startsWith('finance.')) return 'finance';
  if (type.startsWith('health.')) return 'health';
  if (type.startsWith('history.')) return 'history';
  if (isDailyLifeFact(type)) return 'daily';
  if (type.startsWith('decision.')) return 'decision';
  return 'other';
}
