import {
  RelationshipsSchema,
  checkJournalInvariants,
  type EvidenceMeta,
  type SimEventFact,
} from '@lifesim/content-schema';
import {
  addYears,
  canonicalJson,
  type EventContext,
  type Simulation,
} from '@lifesim/simulation-core';
import { describe, expect, it } from 'vitest';
import { createLifeSimulation, restoreLifeSimulation } from './module.ts';
import { npcBirthdayRequest, npcEvents, npcFactType, npcRoleOf, promoteToTier1 } from './npc.ts';
import type { EducationSystem, RegionModel } from './region.ts';

/** 夹具的 D 级学制（虚构）：数值与 `rules` 的学制常数一致。 */
const FIXTURE_EDUCATION: EducationSystem = {
  primaryStartAge: 6,
  primaryYears: 6,
  secondaryYears: 6,
  tertiaryYears: 4,
  compulsoryYears: 0,
  entranceExam: { kind: 'none' },
  feeShare: 0,
  grade: 'D',
  sourceIds: ['fixture:m3-011'],
};
import { EVENT } from './shared.ts';

const FOREVER = { targetDate: '2200-01-01', stopAtMajorDecision: false, maxWorkUnits: 1_000_000 };
const BIRTH = '1970-05-04';

const METADATA: EvidenceMeta = {
  grade: 'D',
  sourceIds: ['fixture:m3-011'],
  modelVersion: 'fixture-1',
  geographyId: 'polity:fixture',
  yearRange: [1950, 2200],
  methodId: 'fixture',
};

/**
 * 测试夹具（虚构数据，不是任何国家的数据）：一个最小的地区模型，
 * 只负责让 NPC 生命周期在本包内可测（不依赖 @lifesim/synthetic-world 的依赖方向）。
 * 数值是随意取的单调曲线，仅用于产生发病、失业、退休与死亡。
 */
const FIXTURE_REGION: RegionModel = {
  packId: 'ZZ-FIX',
  sexRatioAtBirth: () => 100,
  names: { scheme: 'zh', select: () => null, patronymic: () => null },
  dataVersion: 'fixture-1',
  polityId: 'polity:fixture',
  evidence: {
    population: METADATA,
    mortality: METADATA,
    illness: METADATA,
    education: METADATA,
    labor: METADATA,
    prices: METADATA,
    history: METADATA,
  },
  anchors: [],
  initialMacro: { economyPhase: 'normal', currency: { code: 'FIX', version: 1 } },
  rules: {
    primaryStartAge: 6,
    primaryYears: 6,
    secondaryYears: 6,
    tertiaryYears: 4,
    minimumWorkingAge: 15,
    retirementAge: 60,
    pensionRate: 0.5,
    treatmentAvailableFrom: 1965,
    treatmentAnnualCostShare: 0.2,
  },
  effects: {
    illnessHiringFactor: 0.6,
    illnessJobLossFactor: 2,
    povertyIllnessFactor: 1.5,
    mortality: {
      untreatedIllness: 2.5,
      treatedIllness: 1.4,
      poverty: 1.3,
      tertiaryEducation: 0.85,
    },
  },
  tables: {
    value: () => null,
    ageValue: () => null,
    evidenceFor: () => METADATA,
  },
  queries: {
    education: {
      secondaryEnrollmentRate: () => null,
      upperSecondaryCompletionRate: () => null,
      systemAt: () => FIXTURE_EDUCATION,
    },
    labor: { participationRate: () => null, agricultureShare: () => null },
    prices: { cpi: () => null, toRealMinor: (nominalMinor) => nominalMinor },
    health: { outOfPocketShare: () => null, expenditurePerCapitaUsd: () => null },
  },
  placeId: (settlement) => `place:fixture-${settlement}`,
  urbanBirthShare: () => 0.5,
  familyResourcesWeights: () => [['middle', 1]],
  mortalityQ: (_year, age) => {
    if (age >= 95) return 1;
    if (age >= 85) return 0.3;
    if (age >= 75) return 0.12;
    if (age >= 60) return 0.04;
    if (age >= 40) return 0.01;
    return 0.002;
  },
  illnessOnsetP: (_year, age) => (age < 30 ? 0 : 0.02),
  primaryEnrollmentP: () => 0.9,
  secondaryContinuationP: () => 0.6,
  universityAdmissionP: () => 0.3,
  hiringP: () => 0.7,
  jobLossP: () => 0.05,
  annualWageMinor: () => 100_000,
  annualLivingCostMinor: () => 50_000,
  treatmentCostMinor: () => 10_000,
};

function wholeLife(seed: string): Simulation {
  const simulation = createLifeSimulation({ seed, region: FIXTURE_REGION, birthDate: BIRTH });
  simulation.advanceTo(FOREVER);
  return simulation;
}

const MOTHER = 'char:protagonist:mother';
const FATHER = 'char:protagonist:father';

/** 以某角色为唯一 actor 的事实（NPC 事实的唯一 actor 就是 NPC 本人）。 */
function factsOf(facts: readonly SimEventFact[], actorId: string): SimEventFact[] {
  return facts.filter((fact) => fact.actorIds.length === 1 && fact.actorIds[0] === actorId);
}

