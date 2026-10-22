import type { CharacterState, HouseholdAccount, ISODate } from '@lifesim/content-schema';
import { ageOn, yearOf, type EventContext, type SimState } from '@lifesim/simulation-core';
import type { RegionModel } from './region.ts';

/** 系统规则版本：规则行为变化时提升，写入快照的 `dataPackVersions.systems`。 */
export const SYSTEMS_VERSION = '0.10.0';

export const PROTAGONIST_ID = 'char:protagonist';

/** 事件类型。 */
export const EVENT = {
  birth: 'life.birth',
  name: 'identity.name',
  birthday: 'life.birthday',
  yearlyFocus: 'choice.yearly-focus',
  focusComplete: 'focus.complete',
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
  focusComplete: 9,
  birthday: 10,
  npcBirthday: 11,
  yearlyFocus: 12,
  settle: 20,
  education: 30,
  afterSecondary: 35,
  career: 40,
  health: 50,
  treatment: 55,
  /** M3-042：通用人生事件排在治疗之后，读到当天各系统结算后的状态；有选择的原型第二段紧随其后。 */
  lifeEvent: 60,
  lifeEventDecision: 61,
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

/** 小学入学年龄的推导上限：学制 schema 允许的最大入学年龄是 10 岁，留出余量。 */
const MAX_PRIMARY_ENTRY_AGE = 15;

/**
 * 小学入学年龄（M3-012c）：用出生年与**逐年学制**确定性推导，取第一次满足
 * `age >= 当年 primaryStartAge` 的那一年。学制在儿童期内变动时（例如朝鲜 1972 年把
 * 入学年龄从 7 岁降到 6 岁），按当年的学制判断当年是否该入学，而不是用「当前年份的
 * 入学年龄」倒推；这样主角与 NPC 都不会在学制改变那一年漏掉入学。
 */
export function primaryEntryAge(region: RegionModel, birthDate: ISODate): number {
  const birthYear = yearOf(birthDate);
  for (let age = 0; age <= MAX_PRIMARY_ENTRY_AGE; age += 1) {
    if (age >= region.queries.education.systemAt(birthYear + age).primaryStartAge) return age;
  }
  throw new Error(`No primary entry age for a birth in ${birthYear}`);
}

/** 学段的年龄日历：每段从入学年龄到毕业年龄。 */
export interface EducationStageAges {
  readonly primaryEntry: number;
  readonly primaryExit: number;
  /** 中学入学年龄：小学毕业当年（小学毕业当天升学）。 */
  readonly secondaryEntry: number;
  readonly secondaryExit: number;
  /** 大学入学年龄：max(中学毕业年龄, 法定工作年龄)，与 `after-secondary` 决定的排程一致。 */
  readonly tertiaryEntry: number;
  readonly tertiaryExit: number;
}

/**
 * 学段的年龄日历（M3-012c）：全部用出生年与**逐年学制**确定性推导。
 *
 * 每段的毕业年龄 = 该段入学年龄 + **入学那年**学制规定的年数：推迟入学不缩短学制，
 * 学制在就读期间改革也不改变已经开始的学段长度。毕业事件仍由当年的生日事件排程
 * （携带年度重点载荷，见 `scheduleAnnualSystems`），这里只回答「哪一年毕业」。
 *
 * 入学年龄同样可确定：小学取 {@link primaryEntryAge}；中学在小学生毕业当天入学；
 * 大学在 `max(中学毕业, 法定工作年龄)` 的 `after-secondary` 决定里入学。
 */
export function educationStageAges(region: RegionModel, birthDate: ISODate): EducationStageAges {
  const birthYear = yearOf(birthDate);
  const primaryEntry = primaryEntryAge(region, birthDate);
  const primaryExit =
    primaryEntry + region.queries.education.systemAt(birthYear + primaryEntry).primaryYears;
  const secondaryExit =
    primaryExit + region.queries.education.systemAt(birthYear + primaryExit).secondaryYears;
  const tertiaryEntry = Math.max(secondaryExit, region.rules.minimumWorkingAge);
  const tertiaryExit =
    tertiaryEntry + region.queries.education.systemAt(birthYear + tertiaryEntry).tertiaryYears;
  return {
    primaryEntry,
    primaryExit,
    secondaryEntry: primaryExit,
    secondaryExit,
    tertiaryEntry,
    tertiaryExit,
  };
}

/**
 * 年度结算覆盖 `[age - 1, age)` 这一年（生日当天结算过去一年，M3-012c）。
 * 按**被结算的那一年**判断是否独立：这一年里还不到法定工作年龄的人，生活费由家里承担，
 * 不从本人账户扣——与 M3-042「未独立时日常花费由家里承担」同一口径，只是年度结算看的是
 * 已经过去的那一年，而通用人生事件看的是事件发生的当年。
 */
export function isIndependentForSettlement(
  actor: CharacterState,
  age: number,
  region: RegionModel,
): boolean {
  return isIndependent(actor, age - 1, region);
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
