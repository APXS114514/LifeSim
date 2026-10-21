import {
  LifePrinciplesSchema,
  type CharacterState,
  type ISODate,
  type LifePrinciples,
} from '@lifesim/content-schema';
import { addYears, yearOf, type EventDefinition } from '@lifesim/simulation-core';
import { z } from 'zod';
import { createBirthFamily } from './family.ts';
import { npcBirthdayRequest, npcFactType, npcRoleOf } from './npc.ts';
import { writeMacro, type MacroState, type RegionModel } from './region.ts';
import {
  EVENT,
  PRIORITY,
  accountIdFor,
  ageAt,
  ageFromPeriod,
  causes,
  evidenceId,
  isIndependent,
} from './shared.ts';

export const DEFAULT_PRINCIPLES: LifePrinciples = {
  family: 0.5,
  wealth: 0.5,
  health: 0.5,
  knowledge: 0.5,
  risk: 0.5,
  stability: 0.5,
};

export const BirthPayloadSchema = z.strictObject({
  settlement: z.enum(['urban', 'rural']).nullable(),
  principles: LifePrinciplesSchema.nullable(),
});

const DeathPayloadSchema = z.strictObject({ cause: z.enum(['illness', 'other']) });

/** 出生当天的宏观状态：在数据包初始状态上，依次应用出生前已经发生的锚点。 */
export function macroAtBirth(region: RegionModel, birthDate: ISODate): MacroState {
  const macro: MacroState = {
    regionId: region.packId,
    economyPhase: region.initialMacro.economyPhase,
    economyPhaseFactId: null,
    currency: { ...region.initialMacro.currency },
  };
  for (const anchor of region.anchors) {
    if (anchor.at >= birthDate || !anchor.regionIds.includes(region.packId)) continue;
    if (anchor.kind === 'economy-phase') macro.economyPhase = anchor.phase;
    else if (anchor.kind === 'redenomination' && anchor.currencyCode === macro.currency.code)
      macro.currency.version = anchor.toVersion;
  }
  return macro;
}

