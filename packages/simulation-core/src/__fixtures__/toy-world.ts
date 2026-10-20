import type { CharacterState, ISODate } from '@lifesim/content-schema';
import { addDays, addYears } from '../calendar.ts';
import { Simulation, type CreateSimulationOptions } from '../engine.ts';
import type { EventDefinition, SimulationModule } from '../types.ts';

/**
 * 只用于内核测试的极简世界：每年生日抽一次随机数，按年龄递增的概率死亡，
 * 18 岁时有一个重大决定。另有「陷阱」事件，用来验证内核对错误规则的处理。
 */
export const TOY_ACTOR = 'char:toy';

export type TrapKind =
  'throw' | 'cycle' | 'chain' | 'past' | 'bad-cause' | 'invalid-state' | 'invariant';

export interface ToyWorldOptions {
  trap?: { age: number; kind: TrapKind };
}

export function makeActor(id: string, birthDate: ISODate): CharacterState {
  return {
    id,
    tier: 'protagonist',
    birthDate,
    birthPlaceId: 'place:toy',
    currentResidenceId: 'place:toy',
    politicalEntityId: 'polity:toy',
    citizenshipIds: ['polity:toy'],
    vitalStatus: { kind: 'alive' },
    lifePrinciples: {
      family: 0.5,
      wealth: 0.2,
      health: 0.5,
      knowledge: 0.9,
      risk: 0.5,
      stability: 0.5,
    },
    origin: { settlement: 'urban', familyResources: 'middle' },
    traits: { aptitude: 0.5 },
    education: { completed: 'none', enrolledIn: null, lastFactId: null },
    employment: { status: 'child', wageLevel: null, lastFactId: null },
    health: { conditions: [] },
    finance: { accountId: null, lastSettlementFactId: null },
  };
}

function ageOf(period: string): number {
  return Number(period.slice('age:'.length));
}