describe('NPC identity helpers (M3-011)', () => {
  it('names NPCs by relation instead of by given name', () => {
    expect(npcRoleOf(MOTHER)).toBe('mother');
    expect(npcRoleOf(FATHER)).toBe('father');
    // 没有称谓信息的 Tier1（例如日后被提升的 Tier2）用中性称谓。
    expect(npcRoleOf('char:protagonist:spouse')).toBe('relative');
    expect(npcRoleOf('char:protagonist')).toBe('relative');
  });

  it('derives npc.* fact types from the shared rule names', () => {
    expect(npcFactType('career.hired')).toBe('npc.hired');
    expect(npcFactType('health.illness-onset')).toBe('npc.illness-onset');
    expect(npcFactType('life.death')).toBe('npc.death');
  });
});

describe('npc.birthday scheduling', () => {
  const actor = (birthDate: string) =>
    ({
      id: 'char:x:mother',
      birthDate,
    }) as never;

  it('schedules the next birthday strictly after the given date', () => {
    expect(npcBirthdayRequest(actor('1940-05-04'), '1970-05-04')).toEqual({
      type: EVENT.npcBirthday,
      at: '1971-05-04',
      entityId: 'char:x:mother',
      period: 'age:31',
    });
    // 从生日当天的中间日期出发，仍然是下一个生日。
    expect(npcBirthdayRequest(actor('1940-05-04'), '1970-12-31')).toEqual({
      type: EVENT.npcBirthday,
      at: '1971-05-04',
      entityId: 'char:x:mother',
      period: 'age:31',
    });
  });
});

describe('NPC 的入学年龄按逐年学制推导（M3-012c）', () => {
  /** 朝鲜式改革：1972 年起入学年龄从 7 岁降到 6 岁（虚构夹具里的学制）。 */
  const BEFORE_REFORM: EducationSystem = {
    ...FIXTURE_EDUCATION,
    primaryStartAge: 7,
    primaryYears: 4,
    secondaryYears: 3,
    tertiaryYears: 5,
  };
  const AFTER_REFORM: EducationSystem = { ...BEFORE_REFORM, primaryStartAge: 6 };
  const region: RegionModel = {
    ...FIXTURE_REGION,
    queries: {
      ...FIXTURE_REGION.queries,
      education: {
        ...FIXTURE_REGION.queries.education,
        systemAt: (year) => (year >= 1972 ? AFTER_REFORM : BEFORE_REFORM),
      },
    },
  };

  function childAt(birthDate: string) {
    return {
      id: 'char:protagonist:child',
      tier: 'tier1',
      sex: 'female',
      name: { scheme: 'zh', family: null, given: null, patronymic: null },
      wellbeing: { stress: 0.3 },
      social: { ties: 0.5 },
      skills: [],
      birthDate,
      birthPlaceId: 'place:fixture-urban',
      currentResidenceId: 'place:fixture-urban',
      politicalEntityId: 'polity:fixture',
      citizenshipIds: ['polity:fixture'],
      vitalStatus: { kind: 'alive' },
      lifePrinciples: {
        family: 0.5,
        wealth: 0.5,
        health: 0.5,
        knowledge: 0.5,
        risk: 0.5,
        stability: 0.5,
      },
      origin: { settlement: 'urban', familyResources: 'middle' },
      traits: { aptitude: 0.5 },
      education: { completed: 'none', enrolledIn: null, lastFactId: null },
      employment: { status: 'child', wageLevel: null, lastFactId: null },
      health: { conditions: [] },
      finance: { accountId: 'acct:fixture-child', lastSettlementFactId: null },
    } as const;
  }

  /** 只跑 NPC 生日处理器，记录它排了哪些事件；随机流固定为「不发生疾病与死亡」。 */
  function scheduledOnBirthday(at: string, age: number): readonly string[] {
    const child = childAt('1965-07-31');
    const state = {
      actors: [child],
      householdAccounts: [
        {
          id: 'acct:fixture-child',
          ownerIds: [child.id],
          currency: { code: 'FIX', version: 1 },
          balanceMinor: 0,
        },
      ],
      relationships: [],
    };
    const scheduled: { type: string; at: string; period: string }[] = [];
    const ctx = {
      at,
      occurrence: {
        type: EVENT.npcBirthday,
        entityId: child.id,
        period: `age:${age}`,
        causeFactIds: [],
        payload: null,
      },
      state,
      random: { chance: () => false, int: () => 0, next: () => 0, weighted: () => 'middle' },
      choice: null,
      actor: (id: string) => {
        if (id !== child.id) throw new Error('Unknown actor ' + id);
        return child;
      },
      emit: () => 'fact:fixture',
      schedule: (request: { type: string; at: string; period: string }) => {
        scheduled.push(request);
        return request;
      },
    } as unknown as EventContext;
    const birthday = npcEvents(region).find((definition) => definition.type === EVENT.npcBirthday);
    if (!birthday) throw new Error('missing npc.birthday');
    birthday.handle(ctx);
    return scheduled
      .filter((request) => request.type === EVENT.primaryEntry)
      .map((request) => `${request.at}#${request.period}`);
  }

  it('学制改革那年按推导出的入学年龄排入学，不会漏掉整届学生', () => {
    // 1965-07-31 出生：6 岁那年（1971）学制仍要求 7 岁，7 岁那年（1972）起改为 6 岁。
    expect(scheduledOnBirthday('1971-07-31', 6)).toEqual([]);
    expect(scheduledOnBirthday('1972-07-31', 7)).toEqual(['1972-07-31#age:7']);
  });

  it('已经过了推导出的入学年龄就不再补排（成年父母不会被当成学龄儿童）', () => {
    expect(scheduledOnBirthday('1973-07-31', 8)).toEqual([]);
  });
});

