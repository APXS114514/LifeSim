import type { CharacterState, HouseholdAccount } from '@lifesim/content-schema';
import { ageOn, type EventContext, type SimState } from '@lifesim/simulation-core';
import type { RegionModel } from './region.ts';

/** 系统规则版本：规则行为变化时提升，写入快照的 `dataPackVersions.systems`。 */
export const SYSTEMS_VERSION = '0.6.0';

export const PROTAGONIST_ID = 'char:protagonist';

/** 事件类型。 */
export const EVENT = {
  birth: 'life.birth',
  name: 'identity.name',
  birthday: 'life.birthday',
  death: 'life.death',
  anchor: 'history.anchor',
  settle: 'finance.settle',
  primaryEntry: 'education.primary-entry',
  primaryExit: 'education.primary-exit',
  secondaryExit: 'education.secondary-exit',
  tertiaryExit: 'education.tertiary-exit',
  afterSecondary: 'choice.after-secondary',
  jobSearch: 'career.job-search',
  jobReview: 'career.job-review',
  retirement: 'career.retirement',
  healthCheck: 'health.check',
  treatment: 'choice.treatment',
  /** M3-011：Tier1 NPC 的年度生日推进（每个 NPC 一条独立事件流）。 */
  npcBirthday: 'npc.birthday',
} as const;

/**
 * 同一天内的处理顺序：历史锚点 → 死亡 → 生日 → 年度结算（结算过去一年，用变化前的状态）
 * → 教育 → 升学决定 → 就业 → 健康 → 治疗决定。
 *
 * NPC 的年度事件排在主角的生日之后（M3-011）：NPC 的生日通常与主角不同，
 * 只在恰好同一天时才有先后之分，排在主角的步骤之后可以让主角一整天的事实保持原有的顺序。
 */
export const PRIORITY = {
  birth: 0,
  anchor: 1,
  death: 2,
  name: 5,
  birthday: 10,
  npcBirthday: 11,
  settle: 20,
  education: 30,
  afterSecondary: 35,
  career: 40,
  health: 50,
  treatment: 55,
} as const;

/** 事实 `evidenceIds` 里引用的地区数据表，例如 `ZZ-SYN/mortality`。 */
export function evidenceId(region: RegionModel, table: keyof RegionModel['evidence']): string {
  return `${region.packId}/${table}`;
}

export function accountIdFor(actorId: string): string {
  return `acct:${actorId.replace(/^char:/, '')}`;
}

export function ageAt(actor: CharacterState, context: EventContext): number {
  return ageOn(actor.birthDate, context.at);
}

export function account(state: SimState, actor: CharacterState): HouseholdAccount {
  const found = state.householdAccounts.find((entry) => entry.id === actor.finance.accountId);
  if (!found) throw new Error(`Actor ${actor.id} has no account`);
  return found;
}

export function isPoor(state: SimState, actor: CharacterState): boolean {
  return account(state, actor).balanceMinor < 0;
}

export function untreatedIllness(actor: CharacterState) {
  return actor.health.conditions.find((condition) => !condition.treated);
}

export function hasIllness(actor: CharacterState): boolean {
  return actor.health.conditions.length > 0;
}

/** 已离开学校且到了法定工作年龄：开始独立承担年度收支。 */
export function isIndependent(actor: CharacterState, age: number, region: RegionModel): boolean {
  const { status } = actor.employment;
  return status !== 'child' && status !== 'student' && age >= region.rules.minimumWorkingAge;
}

/** 非空的事实 ID 列表。 */
export function causes(...ids: readonly (string | null | undefined)[]): string[] {
  return ids.filter((id): id is string => typeof id === 'string');
}

export function ageFromPeriod(period: string): number {
  const match = /^age:(\d+)$/.exec(period);
  if (!match) throw new Error(`Expected an age period, got ${period}`);
  return Number(match[1]);
}