export function toyModules(options: ToyWorldOptions = {}): SimulationModule[] {
  const birth: EventDefinition = {
    type: 'toy.birth',
    version: 1,
    priority: 0,
    handle(ctx) {
      ctx.state.actors.push(makeActor(TOY_ACTOR, ctx.at));
      const born = ctx.emit({ type: 'toy.born', outcomeCode: 'born', actorIds: [TOY_ACTOR] });
      ctx.schedule({
        type: 'toy.birthday',
        at: addYears(ctx.at, 1),
        entityId: TOY_ACTOR,
        period: 'age:1',
        causes: [born],
      });
    },
  };

  const birthday: EventDefinition = {
    type: 'toy.birthday',
    version: 1,
    priority: 10,
    handle(ctx) {
      const age = ageOf(ctx.occurrence.period);
      const draw = Math.round(ctx.random.next() * 1e6);
      const fact = ctx.emit({
        type: 'toy.birthday',
        outcomeCode: 'aged',
        actorIds: [TOY_ACTOR],
        details: { age, draw },
      });
      if (ctx.random.chance(0.02 + age * 0.004)) {
        ctx.schedule({
          type: 'toy.death',
          at: addDays(ctx.at, 1 + ctx.random.int(363)),
          entityId: TOY_ACTOR,
          period: 'death',
          causes: [fact],
        });
      }
      if (age === 18) {
        ctx.schedule({
          type: 'toy.career',
          at: ctx.at,
          entityId: TOY_ACTOR,
          period: 'career',
          causes: [fact],
        });
      }
      if (options.trap?.age === age) {
        ctx.schedule({
          type: 'toy.trap',
          at: ctx.at,
          entityId: TOY_ACTOR,
          period: 'trap',
          payload: options.trap.kind,
        });
      }
      ctx.schedule({
        type: 'toy.birthday',
        at: addYears(ctx.at, 1),
        entityId: TOY_ACTOR,
        period: `age:${age + 1}`,
        causes: [fact],
      });
    },
  };

  const death: EventDefinition = {
    type: 'toy.death',
    version: 1,
    priority: 0,
    handle(ctx) {
      const factId = ctx.emit({ type: 'toy.died', outcomeCode: 'died', actorIds: [TOY_ACTOR] });
      ctx.actor(TOY_ACTOR).vitalStatus = {
        kind: 'deceased',
        deathDate: ctx.at,
        deathFactId: factId,
      };
    },
  };

  const career: EventDefinition = {
    type: 'toy.career',
    version: 1,
    priority: 20,
    decision: {
      major: true,
      actorId: () => TOY_ACTOR,
      options: () => [
        { id: 'study', eligible: true, scores: { knowledge: 1, wealth: -0.2 } },
        { id: 'work', eligible: true, scores: { wealth: 1, stability: 0.3 } },
        { id: 'emigrate', eligible: false, ineligibleReason: 'not-available', scores: { risk: 1 } },
      ],
    },
    handle(ctx) {
      ctx.emit({
        type: 'toy.career',
        outcomeCode: ctx.choice?.optionId ?? 'none',
        actorIds: [TOY_ACTOR],
        causes: ctx.choice ? [ctx.choice.factId] : [],
      });
    },
  };

  const chain: EventDefinition = {
    type: 'toy.chain',
    version: 1,
    priority: 30,
    handle(ctx) {
      const step = Number(ctx.occurrence.period.slice('step:'.length)) + 1;
      ctx.schedule({ type: 'toy.chain', at: ctx.at, entityId: TOY_ACTOR, period: `step:${step}` });
    },
  };

  const trap: EventDefinition = {
    type: 'toy.trap',
    version: 1,
    priority: 40,
    handle(ctx) {
      const actor = ctx.actor(TOY_ACTOR);
      switch (ctx.occurrence.payload) {
        case 'throw':
          actor.currentResidenceId = 'place:mutated-before-failure';
          throw new Error('trap sprung');
        case 'cycle':
          ctx.schedule({ type: 'toy.trap', at: ctx.at, entityId: TOY_ACTOR, period: 'trap' });
          return;
        case 'chain':
          ctx.schedule({ type: 'toy.chain', at: ctx.at, entityId: TOY_ACTOR, period: 'step:0' });
          return;
        case 'past':
          ctx.schedule({
            type: 'toy.chain',
            at: addDays(ctx.at, -1),
            entityId: TOY_ACTOR,
            period: 'step:0',
          });
          return;
        case 'bad-cause':
          ctx.emit({
            type: 'toy.bad',
            outcomeCode: 'bad',
            actorIds: [TOY_ACTOR],
            causes: ['fact:999999'],
          });
          return;
        case 'invalid-state':
          actor.education = { completed: 'none', enrolledIn: 'tertiary', lastFactId: null };
          return;
        case 'invariant':
          actor.currentResidenceId = 'nowhere';
          return;
        default:
          return;
      }
    },
  };

  return [
    {
      id: 'toy',
      events: [birth, birthday, death, career, chain, trap],
      invariants: [
        {
          id: 'toy.residence-is-a-place',
          check: (state) =>
            state.actors
              .filter((actor) => !actor.currentResidenceId.startsWith('place:'))
              .map((actor) => `${actor.id} lives at ${actor.currentResidenceId}`),
        },
      ],
    },
  ];
}

export function createToySimulation(
  seed: string,
  options: ToyWorldOptions & Partial<Pick<CreateSimulationOptions, 'decisions' | 'limits'>> = {},
): Simulation {
  return Simulation.create({
    seed,
    modules: toyModules(options),
    genesis: { type: 'toy.birth', at: '1970-06-15', entityId: TOY_ACTOR, payload: null },
    activeCharacterId: TOY_ACTOR,
    dataPackVersions: { TOY: '1' },
    ...(options.decisions ? { decisions: options.decisions } : {}),
    ...(options.limits ? { limits: options.limits } : {}),
  });
}

export const FAR_FUTURE = '2200-01-01';
