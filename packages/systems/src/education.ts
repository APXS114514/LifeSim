import { yearOf, type EventDefinition } from '@lifesim/simulation-core';
import type { RegionModel } from './region.ts';
import { EVENT, PRIORITY, ageAt, causes, evidenceId } from './shared.ts';
import { focusProbability } from './yearly-focus.ts';

/**
 * 教育路径（GDD §8.2 的最小版本）：小学入学 → 小学毕业与是否升中学 → 中学毕业后的重大决定
 * （报考大学或直接工作）→ 大学录取与毕业。录取结果不确定：选择报考不等于一定考上。
 */
export function educationEvents(region: RegionModel): EventDefinition[] {
  const evidence = [evidenceId(region, 'education')];

  const primaryEntry: EventDefinition = {
    type: EVENT.primaryEntry,
    version: 1,
    priority: PRIORITY.education,
    handle(ctx) {
      const actor = ctx.actor(ctx.occurrence.entityId);
      const year = yearOf(ctx.at);
      if (
        ctx.random.chance(
          focusProbability(
            ctx,
            region.primaryEnrollmentP(year, actor.origin.settlement),
            'education',
          ),
        )
      ) {
        actor.education.enrolledIn = 'primary';
        actor.employment.status = 'student';
        actor.education.lastFactId = ctx.emit({
          type: 'education.primary-started',
          outcomeCode: 'enrolled',
          actorIds: [actor.id],
          evidenceIds: evidence,
        });
      } else {
        actor.education.lastFactId = ctx.emit({
          type: 'education.not-enrolled',
          outcomeCode: 'not-enrolled',
          actorIds: [actor.id],
          evidenceIds: evidence,
        });
      }
    },
  };

  const primaryExit: EventDefinition = {
    type: EVENT.primaryExit,
    version: 1,
    priority: PRIORITY.education,
    handle(ctx) {
      const actor = ctx.actor(ctx.occurrence.entityId);
      const year = yearOf(ctx.at);
      actor.education.completed = 'primary';
      actor.education.enrolledIn = null;
      actor.employment.status = 'not-in-labor-force';
      const completed = ctx.emit({
        type: 'education.primary-completed',
        outcomeCode: 'completed',
        actorIds: [actor.id],
        evidenceIds: evidence,
      });
      if (
        ctx.random.chance(
          focusProbability(ctx, region.secondaryContinuationP(year, actor.origin), 'education'),
        )
      ) {
        actor.education.enrolledIn = 'secondary';
        actor.employment.status = 'student';
        actor.education.lastFactId = ctx.emit({
          type: 'education.secondary-started',
          outcomeCode: 'enrolled',
          actorIds: [actor.id],
          causes: [completed],
          evidenceIds: evidence,
        });
      } else {
        actor.education.lastFactId = ctx.emit({
          type: 'education.left-school',
          outcomeCode: 'left',
          actorIds: [actor.id],
          causes: [completed],
          evidenceIds: evidence,
        });
      }
    },
  };

  const secondaryExit: EventDefinition = {
    type: EVENT.secondaryExit,
    version: 1,
    priority: PRIORITY.education,
    handle(ctx) {
      const actor = ctx.actor(ctx.occurrence.entityId);
      actor.education.completed = 'secondary';
      actor.education.enrolledIn = null;
      actor.employment.status = 'not-in-labor-force';
      const completed = ctx.emit({
        type: 'education.secondary-completed',
        outcomeCode: 'completed',
        actorIds: [actor.id],
        evidenceIds: evidence,
      });
      actor.education.lastFactId = completed;
      ctx.schedule({
        type: EVENT.afterSecondary,
        payload: ctx.occurrence.payload,
        at: ctx.at,
        entityId: actor.id,
        period: `age:${ageAt(actor, ctx)}`,
        causes: [completed],
      });
    },
  };

  /** 重大决定：报考大学还是直接工作（M1 要求的「玩家干预一次重大选择」）。 */
  const afterSecondary: EventDefinition = {
    type: EVENT.afterSecondary,
    version: 1,
    priority: PRIORITY.afterSecondary,
    decision: {
      major: true,
      actorId: (occurrence) => occurrence.entityId,
      options(ctx) {
        const actor = ctx.actor(ctx.occurrence.entityId);
        return [
          {
            id: 'apply-university',
            eligible: actor.education.completed === 'secondary',
            scores: { knowledge: 0.9, wealth: 0.4, risk: 0.5, stability: -0.3 },
          },
          {
            id: 'start-work',
            eligible: ageAt(actor, ctx) >= region.rules.minimumWorkingAge,
            scores: { wealth: 0.5, stability: 0.6, family: 0.3, knowledge: -0.1 },
          },
        ];
      },
    },
    handle(ctx) {
      const actor = ctx.actor(ctx.occurrence.entityId);
      const choice = ctx.choice;
      if (!choice) throw new Error('Decision without a choice');
      const searchForWork = (because: string) => {
        ctx.schedule({
          type: EVENT.jobSearch,
          payload: ctx.occurrence.payload,
          at: ctx.at,
          entityId: actor.id,
          period: `age:${ageAt(actor, ctx)}`,
          causes: [because],
        });
      };
      if (choice.optionId === 'start-work') {
        searchForWork(choice.factId);
        return;
      }
      const year = yearOf(ctx.at);
      if (
        ctx.random.chance(
          focusProbability(
            ctx,
            region.universityAdmissionP(year, actor.traits.aptitude),
            'education',
          ),
        )
      ) {
        actor.education.enrolledIn = 'tertiary';
        actor.employment.status = 'student';
        actor.education.lastFactId = ctx.emit({
          type: 'education.admitted',
          outcomeCode: 'admitted',
          actorIds: [actor.id],
          causes: [choice.factId],
          evidenceIds: evidence,
        });
      } else {
        const failed = ctx.emit({
          type: 'education.admission-failed',
          outcomeCode: 'rejected',
          actorIds: [actor.id],
          causes: [choice.factId],
          evidenceIds: evidence,
        });
        actor.education.lastFactId = failed;
        searchForWork(failed);
      }
    },
  };

  const tertiaryExit: EventDefinition = {
    type: EVENT.tertiaryExit,
    version: 1,
    priority: PRIORITY.education,
    handle(ctx) {
      const actor = ctx.actor(ctx.occurrence.entityId);
      actor.education.completed = 'tertiary';
      actor.education.enrolledIn = null;
      actor.employment.status = 'not-in-labor-force';
      const completed = ctx.emit({
        type: 'education.tertiary-completed',
        outcomeCode: 'completed',
        actorIds: [actor.id],
        causes: causes(...ctx.occurrence.causeFactIds),
        evidenceIds: evidence,
      });
      actor.education.lastFactId = completed;
      ctx.schedule({
        type: EVENT.jobSearch,
        payload: ctx.occurrence.payload,
        at: ctx.at,
        entityId: actor.id,
        period: `age:${ageAt(actor, ctx)}`,
        causes: [completed],
      });
    },
  };

  return [primaryEntry, primaryExit, secondaryExit, afterSecondary, tertiaryExit];
}
