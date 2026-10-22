import type { CharacterState } from '@lifesim/content-schema';
import {
  addYears,
  type DecisionOption,
  type EventContext,
  type EventDefinition,
} from '@lifesim/simulation-core';
import { z } from 'zod';
import type { RegionModel } from './region.ts';
import {
  EVENT,
  PRIORITY,
  ageFromPeriod,
  causes,
  educationStageAges,
  isIndependentForSettlement,
  PROTAGONIST_ID,
} from './shared.ts';

export const YEARLY_FOCUS_IDS = [
  'balanced',
  'study',
  'work',
  'health',
  'family',
  'leisure',
] as const;
export const YearlyFocusSchema = z.enum(YEARLY_FOCUS_IDS);
export type YearlyFocus = z.infer<typeof YearlyFocusSchema>;
const PayloadSchema = z.strictObject({ focus: YearlyFocusSchema });

/** D 级设计假设，维护者已确认；不包含死亡或虚构的治疗成功率。 */
export const FOCUS_EFFECTS = {
  balanced: { education: 1, hiring: 1, jobLoss: 1, onset: 1, stress: 0, ties: 0 },
  study: { education: 1.15, hiring: 0.95, jobLoss: 1, onset: 1, stress: 0.01, ties: 0 },
  work: { education: 0.95, hiring: 1.15, jobLoss: 0.85, onset: 1.1, stress: 0.03, ties: 0 },
  health: { education: 1, hiring: 0.95, jobLoss: 1, onset: 0.85, stress: -0.02, ties: 0 },
  family: { education: 1, hiring: 0.95, jobLoss: 1, onset: 1, stress: -0.01, ties: 0.03 },
  leisure: { education: 0.95, hiring: 0.95, jobLoss: 1, onset: 0.95, stress: -0.03, ties: 0.01 },
} as const;

const SCORES: Readonly<Record<YearlyFocus, DecisionOption['scores']>> = {
  balanced: {
    family: 0.35,
    wealth: 0.35,
    health: 0.35,
    knowledge: 0.35,
    risk: 0.35,
    stability: 0.35,
  },
  study: { knowledge: 1, stability: 0.2, wealth: -0.2, health: -0.2 },
  work: { wealth: 1, stability: 0.4, risk: 0.2, health: -0.2, knowledge: -0.1 },
  health: { health: 1, stability: 0.5, wealth: -0.1 },
  family: { family: 1, health: 0.2, wealth: -0.2 },
  leisure: { health: 0.5, family: 0.1, risk: 0.2, wealth: -0.2, knowledge: -0.1 },
};

export function yearlyFocusOptions(
  actor: CharacterState,
  age: number,
  region: RegionModel,
): DecisionOption[] {
  return YEARLY_FOCUS_IDS.map((id) => ({
    id,
    eligible:
      id === 'study'
        ? age >= 6
        : id === 'work'
          ? age >= region.rules.minimumWorkingAge &&
            age < region.rules.retirementAge &&
            actor.employment.status !== 'student' &&
            actor.employment.status !== 'retired'
          : true,
    scores: { ...SCORES[id] },
  }));
}

export function yearlyFocusDecisionKey(age: number): string {
  if (!Number.isSafeInteger(age) || age < 0) throw new RangeError('Invalid focus age');
  return `${EVENT.yearlyFocus}|${PROTAGONIST_ID}|age:${age}`;
}

export function selectedFocus(ctx: EventContext): YearlyFocus {
  if (ctx.actor(ctx.occurrence.entityId).tier !== 'protagonist' || ctx.occurrence.payload === null)
    return 'balanced';
  return PayloadSchema.parse(ctx.occurrence.payload).focus;
}

export function focusProbability(
  ctx: EventContext,
  probability: number,
  effect: 'education' | 'hiring' | 'jobLoss' | 'onset',
): number {
  return Math.max(0, Math.min(1, probability * FOCUS_EFFECTS[selectedFocus(ctx)][effect]));
}

