import type {
  EducationLevel,
  ISODate,
  SimEventFact,
  SimulationSnapshot,
} from '@lifesim/content-schema';
import { addDays, ageOn } from '@lifesim/simulation-core';

/** 只读派生：不保存到角色、不影响规则或抽样。以下权重均为 D 级设计假设，非统计值。 */
export const HEALTH_ILLNESS_WEIGHT = { untreated: 0.3, treated: 0.12 } as const;
export const HEALTH_AGE_WEIGHT = 0.25;
export const HEALTH_AGE_START = 50;
export const HEALTH_AGE_SPAN = 50;
export const ECONOMY_MIDPOINT = 0.5;
export const KNOWLEDGE_BASE: Readonly<Record<EducationLevel, number>> = {
  none: 0.1,
  primary: 0.3,
  secondary: 0.5,
  tertiary: 0.75,
};
export const KNOWLEDGE_ENROLLMENT_WEIGHT = 0.15;
export const KNOWLEDGE_APTITUDE_WEIGHT = 0.2;
export const KNOWLEDGE_SKILL_WEIGHT = 0.05;
export const KNOWLEDGE_SKILL_CAP = 0.15;
export const SOCIAL_TIES_WEIGHT = 0.2;
export const STRESS_WEIGHT = 0.2;
export const HAPPINESS_WEIGHTS = {
  health: 0.3,
  economy: 0.25,
  relationships: 0.25,
  knowledge: 0.2,
} as const;
export const RECENT_EVENT_WEIGHT = 0.05;
export const RECENT_EVENT_LIMIT = 0.15;
export const RECENT_EVENT_DAYS = 730;

export const INDICATOR_KEYS = [
  'health',
  'happiness',
  'knowledge',
  'relationships',
  'economy',
] as const;
export type IndicatorKey = (typeof INDICATOR_KEYS)[number];
/** 五个指标，各为 0—1 的比值。 */
export type IndicatorValues = Record<IndicatorKey, number>;

const POSITIVE_EVENTS = new Set([
  'career.hired',
  'education.admitted',
  'education.secondary-completed',
  'education.tertiary-completed',
]);
const NEGATIVE_EVENTS = new Set([
  'health.illness-onset',
  'career.job-lost',
  'education.admission-failed',
]);

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function protagonistOf(snapshot: SimulationSnapshot) {
  const protagonist = snapshot.actors.find((actor) => actor.id === snapshot.activeCharacterId);
  if (!protagonist) throw new Error('Snapshot has no protagonist');
  return protagonist;
}

/** 0—1 比值 → 0—100 的界面整数；先夹取，再四舍五入。 */
export function indicatorPercent(value: number): number {
  return Math.round(clamp01(value) * 100);
}

export interface DerivedIncome {
  incomeMinor: number;
  incomeSource: 'wage' | 'pension' | 'none';
  at: ISODate;
}

/** 按 sequence 取主角的最近结算；缺失或无有效收入明细时不编造收入。 */
export function deriveIncome(
  snapshot: SimulationSnapshot,
  facts: readonly SimEventFact[],
): DerivedIncome | null {
  const protagonist = protagonistOf(snapshot);
  let latest: SimEventFact | undefined;
  for (const fact of facts) {
    if (fact.type !== 'finance.settlement' || !fact.actorIds.includes(protagonist.id)) continue;
    if (latest === undefined || fact.sequence > latest.sequence) latest = fact;
  }
  const incomeMinor = latest?.details?.['incomeMinor'];
  const incomeSource = latest?.details?.['incomeSource'];
  if (
    latest === undefined ||
    typeof incomeMinor !== 'number' ||
    !Number.isSafeInteger(incomeMinor) ||
    (incomeSource !== 'wage' && incomeSource !== 'pension' && incomeSource !== 'none')
  )
    return null;
  return { incomeMinor, incomeSource, at: latest.at };
}

export function deriveIndicators(
  snapshot: SimulationSnapshot,
  facts: readonly SimEventFact[],
): IndicatorValues {
  const protagonist = protagonistOf(snapshot);
  const age = ageOn(protagonist.birthDate, snapshot.at);
  const account = snapshot.householdAccounts.find(
    (entry) => entry.id === protagonist.finance.accountId,
  );
  const income = deriveIncome(snapshot, facts)?.incomeMinor ?? 0;
  const scale = Math.max(1, Math.abs(income));
  const balance = account?.balanceMinor ?? 0;
  let treated = 0;
  let untreated = 0;
  for (const condition of protagonist.health.conditions) {
    if (condition.treated) treated += 1;
    else untreated += 1;
  }
  const illnessWeight =
    HEALTH_ILLNESS_WEIGHT.untreated * untreated + HEALTH_ILLNESS_WEIGHT.treated * treated;
  const health = clamp01(
    1 -
      Math.min(1, illnessWeight) -
      HEALTH_AGE_WEIGHT * clamp01((age - HEALTH_AGE_START) / HEALTH_AGE_SPAN),
  );
  const economy = clamp01(
    ECONOMY_MIDPOINT + (ECONOMY_MIDPOINT * balance) / (Math.abs(balance) + scale),
  );
  const knowledge = clamp01(
    KNOWLEDGE_BASE[protagonist.education.completed] +
      (protagonist.education.enrolledIn === null ? 0 : KNOWLEDGE_ENROLLMENT_WEIGHT) +
      KNOWLEDGE_APTITUDE_WEIGHT * protagonist.traits.aptitude +
      Math.min(
        KNOWLEDGE_SKILL_CAP,
        KNOWLEDGE_SKILL_WEIGHT * protagonist.skills.reduce((sum, skill) => sum + skill.level, 0),
      ),
  );
  let qualitySum = 0;
  let relationshipCount = 0;
  for (const relationship of snapshot.relationships) {
    if (
      relationship.until !== null ||
      (relationship.fromId !== protagonist.id && relationship.toId !== protagonist.id)
    )
      continue;
    const bond = relationship.bonds[protagonist.id];
    if (bond === undefined) continue;
    qualitySum += (bond.trust + bond.intimacy + (1 - bond.conflict)) / 3;
    relationshipCount += 1;
  }
  // Center fine-state effects on their approved birth defaults, preserving the previous initial view.
  const relationships = clamp01(
    (relationshipCount === 0 ? 0 : qualitySum / relationshipCount) +
      SOCIAL_TIES_WEIGHT * (protagonist.social.ties - 0.5),
  );
  const recentStart = addDays(snapshot.at, -RECENT_EVENT_DAYS);
  let eventBalance = 0;
  for (const fact of facts) {
    if (!fact.actorIds.includes(protagonist.id) || fact.at < recentStart || fact.at > snapshot.at)
      continue;
    if (POSITIVE_EVENTS.has(fact.type)) eventBalance += 1;
    if (
      NEGATIVE_EVENTS.has(fact.type) ||
      (fact.type === 'finance.settlement' && fact.outcomeCode === 'in-debt')
    )
      eventBalance -= 1;
  }
  const delta = Math.max(
    -RECENT_EVENT_LIMIT,
    Math.min(RECENT_EVENT_LIMIT, RECENT_EVENT_WEIGHT * eventBalance),
  );
  const happiness = clamp01(
    HAPPINESS_WEIGHTS.health * health +
      HAPPINESS_WEIGHTS.economy * economy +
      HAPPINESS_WEIGHTS.relationships * relationships +
      HAPPINESS_WEIGHTS.knowledge * knowledge +
      delta -
      STRESS_WEIGHT * (protagonist.wellbeing.stress - 0.3),
  );
  return { health, happiness, knowledge, relationships, economy };
}