export function lifeEvents(region: RegionModel): EventDefinition[] {
  const { rules } = region;
  const educationAge = {
    primaryExit: rules.primaryStartAge + rules.primaryYears,
    secondaryExit: rules.primaryStartAge + rules.primaryYears + rules.secondaryYears,
    tertiaryExit:
      rules.primaryStartAge + rules.primaryYears + rules.secondaryYears + rules.tertiaryYears,
  };

  const birth: EventDefinition = {
    type: EVENT.birth,
    version: 1,
    priority: PRIORITY.birth,
    handle(ctx) {
      const payload = BirthPayloadSchema.parse(ctx.occurrence.payload);
      const year = yearOf(ctx.at);
      // 即使玩家指定了城乡也照常抽样，保证同一随机流里后续抽样的位置不变。
      const urbanDraw = ctx.random.chance(region.urbanBirthShare(year));
      const settlement = payload.settlement ?? (urbanDraw ? 'urban' : 'rural');
      const familyResources = ctx.random.weighted(region.familyResourcesWeights(year, settlement));
      const aptitude = ctx.random.next();

      const id = ctx.occurrence.entityId;
      const macro = macroAtBirth(region, ctx.at);
      const placeId = region.placeId(settlement);
      const actor: CharacterState = {
        id,
        tier: 'protagonist',
        birthDate: ctx.at,
        birthPlaceId: placeId,
        currentResidenceId: placeId,
        politicalEntityId: region.polityId,
        citizenshipIds: [region.polityId],
        vitalStatus: { kind: 'alive' },
        lifePrinciples: payload.principles ?? DEFAULT_PRINCIPLES,
        origin: { settlement, familyResources },
        traits: { aptitude },
        education: { completed: 'none', enrolledIn: null, lastFactId: null },
        employment: { status: 'child', wageLevel: null, lastFactId: null },
        health: { conditions: [] },
        finance: { accountId: accountIdFor(id), lastSettlementFactId: null },
      };
      ctx.state.actors.push(actor);
      ctx.state.householdAccounts.push({
        id: accountIdFor(id),
        ownerIds: [id],
        currency: macro.currency,
        balanceMinor: 0,
      });
      writeMacro(ctx.state, macro);

      const born = ctx.emit({
        type: 'life.birth',
        outcomeCode: 'born',
        actorIds: [id],
        evidenceIds: [evidenceId(region, 'population')],
        details: { place: placeId, settlement, familyResources },
      });
      createBirthFamily(ctx, region, actor, born);
      // M3-011：出生家庭里的 Tier1 NPC 从下一个生日开始推进自己的生命周期。
      for (const npc of ctx.state.actors) {
        if (npc.tier !== 'tier1') continue;
        ctx.schedule(npcBirthdayRequest(npc, ctx.at));
      }
      for (const anchor of region.anchors) {
        if (anchor.at < ctx.at || !anchor.regionIds.includes(region.packId)) continue;
        ctx.schedule({
          type: EVENT.anchor,
          at: anchor.at,
          entityId: region.polityId,
          period: anchor.id,
          payload: anchor.id,
        });
      }
      ctx.schedule({
        type: EVENT.birthday,
        at: ctx.at,
        entityId: id,
        period: 'age:0',
        causes: [born],
      });
    },
  };

  /** 每个生日（含出生当天的 0 岁）安排当年要结算的事项，再安排下一个生日。 */
  const birthday: EventDefinition = {
    type: EVENT.birthday,
    version: 1,
    priority: PRIORITY.birthday,
    handle(ctx) {
      const actor = ctx.actor(ctx.occurrence.entityId);
      const age = ageFromPeriod(ctx.occurrence.period);
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

      if (isIndependent(actor, age, region)) sameDay(EVENT.settle);

      if (
        age === rules.primaryStartAge &&
        education.completed === 'none' &&
        education.enrolledIn === null
      ) {
        sameDay(EVENT.primaryEntry);
      }
      if (education.enrolledIn === 'primary' && age === educationAge.primaryExit) {
        sameDay(EVENT.primaryExit, causes(education.lastFactId));
      }
      if (education.enrolledIn === 'secondary' && age === educationAge.secondaryExit) {
        sameDay(EVENT.secondaryExit, causes(education.lastFactId));
      }
      if (education.enrolledIn === 'tertiary' && age === educationAge.tertiaryExit) {
        sameDay(EVENT.tertiaryExit, causes(education.lastFactId));
      }

      const { status } = employment;
      if (age >= rules.retirementAge) {
        if (status !== 'retired' && status !== 'student') {
          sameDay(EVENT.retirement, causes(employment.lastFactId));
        }
      } else if (age >= rules.minimumWorkingAge) {
        if (status === 'employed') sameDay(EVENT.jobReview, causes(employment.lastFactId));
        else if (status !== 'student') {
          sameDay(EVENT.jobSearch, causes(employment.lastFactId ?? education.lastFactId));
        }
      }

      sameDay(EVENT.healthCheck);
      ctx.schedule({
        type: EVENT.birthday,
        at: addYears(actor.birthDate, age + 1),
        entityId: actor.id,
        period: `age:${age + 1}`,
      });
    },
  };

  const death: EventDefinition = {
    type: EVENT.death,
    version: 1,
    priority: PRIORITY.death,
    handle(ctx) {
      const actor = ctx.actor(ctx.occurrence.entityId);
      const { cause } = DeathPayloadSchema.parse(ctx.occurrence.payload);
      const age = ageAt(actor, ctx);
      // 主角沿用 life.death；NPC 的类型与模板都用 npc.death 并写明是谁（关系称谓）。
      // 与其他 NPC 事实一致：类型前缀 life.* 只属于主角，下游按类型统计时不会把父母的死亡算成主角的。
      const npc = actor.tier !== 'protagonist';
      const type = npc ? npcFactType('life.death') : 'life.death';
      const factId = ctx.emit({
        type,
        outcomeCode: cause,
        templateId: type,
        actorIds: [actor.id],
        evidenceIds: [evidenceId(region, 'mortality')],
        details: npc ? { age, cause, role: npcRoleOf(actor.id) } : { age, cause },
      });
      actor.vitalStatus = { kind: 'deceased', deathDate: ctx.at, deathFactId: factId };
      // 去世后不再共同居住；亲子关系本身不因死亡解除（until 保持 null）。
      for (const relationship of ctx.state.relationships) {
        if (relationship.fromId === actor.id || relationship.toId === actor.id) {
          relationship.coResident = false;
        }
      }
    },
  };

  return [birth, birthday, death];
}
