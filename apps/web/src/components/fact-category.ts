import type { SimEventFact } from '@lifesim/content-schema';

/** 事实类别 → 时间线图标；只用于展示，不改变事实本身。 */
export type FactCategory =
  | 'life'
  | 'family'
  | 'education'
  | 'career'
  | 'finance'
  | 'health'
  | 'history'
  | 'decision'
  | 'other';

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
  if (type.startsWith('decision.')) return 'decision';
  return 'other';
}
