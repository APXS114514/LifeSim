import type { CharacterState, ISODate } from '@lifesim/content-schema';
import {
  addYears,
  ageOn,
  yearOf,
  type EventContext,
  type EventDefinition,
  type ScheduleRequest,
  type SimState,
} from '@lifesim/simulation-core';
import { careerEvents } from './career.ts';
import { healthEvents } from './health.ts';
import type { RegionModel } from './region.ts';
import { EVENT, PRIORITY, ageFromPeriod, causes } from './shared.ts';

/**
 * Tier1 NPC 的生命周期（M3-011、GDD §6.3）。
 *
 * NPC 不是主角的附属字段：每个 Tier1 角色在**自己的生日**推进教育、就业、健康与死亡。
 * 事件与随机流都以 NPC 的实体 ID 派生（幂等键含实体 ID），所以 NPC 的生活不会改变主角的抽样。
 *
 * 规则不重写一遍：每年的就业与健康**直接调用主角规则里的处理器**（career/health），
 * 概率、风险乘数与「同一次检查定生死与死因」的逻辑只有一份。这里只做三件事：
 * 1. 排程：`npc.birthday` 是一年一条的年度事件，按年龄调用当年的步骤，并安排下一年的生日；
 * 2. 身份：事实换成关系称谓（母亲/父亲）的模板，不引入人名（M4 再决定）；
 * 3. 边界：死者不再产生任何事实（内核会在处理器之前丢弃死者的事件，这里再守一道）。
 *
 * 之所以把就业与健康放进同一个年度事件、而不是各排一条子事件：每个 NPC 每年只要有 1 条事件，
 * 事件开销与 NPC 数量线性相关（M3-011 的性能预算 p50 ≤ 5.5 ms/局，见报告）。
 */

/** NPC 的叙事称谓。本任务的 Tier1 NPC 只来自出生家庭，用关系称谓而不是人名。 */
export type NpcRole = 'mother' | 'father' | 'relative';

/**
 * 从角色 ID 推出关系称谓：`family.ts` 创建的父母 ID 是 `char:<主角>:<role>`。
 * 其他来源的 Tier1（例如日后被提升的 Tier2）没有称谓信息，用中性的 `relative`。
 */
export function npcRoleOf(actorId: string): NpcRole {
  const suffix = actorId.slice(actorId.lastIndexOf(':') + 1);
  return suffix === 'mother' || suffix === 'father' ? suffix : 'relative';
}

/**
 * NPC 事实的类型与模板键：`career.hired` → `npc.hired`、`life.death` → `npc.death`。
 * 类型与模板一起改名，日志里主角与 NPC 的同类事实不会混在一起（叙事靠模板选称谓）。
 */
export function npcFactType(type: string): string {
  return `npc.${type.slice(type.indexOf('.') + 1)}`;
}

/**
 * 把已实例化的 Tier2 角色提升为 Tier1（M3-017/018、M3-030 会调用）。
 *
 * 只改 `tier`：不重抽 `birthDate`、`traits`、教育与就业等已经确定的字段，也不抽随机数。
 * 「只增加排程」由调用方用 {@link npcBirthdayRequest} 安排第一次 NPC 生日完成
 * （排程需要当前日期，而日期只能来自事件处理器）。
 */
export function promoteToTier1(state: SimState, actorId: string): CharacterState {
  const actor = state.actors.find((candidate) => candidate.id === actorId);
  if (!actor) throw new Error(`Unknown actor ${actorId}`);
  if (actor.tier === 'protagonist') {
    throw new Error(`${actorId} is the active character, not a Tier2 NPC`);
  }
  actor.tier = 'tier1';
  return actor;
}

/** 该角色在 `from` 之后的下一次 NPC 生日；`from` 当天不算。 */
export function npcBirthdayRequest(actor: CharacterState, from: ISODate): ScheduleRequest {
  const age = Math.max(0, ageOn(actor.birthDate, from)) + 1;
  return {
    type: EVENT.npcBirthday,
    at: addYears(actor.birthDate, age),
    entityId: actor.id,
    period: `age:${age}`,
  };
}

/** 年度步骤在事件上下文里的身份：共享处理器的类型与它应当引用的原因事实。 */
interface NpcStep {
  readonly type: string;
  readonly causes: readonly string[];
}

/**
 * 把共享处理器要用的上下文包一层：事实换成 `npc.*` 并补上关系称谓，后续事件换成 NPC 版本。
 * 概率与随机流的使用完全不改——处理器看到的仍是一份普通的事件上下文。
 */
