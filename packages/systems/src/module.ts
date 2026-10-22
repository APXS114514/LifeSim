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
import { LIFE_EVENT_CATALOG } from './life-events-catalog.ts';
import { lifeEventDefinitions, type LifeEventPrototype } from './life-events.ts';
import { npcEvents } from './npc.ts';
import { yearlyFocusEvents } from './yearly-focus.ts';
import { MacroStateSchema, type MacroState, type RegionModel } from './region.ts';
import { EVENT, PROTAGONIST_ID, SYSTEMS_VERSION } from './shared.ts';

/** 跨系统的状态不变量：每个事件提交前都会检查（GDD §7：不能出现未成年人退休等矛盾）。 */
export function lifeInvariants(region: RegionModel): Invariant[] {
  const { rules } = region;
  /**
   * 宏观状态按引用缓存：内核保证提交后的状态不再就地修改，所以同一份 `world` 对象的取值与合法性
   * 只取决于它自己，解析一次就够（一局人生里宏观状态只在历史锚点处改变）。
   * 缓存随本模块实例存活，不跨局共享。
   */
  const macroCache = new WeakMap<object, MacroState | null>();
  const readMacroOnce = (world: unknown): MacroState | null => {
    if (typeof world !== 'object' || world === null) return null;
    const cached = macroCache.get(world);
    if (cached !== undefined) return cached;
    const parsed = MacroStateSchema.safeParse(world);
    const macro = parsed.success ? parsed.data : null;
    macroCache.set(world, macro);
    return macro;
  };
  return [
    {
      id: 'life.age-appropriate-status',
      check(state, at) {
        const problems: string[] = [];
        // 入学年龄按该年的制度取（M3-012b）：不同国家与年代的学制不同。
        const primaryStartAge = region.queries.education.systemAt(yearOf(at)).primaryStartAge;
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
          if (status === 'student' && age < primaryStartAge) {
            problems.push(`${actor.id} is a student at ${age}`);
          }
        }
        return problems;
      },
    },
    {
      id: 'life.currency-version',
      check(state) {
        const macro = readMacroOnce(state.world);
        if (macro === null) return state.actors.length > 0 ? ['world macro state is invalid'] : [];
        // 逐条判断、不带 filter/map 的中间数组：本不变量每个事件都跑。
        const problems: string[] = [];
        for (const account of state.householdAccounts) {
          if (!sameCurrency(account.currency, macro.currency)) {
            problems.push(`${account.id} still holds an outdated currency version`);
          }
        }
        return problems;
      },
    },
    {
      id: 'life.account-link',
      check(state) {
        const problems: string[] = [];
        for (const actor of state.actors) {
          const accountId = actor.finance.accountId;
          if (accountId === null) continue;
          let found = false;
          for (const account of state.householdAccounts) {
            if (account.id === accountId) {
              found = true;
              break;
            }
          }
          if (!found) problems.push(`${actor.id} points to a missing account`);
        }
        return problems;
      },
    },
    {
      id: 'life.deceased-no-new-activity',
      check(state, at) {
        const problems: string[] = [];
        let anyoneDeceased = false;
        for (const actor of state.actors) {
          if (actor.vitalStatus.kind !== 'deceased') continue;
          anyoneDeceased = true;
          if (actor.vitalStatus.deathDate > at) {
            problems.push(`${actor.id} has a death date after ${at}`);
          }
        }
        if (!anyoneDeceased) return problems;
        // 去世后不再共同居住：死亡事件必须把它参与的关系置为 coResident=false（关系本身不解除）。
        // 角色只有几个，逐个比对就够，不必为每个事件建一个集合。
        for (const relationship of state.relationships) {
          if (!relationship.coResident) continue;
          for (const actorId of [relationship.fromId, relationship.toId]) {
            for (const actor of state.actors) {
              if (actor.id !== actorId || actor.vitalStatus.kind !== 'deceased') continue;
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
        const problems: string[] = [];
        for (const relationship of state.relationships) {
          let fromFound = false;
          let toFound = false;
          for (const actor of state.actors) {
            if (actor.id === relationship.fromId) fromFound = true;
            if (actor.id === relationship.toId) toFound = true;
            if (fromFound && toFound) break;
          }
          if (!fromFound || !toFound) {
            problems.push(`${relationship.id} references a missing actor`);
          }
        }
        return problems;
      },
    },
  ];
}

export interface LifeModuleOptions {
  /** 只供测试注入通用人生事件目录（M3-042）；`createLifeSimulation` 不暴露它。 */
  lifeEventCatalog?: readonly LifeEventPrototype[];
}

export function lifeModule(region: RegionModel, options: LifeModuleOptions = {}): SimulationModule {
  const catalog = options.lifeEventCatalog ?? LIFE_EVENT_CATALOG;
  return {
    id: 'life',
    events: [
      ...lifeEvents(region, catalog),
      ...yearlyFocusEvents(region),
      ...identityEvents(region),
      ...historyEvents(region),
      ...npcEvents(region),
      ...educationEvents(region),
      ...careerEvents(region),
      ...financeEvents(region),
      ...healthEvents(region),
      ...lifeEventDefinitions(region, catalog),
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
