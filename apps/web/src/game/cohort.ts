import type { BirthContext, CountryPack } from '@lifesim/country-packs';
import type { BirthRegionId, EducationLevel, ISODate } from '@lifesim/content-schema';
import { createRealLifeSimulation, type RealLifeRequest } from '@lifesim/real-world';
import { ageOn, type Simulation } from '@lifesim/simulation-core';

/**
 * 同一秒出生的四个人（M4-020）：与玩家同一天出生、按出生年五地出生人数加权抽出的另外四个人，
 * 用同一个引擎按人生原则自动生活，只推进到玩家的权威时钟。
 *
 * 完全隔离：种子由玩家种子确定性派生（`<seed>#cohort-<index>`），不复用玩家的 `Simulation`、
 * 不读玩家的事实、不写存档、不进时间线。读档后按种子重算到当前时钟即可，结果逐字节相同。
 */

export const COHORT_SIZE = 4;

/** 与 GameSession 相同的推进约定：单轮工作上限与最大轮数。 */
const MAX_WORK_PER_ROUND = 100_000;
const MAX_ROUNDS = 10_000;

export interface CohortRequestInput {
  /** 玩家种子。 */
  seed: string;
  /** 玩家出生日期。 */
  birthDate: ISODate;
}

/** 第 index 人（1..4）的请求：种子派生、地区随机、年份与出生日期与玩家相同。 */
export function cohortRequest(input: CohortRequestInput, index: number): RealLifeRequest {
  if (!Number.isInteger(index) || index < 1 || index > COHORT_SIZE) {
    throw new RangeError('Cohort index must be an integer between 1 and ' + COHORT_SIZE);
  }
  return {
    seed: `${input.seed}#cohort-${index}`,
    region: 'random',
    year: Number(input.birthDate.slice(0, 4)),
    birthDate: input.birthDate,
  };
}

/**
 * 把一局推进到 targetDate；途中不再停下来等决定（内核对未作决定的决策按人生原则结算）。
 * 目标早于成员当前时钟或成员已去世时不调用内核（内核会拒绝日期回退）。
 */
export function advanceCohortSimulation(sim: Simulation, targetDate: ISODate): void {
  if (sim.ended) return;
  // ISODate 是零填充的 `YYYY-MM-DD`，字典序即时间序。
  if (targetDate < sim.clock) return;
  for (let round = 0; round < MAX_ROUNDS; round += 1) {
    const result = sim.advanceTo({
      targetDate,
      stopAtMajorDecision: false,
      maxWorkUnits: MAX_WORK_PER_ROUND,
    });
    if (result.stopReason === 'work-budget-exhausted') continue;
    return;
  }
  throw new Error('Cohort life did not reach a stable stop');
}

export interface CohortMember {
  /** 1..4 */
  readonly index: number;
  readonly seed: string;
  readonly birth: BirthContext;
  readonly pack: CountryPack;
  readonly simulation: Simulation;
}

/** 面板展示需要的派生字段；纯函数，不重新模拟。 */
export interface CohortView {
  index: number;
  /** 与玩家同龄口径：ageOn(birth.birthDate, min(memberClock, playerClock))。 */
  age: number;
  alive: boolean;
  /** 当时居住地。 */
  placeId: string;
  polityId: string;
  packId: BirthRegionId;
  education: EducationLevel;
  /** EMPLOYMENT_STATUSES 之一。 */
  employment: string;
  chronicConditions: number;
  sameCountryAsPlayer: boolean;
}

/** 四个人的一局；每个人是自己的 `Simulation` 实例，与玩家的会话完全分开。 */
export class Cohort {
  readonly members: readonly CohortMember[];

  constructor(input: CohortRequestInput) {
    const members: CohortMember[] = [];
    for (let index = 1; index <= COHORT_SIZE; index += 1) {
      const request = cohortRequest(input, index);
      const base = createRealLifeSimulation(request);
      members.push({
        index,
        seed: request.seed,
        birth: base.birth,
        pack: base.pack,
        simulation: base.simulation,
      });
    }
    this.members = members;
  }

  /** 推进到玩家的权威时钟；已到达或玩家时钟后退时为幂等空操作。 */
  advanceTo(clock: ISODate): void {
    for (const member of this.members) advanceCohortSimulation(member.simulation, clock);
  }

  /** 每个成员当前的时钟（≤ 传入的 clock）。 */
  clocks(): readonly ISODate[] {
    return this.members.map((member) => member.simulation.clock);
  }
}

export function describeCohortMember(
  member: CohortMember,
  playerClock: ISODate,
  playerPackId?: BirthRegionId,
): CohortView {
  const snapshot = member.simulation.snapshot();
  const actor = snapshot.actors.find((candidate) => candidate.id === snapshot.activeCharacterId);
  if (!actor) throw new Error('Cohort member has no active character');
  const memberClock = member.simulation.clock;
  const at = memberClock < playerClock ? memberClock : playerClock;
  return {
    index: member.index,
    age: Math.max(0, ageOn(member.birth.birthDate, at)),
    alive: actor.vitalStatus.kind === 'alive',
    placeId: actor.currentResidenceId,
    polityId: actor.politicalEntityId,
    packId: member.birth.packId,
    education: actor.education.completed,
    employment: actor.employment.status,
    chronicConditions: actor.health.conditions.length,
    sameCountryAsPlayer: playerPackId === undefined ? false : member.birth.packId === playerPackId,
  };
}