function npcContext(ctx: EventContext, role: NpcRole, step: NpcStep): EventContext {
  return {
    at: ctx.at,
    occurrence: { ...ctx.occurrence, type: step.type, causeFactIds: [...step.causes] },
    state: ctx.state,
    random: ctx.random,
    choice: ctx.choice,
    actor: (id: string): CharacterState => ctx.actor(id),
    emit: (input) =>
      ctx.emit({
        ...input,
        type: npcFactType(input.type),
        templateId: npcFactType(input.type),
        details: { ...input.details, role },
      }),
    schedule: (request) => {
      // 治疗决定要动账户收支，而本任务不为 NPC 结算年度收支：不为 NPC 安排。
      if (request.type === EVENT.treatment) return;
      ctx.schedule(request);
    },
  };
}

/**
 * NPC 的年度事件与它调用的共享处理器。
 *
 * 教育阶段（只在有未成年 NPC 时触发）沿用共享的教育事件；就业与健康在这里直接执行。
 */
export function npcEvents(region: RegionModel): EventDefinition[] {
  const { rules } = region;

  const career = new Map(careerEvents(region).map((definition) => [definition.type, definition]));
  const healthCheck = healthEvents(region).find(
    (definition) => definition.type === EVENT.healthCheck,
  );
  const jobSearch = career.get(EVENT.jobSearch);
  const jobReview = career.get(EVENT.jobReview);
  const retirement = career.get(EVENT.retirement);
  if (!jobSearch || !jobReview || !retirement || !healthCheck) {
    throw new Error('The career and health modules must define their annual steps');
  }

  const birthday: EventDefinition = {
    type: EVENT.npcBirthday,
    version: 1,
    priority: PRIORITY.npcBirthday,
    handle(ctx) {
      const actor = ctx.actor(ctx.occurrence.entityId);
      // 死者无新行为：内核已经在处理器之前丢弃死者的事件，这里再守一道（规则层不依赖内核细节）。
      if (actor.vitalStatus.kind === 'deceased') return;
      const age = ageFromPeriod(ctx.occurrence.period);
      const role = npcRoleOf(actor.id);
      const { education, employment } = actor;
      const sameDay = (type: string, because: readonly string[] = []) => {
        ctx.schedule({
          type,
          at: ctx.at,
          entityId: actor.id,
          period: `age:${age}`,
          causes: because,
        });
      };
      const previous = causes(employment.lastFactId ?? education.lastFactId);

      // 教育：与主角同一套学制（按国家 + 年份），事件与随机流按 NPC 自己的实体 ID 派生。
      const system = region.queries.education.systemAt(yearOf(ctx.at));
      const exitAge = {
        primary: system.primaryStartAge + system.primaryYears,
        secondary: system.primaryStartAge + system.primaryYears + system.secondaryYears,
        tertiary:
          system.primaryStartAge +
          system.primaryYears +
          system.secondaryYears +
          system.tertiaryYears,
      };
      // 只在正好到入学年龄那年排一次：NPC 由家庭创建，成年 NPC 的学历是已知的，
      // 不能用 >=（会把「未受教育」的成年父母当成学龄儿童）。
      if (
        age === system.primaryStartAge &&
        education.completed === 'none' &&
        education.enrolledIn === null &&
        education.lastFactId === null
      ) {
        sameDay(EVENT.primaryEntry);
      }
      if (education.enrolledIn === 'primary' && age >= exitAge.primary) {
        sameDay(EVENT.primaryExit, causes(education.lastFactId));
      }
      if (education.enrolledIn === 'secondary' && age >= exitAge.secondary) {
        sameDay(EVENT.secondaryExit, causes(education.lastFactId));
      }
      if (education.enrolledIn === 'tertiary' && age >= exitAge.tertiary) {
        sameDay(EVENT.tertiaryExit, causes(education.lastFactId));
      }

      // 就业：与主角生日一样按年龄选择当年的一步，再交给共享处理器执行。
      const { status } = employment;
      const step =
        age >= rules.retirementAge
          ? status === 'retired' || status === 'student'
            ? null
            : retirement
          : age >= rules.minimumWorkingAge
            ? status === 'employed'
              ? jobReview
              : status === 'student'
                ? null
                : jobSearch
            : null;
      if (step) step.handle(npcContext(ctx, role, { type: step.type, causes: previous }));

      // 健康：同一次检查定生死与死因（沿用 health.ts，不为 NPC 另写一套抽样）。
      healthCheck.handle(npcContext(ctx, role, { type: healthCheck.type, causes: [] }));

      ctx.schedule(npcBirthdayRequest(actor, ctx.at));
    },
  };

  return [birthday];
}
