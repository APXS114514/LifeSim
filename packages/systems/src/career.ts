import { yearOf, type EventDefinition } from '@lifesim/simulation-core';
import { readMacro, type RegionModel } from './region.ts';
import { EVENT, PRIORITY, causes, evidenceId, untreatedIllness } from './shared.ts';

/**
 * 就业（GDD §8.2 的最小版本）：求职、年度失业风险、退休。
 * 经济衰退（历史锚点）与未治疗的慢性病都会改变概率，事实会把它们列为原因。
 */
export function careerEvents(region: RegionModel): EventDefinition[] {
  const evidence = [evidenceId(region, 'labor')];

  const jobSearch: EventDefinition = {
    type: EVENT.jobSearch,
    version: 1,
    priority: PRIORITY.career,
    handle(ctx) {
      const actor = ctx.actor(ctx.occurrence.entityId);
      const { status } = actor.employment;
      if (status === 'employed' || status === 'retired' || status === 'student') return;
      const macro = readMacro(ctx.state);
      const illness = untreatedIllness(actor);
      const recession = macro.economyPhase === 'recession' ? macro.economyPhaseFactId : null;
      const p =
        region.hiringP(yearOf(ctx.at), actor.education.completed, macro.economyPhase) *
        (illness ? region.effects.illnessHiringFactor : 1);
      const because = causes(
        ...ctx.occurrence.causeFactIds,
        actor.education.lastFactId,
        recession,
        illness?.factId,
      );
      if (ctx.random.chance(p)) {
        actor.employment = {
          status: 'employed',
          wageLevel: actor.education.completed,
          lastFactId: ctx.emit({
            type: 'career.hired',
            outcomeCode: 'hired',
            actorIds: [actor.id],
            causes: because,
            evidenceIds: evidence,
            details: { level: actor.education.completed },
          }),
        };
      } else {
        actor.employment = {
          status: 'unemployed',
          wageLevel: null,
          lastFactId: ctx.emit({
            type: 'career.job-search-failed',
            outcomeCode: 'not-hired',
            actorIds: [actor.id],
            causes: because,
            evidenceIds: evidence,
            details: { phase: macro.economyPhase },
          }),
        };
      }
    },
  };

  const jobReview: EventDefinition = {
    type: EVENT.jobReview,
    version: 1,
    priority: PRIORITY.career,
    handle(ctx) {
      const actor = ctx.actor(ctx.occurrence.entityId);
      if (actor.employment.status !== 'employed') return;
      const macro = readMacro(ctx.state);
      const illness = untreatedIllness(actor);
      const p =
        region.jobLossP(yearOf(ctx.at), macro.economyPhase) *
        (illness ? region.effects.illnessJobLossFactor : 1);
      if (!ctx.random.chance(p)) return;
      actor.employment = {
        status: 'unemployed',
        wageLevel: null,
        lastFactId: ctx.emit({
          type: 'career.job-lost',
          outcomeCode: 'lost',
          actorIds: [actor.id],
          causes: causes(
            actor.employment.lastFactId,
            macro.economyPhase === 'recession' ? macro.economyPhaseFactId : null,
            illness?.factId,
          ),
          evidenceIds: evidence,
          details: { phase: macro.economyPhase },
        }),
      };
    },
  };

  const retirement: EventDefinition = {
    type: EVENT.retirement,
    version: 1,
    priority: PRIORITY.career,
    handle(ctx) {
      const actor = ctx.actor(ctx.occurrence.entityId);
      // 没有工作过或失业中的人，养老金按最高学历对应的工资计算（M1 的简化，见 ADR-0003）。
      const level = actor.employment.wageLevel ?? actor.education.completed;
      actor.employment = {
        status: 'retired',
        wageLevel: level,
        lastFactId: ctx.emit({
          type: 'career.retired',
          outcomeCode: 'retired',
          actorIds: [actor.id],
          causes: causes(actor.employment.lastFactId),
          evidenceIds: evidence,
          details: { level },
        }),
      };
    },
  };

  return [jobSearch, jobReview, retirement];
}