describe('promoteToTier1', () => {
  function stateWithTier2(): { actors: Record<string, unknown>[] } {
    return {
      actors: [
        {
          id: 'char:protagonist',
          tier: 'protagonist',
          birthDate: '1970-05-04',
          traits: { aptitude: 0.5 },
        },
        {
          id: 'char:friend',
          tier: 'tier2',
          birthDate: '1968-02-02',
          traits: { aptitude: 0.25 },
        },
      ],
    };
  }

  it('only changes the tier and re-draws nothing', () => {
    const state = stateWithTier2();
    const before = JSON.parse(JSON.stringify(state.actors[1])) as Record<string, unknown>;
    const promoted = promoteToTier1(state as never, 'char:friend');
    expect(promoted.tier).toBe('tier1');
    expect({ ...promoted, tier: 'tier2' }).toEqual(before);
    expect(state.actors[0]?.tier).toBe('protagonist');
  });

  it('rejects unknown actors and the active character', () => {
    const state = stateWithTier2();
    expect(() => promoteToTier1(state as never, 'char:nobody')).toThrow('Unknown actor');
    expect(() => promoteToTier1(state as never, 'char:protagonist')).toThrow('active character');
  });
});

describe('a Tier1 NPC lives its own life (M3-011)', () => {
  it('produces npc.* facts with the relation in details and stops at death', () => {
    const simulation = wholeLife('npc-fixture-1');
    const facts = simulation.facts;
    const snapshot = simulation.snapshot();
    expect(checkJournalInvariants(facts, { complete: true })).toEqual([]);

    // 每个事实的 actor 都必须指向存在的角色。
    const ids = new Set(snapshot.actors.map((entry) => entry.id));
    for (const fact of facts) {
      for (const actorId of fact.actorIds) expect(ids.has(actorId)).toBe(true);
    }

    const npcFacts = facts.filter((fact) => fact.type.startsWith('npc.'));
    expect(npcFacts.length).toBeGreaterThan(0);
    for (const fact of npcFacts) {
      expect(fact.templateId.startsWith('npc.')).toBe(true);
      expect(['mother', 'father', 'relative']).toContain(fact.details?.['role']);
    }

    // 父母各自有死亡事实；死亡之后不再有任何以他/她为 actor 的事实。
    for (const parentId of [MOTHER, FATHER]) {
      const own = factsOf(facts, parentId);
      const death = own.find((fact) => fact.type === 'npc.death');
      expect(death).toBeDefined();
      expect(death?.templateId).toBe('npc.death');
      const after = own.filter((fact) => death && fact.at > death.at);
      expect(after).toEqual([]);
    }
  });

  it('marks a deceased NPC as no longer co-resident and keeps the relationship valid', () => {
    const simulation = wholeLife('npc-fixture-1');
    const snapshot = simulation.snapshot();
    const dead = snapshot.actors
      .filter((actor) => actor.vitalStatus.kind === 'deceased')
      .map((actor) => actor.id);
    expect(dead).toContain(FATHER);
    expect(dead).toContain(MOTHER);
    expect(RelationshipsSchema.safeParse(snapshot.relationships).success).toBe(true);
    for (const relationship of snapshot.relationships) {
      expect(relationship.coResident).toBe(false);
      // 亲子关系不因死亡解除。
      expect(relationship.until).toBeNull();
    }
  });

  it('is deterministic and continues identically after a snapshot round-trip', () => {
    const first = wholeLife('npc-fixture-2');
    const second = wholeLife('npc-fixture-2');
    expect(canonicalJson(first.facts)).toBe(canonicalJson(second.facts));

    const interrupted = createLifeSimulation({
      seed: 'npc-fixture-2',
      region: FIXTURE_REGION,
      birthDate: BIRTH,
    });
    interrupted.advanceTo({ ...FOREVER, targetDate: addYears(BIRTH, 20) });
    const saved = JSON.parse(JSON.stringify(interrupted.snapshot())) as ReturnType<
      Simulation['snapshot']
    >;
    const resumed = restoreLifeSimulation(saved, FIXTURE_REGION);
    resumed.advanceTo(FOREVER);
    expect(canonicalJson([...interrupted.facts, ...resumed.facts])).toBe(
      canonicalJson(first.facts),
    );
  });
});