/** 当年的重点随 occurrence 传递；不建立另一份持久化权威状态。 */
export function scheduleAnnualSystems(
  ctx: EventContext,
  actor: CharacterState,
  age: number,
  region: RegionModel,
  focus: YearlyFocus,
): void {
  const { rules } = region;
  const { education, employment } = actor;
  // 入学/毕业年龄用出生年与**逐年学制**确定性推导（M3-012c）：每段毕业年龄 = 该段入学
  // 年龄 + 入学那年学制的年数，所以推迟入学不缩短学制、中途改革不改变已开始学段的长度。
  // 毕业事件仍由当年的生日排程并携带 { focus }，年度重点才能作用在升学与升学考试上
  // （M3-041 已批准的行为）。
  const ages = educationStageAges(region, actor.birthDate);
  const sameDay = (type: string, because: readonly string[] = []) => {
    ctx.schedule({
      type,
      at: ctx.at,
      entityId: actor.id,
      period: `age:${age}`,
      causes: because,
      payload: { focus },
    });
  };
  // 结算覆盖 [age-1, age) 这一年：按被结算的那一年判断是否独立（M3-012c）。
  if (isIndependentForSettlement(actor, age, region)) sameDay(EVENT.settle);
  if (
    age === ages.primaryEntry &&
    education.completed === 'none' &&
    education.enrolledIn === null &&
    education.lastFactId === null
  )
    sameDay(EVENT.primaryEntry);
  if (education.enrolledIn === 'primary' && age === ages.primaryExit)
    sameDay(EVENT.primaryExit, causes(education.lastFactId));
  if (education.enrolledIn === 'secondary' && age === ages.secondaryExit)
    sameDay(EVENT.secondaryExit, causes(education.lastFactId));
  if (education.enrolledIn === 'tertiary' && age === ages.tertiaryExit)
    sameDay(EVENT.tertiaryExit, causes(education.lastFactId));
  const { status } = employment;
  if (age >= rules.retirementAge) {
    if (status !== 'retired' && status !== 'student')
      sameDay(EVENT.retirement, causes(employment.lastFactId));
  } else if (age >= rules.minimumWorkingAge) {
    if (status === 'employed') sameDay(EVENT.jobReview, causes(employment.lastFactId));
    else if (status !== 'student')
      sameDay(EVENT.jobSearch, causes(employment.lastFactId ?? education.lastFactId));
  }
  sameDay(EVENT.healthCheck);
}

export function yearlyFocusEvents(region: RegionModel): EventDefinition[] {
  return [
    {
      type: EVENT.yearlyFocus,
      version: 1,
      priority: PRIORITY.yearlyFocus,
      decision: {
        major: false,
        background: true,
        actorId: (occurrence) => occurrence.entityId,
        options: (ctx) =>
          yearlyFocusOptions(
            ctx.actor(ctx.occurrence.entityId),
            ageFromPeriod(ctx.occurrence.period),
            region,
          ),
      },
      handle(ctx) {
        const actor = ctx.actor(ctx.occurrence.entityId);
        if (!ctx.choice) throw new Error('Focus decision without a choice');
        const focus = YearlyFocusSchema.parse(ctx.choice.optionId);
        const age = ageFromPeriod(ctx.occurrence.period);
        scheduleAnnualSystems(ctx, actor, age, region, focus);
        const effects = FOCUS_EFFECTS[focus];
        if (effects.stress !== 0 || effects.ties !== 0)
          ctx.schedule({
            type: EVENT.focusComplete,
            at: addYears(actor.birthDate, age + 1),
            entityId: actor.id,
            period: `age:${age + 1}`,
            payload: { focus },
            causes: [ctx.choice.factId],
          });
      },
    },
    {
      type: EVENT.focusComplete,
      version: 1,
      priority: PRIORITY.focusComplete,
      handle(ctx) {
        const actor = ctx.actor(ctx.occurrence.entityId);
        const effects = FOCUS_EFFECTS[selectedFocus(ctx)];
        actor.wellbeing.stress = Math.max(0, Math.min(1, actor.wellbeing.stress + effects.stress));
        actor.social.ties = Math.max(0, Math.min(1, actor.social.ties + effects.ties));
      },
    },
  ];
}
