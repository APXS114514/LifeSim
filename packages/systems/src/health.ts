import { addMinor } from '@lifesim/content-schema';
import {
  addDays,
  scaleAnnualProbability,
  yearOf,
  type EventDefinition,
} from '@lifesim/simulation-core';
import { currencyLabel, readMacro, type RegionModel } from './region.ts';
import {
  EVENT,
  PRIORITY,
  account,
  ageAt,
  causes,
  evidenceId,
  hasIllness,
  isPoor,
} from './shared.ts';

/**
 * 健康与死亡风险（GDD §8.3）。
 *
 * 死亡风险以生命表的年度概率 q 为基线（它已包含所有死因），再用风险乘数调整：
 * `P = 1 - exp(ln(1-q) · m)`。疾病、贫困、学历只改变乘数，绝不另外叠加一次独立的死亡抽样。
 * 死亡与死因在同一次检查里确定：先抽「是否死亡」，再按疾病占总风险的比例抽死因归属。
 */
export function healthEvents(region: RegionModel): EventDefinition[] {
  const { effects } = region;

  const check: EventDefinition = {
    type: EVENT.healthCheck,
    version: 1,
    priority: PRIORITY.health,
    handle(ctx) {
      const actor = ctx.actor(ctx.occurrence.entityId);
      const age = ageAt(actor, ctx);
      const year = yearOf(ctx.at);
      const poor = isPoor(ctx.state, actor);
      const povertyCause = poor ? actor.finance.lastSettlementFactId : null;

      if (!hasIllness(actor)) {
        const onsetP = region.illnessOnsetP(year, age) * (poor ? effects.povertyIllnessFactor : 1);
        if (ctx.random.chance(onsetP)) {
          const factId = ctx.emit({
            type: 'health.illness-onset',
            outcomeCode: 'chronic',
            actorIds: [actor.id],
            causes: causes(povertyCause),
            evidenceIds: [evidenceId(region, 'illness')],
          });
          actor.health.conditions.push({ id: 'chronic', onset: ctx.at, treated: false, factId });
          ctx.schedule({
            type: EVENT.treatment,
            at: ctx.at,
            entityId: actor.id,
            period: `age:${age}`,
            causes: [factId],
          });
        }
      }

      const condition = actor.health.conditions[0];
      const illnessFactor = condition
        ? condition.treated
          ? effects.mortality.treatedIllness
          : effects.mortality.untreatedIllness
        : 1;
      const multiplier =
        illnessFactor *
        (poor ? effects.mortality.poverty : 1) *
        (actor.education.completed === 'tertiary' ? effects.mortality.tertiaryEducation : 1);
      const p = scaleAnnualProbability(region.mortalityQ(year, age), multiplier);

      // 三次抽样总是全部发生，随机流的消耗与结果无关。
      const dies = ctx.random.chance(p);
      const offsetDays = 1 + ctx.random.int(364);
      const byIllness = ctx.random.chance(condition ? 1 - 1 / illnessFactor : 0);
      if (!dies) return;
      ctx.schedule({
        type: EVENT.death,
        at: addDays(ctx.at, offsetDays), // 一定早于下一个生日
        entityId: actor.id,
        period: 'death',
        payload: { cause: byIllness ? 'illness' : 'other' },
        causes: causes(byIllness ? condition?.factId : null, povertyCause),
      });
    },
  };

  /** 普通决定：是否接受治疗。由人生原则自动决定（健康与财富的取舍），玩家也可以预先指定。 */
  const treatment: EventDefinition = {
    type: EVENT.treatment,
    version: 1,
    priority: PRIORITY.treatment,
    decision: {
      major: false,
      actorId: (occurrence) => occurrence.entityId,
      options(ctx) {
        const actor = ctx.actor(ctx.occurrence.entityId);
        const year = yearOf(ctx.at);
        const { currency } = readMacro(ctx.state);
        const cost = region.treatmentCostMinor(year, currency);
        const available = year >= region.rules.treatmentAvailableFrom;
        const affordable = account(ctx.state, actor).balanceMinor >= cost;
        return [
          {
            id: 'treat',
            eligible: available && affordable,
            ...(available
              ? affordable
                ? {}
                : { ineligibleReason: 'unaffordable' }
              : { ineligibleReason: 'not-yet-available' }),
            scores: { health: 0.9, wealth: -0.6, stability: 0.2 },
          },
          { id: 'forgo', eligible: true, scores: { health: -0.8, wealth: 0.3 } },
        ];
      },
    },
    handle(ctx) {
      const actor = ctx.actor(ctx.occurrence.entityId);
      const choice = ctx.choice;
      if (!choice) throw new Error('Decision without a choice');
      if (choice.optionId === 'forgo') {
        ctx.emit({
          type: 'health.treatment-declined',
          outcomeCode: 'declined',
          actorIds: [actor.id],
          causes: [choice.factId],
        });
        return;
      }
      const { currency } = readMacro(ctx.state);
      const costMinor = region.treatmentCostMinor(yearOf(ctx.at), currency);
      const target = account(ctx.state, actor);
      target.balanceMinor = addMinor(target.balanceMinor, -costMinor);
      for (const condition of actor.health.conditions) condition.treated = true;
      ctx.emit({
        type: 'health.treatment-started',
        outcomeCode: 'treated',
        actorIds: [actor.id],
        causes: [choice.factId],
        evidenceIds: [evidenceId(region, 'illness'), evidenceId(region, 'prices')],
        details: { costMinor, currency: currencyLabel(currency) },
      });
    },
  };

  return [check, treatment];
}
