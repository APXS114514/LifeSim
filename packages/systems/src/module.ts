import {
  isSelectableBirthYear,
  sameCurrency,
  type ISODate,
  type LifePrinciples,
  type SimulationSnapshot,
  type CharacterSex,
} from '@lifesim/content-schema';
import {
  Simulation,
  ageOn,
  yearOf,
  type Invariant,
  type SimulationModule,
} from '@lifesim/simulation-core';
import { careerEvents } from './career.ts';
import { educationEvents } from './education.ts';
import { financeEvents } from './finance.ts';
import { healthEvents } from './health.ts';
import { historyEvents } from './history.ts';
import { identityEvents } from './identity.ts';
import { lifeEvents } from './life.ts';
import { npcEvents } from './npc.ts';
import { yearlyFocusEvents } from './yearly-focus.ts';
import { MacroStateSchema, type RegionModel } from './region.ts';
import { EVENT, PROTAGONIST_ID, SYSTEMS_VERSION } from './shared.ts';

/** 跨系统的状态不变量：每个事件提交前都会检查（GDD §7：不能出现未成年人退休等矛盾）。 */
export function lifeInvariants(region: RegionModel): Invariant[] {
  const { rules } = region;
  return [
    {
      id: 'life.age-appropriate-status',
      check(state, at) {
        const problems: string[] = [];
        for (const actor of state.actors) {
          if (actor.vitalStatus.kind === 'deceased') continue;
          const age = ageOn(actor.birthDate, at);
          const { status } = actor.employment;
          if (status === 'employed' && age < rules.minimumWorkingAge) {
            problems.push(`${actor.id} is employed at ${age}`);
          }
          if (status === 'retired' && age < rules.retirementAge) {
            problems.push(`${actor.id} is retired at ${age}`);
          }
          if (status === 'student' && age < rules.primaryStartAge) {
            problems.push(`${actor.id} is a student at ${age}`);
          }
        }
        return problems;
      },
    },
    {
      id: 'life.currency-version',
      check(state) {
        const parsed = MacroStateSchema.safeParse(state.world);
        if (!parsed.success) return state.actors.length > 0 ? ['world macro state is invalid'] : [];
        return state.householdAccounts
          .filter((account) => !sameCurrency(account.currency, parsed.data.currency))
          .map((account) => `${account.id} still holds an outdated currency version`);
      },
    },
    {
      id: 'life.account-link',
      check(state) {
        const ids = new Set(state.householdAccounts.map((account) => account.id));
        return state.actors
          .filter((actor) => actor.finance.accountId !== null && !ids.has(actor.finance.accountId))
          .map((actor) => `${actor.id} points to a missing account`);
      },
    },
    {
      id: 'life.deceased-no-new-activity',
      check(state, at) {
        const problems: string[] = [];
        const deceased = new Set(
          state.actors
            .filter((actor) => actor.vitalStatus.kind === 'deceased')
            .map((actor) => actor.id),
        );
        if (deceased.size === 0) return problems;
        for (const actor of state.actors) {
          if (actor.vitalStatus.kind !== 'deceased') continue;
          if (actor.vitalStatus.deathDate > at) {
            problems.push(`${actor.id} has a death date after ${at}`);
          }
        }
        // 去世后不再共同居住：死亡事件必须把它参与的关系置为 coResident=false（关系本身不解除）。
        for (const relationship of state.relationships) {
          if (!relationship.coResident) continue;
          for (const actorId of [relationship.fromId, relationship.toId]) {
            if (deceased.has(actorId)) {
              problems.push(`${relationship.id} still lists deceased ${actorId} as co-resident`);
            }
          }
        }
        return problems;
      },
    },
    {
      id: 'life.relationship-actors',
      check(state) {
        const ids = new Set(state.actors.map((actor) => actor.id));
        return state.relationships
          .filter((relationship) => !ids.has(relationship.fromId) || !ids.has(relationship.toId))
          .map((relationship) => `${relationship.id} references a missing actor`);
      },
    },
  ];
}

export function lifeModule(region: RegionModel): SimulationModule {
  return {
    id: 'life',
    events: [
      ...lifeEvents(region),
      ...yearlyFocusEvents(region),
      ...identityEvents(region),
      ...historyEvents(region),
      ...npcEvents(region),
      ...educationEvents(region),
      ...careerEvents(region),
      ...financeEvents(region),
      ...healthEvents(region),
    ],
    invariants: lifeInvariants(region),
  };
}

export function dataPackVersions(region: RegionModel): Record<string, string> {
  return { [region.packId]: region.dataVersion, systems: SYSTEMS_VERSION };
}

export interface CreateLifeOptions {
  seed: string;
  region: RegionModel;
  /** 1950—2026 年之间（GDD §2 决定 05）。 */
  birthDate: ISODate;
  settlement?: 'urban' | 'rural';
  sex?: CharacterSex;
  principles?: LifePrinciples;
  /** 预先给出的玩家选择（决策事件幂等键 → 选项）。 */
  decisions?: Readonly<Record<string, string>>;
}

export function createLifeSimulation(options: CreateLifeOptions): Simulation {
  if (!isSelectableBirthYear(yearOf(options.birthDate))) {
    throw new RangeError(`Birth year must be between 1950 and 2026: ${options.birthDate}`);
  }
  return Simulation.create({
    seed: options.seed,
    modules: [lifeModule(options.region)],
    genesis: {
      type: EVENT.birth,
      at: options.birthDate,
      entityId: PROTAGONIST_ID,
      payload: {
        settlement: options.settlement ?? null,
        sex: options.sex ?? null,
        principles: options.principles ?? null,
      },
    },
    activeCharacterId: PROTAGONIST_ID,
    dataPackVersions: dataPackVersions(options.region),
    ...(options.decisions ? { decisions: options.decisions } : {}),
  });
}

export function restoreLifeSimulation(
  snapshot: SimulationSnapshot,
  region: RegionModel,
): Simulation {
  return Simulation.restore(snapshot, {
    modules: [lifeModule(region)],
    dataPackVersions: dataPackVersions(region),
  });
}

/** 某个年龄的「中学毕业后」决定的幂等键，便于预先给出玩家选择。 */
export function afterSecondaryDecisionKey(age = 18): string {
  return `${EVENT.afterSecondary}|${PROTAGONIST_ID}|age:${age}`;
}
