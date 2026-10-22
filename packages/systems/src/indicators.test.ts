import {
  EDUCATION_LEVELS,
  SimulationSnapshotSchema,
  type SimEventFact,
  type SimulationSnapshot,
} from '@lifesim/content-schema';
import { addDays, canonicalJson } from '@lifesim/simulation-core';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  deriveIncome,
  deriveIndicators,
  indicatorPercent,
  INDICATOR_KEYS,
  RECENT_EVENT_WEIGHT,
  RECENT_EVENT_LIMIT,
} from './indicators.ts';
import type { EducationQueries } from './region.ts';

/** 虚构夹具，只校验只读指标，不代表任何地区或人口的统计值。 */
function fixture(): SimulationSnapshot {
  const actor = {
    id: 'char:protagonist',
    tier: 'protagonist',
    sex: 'female',
    name: { scheme: 'zh', family: null, given: null, patronymic: null },
    wellbeing: { stress: 0.3 },
    social: { ties: 0.5 },
    skills: [],
    birthDate: '1970-06-15',
    birthPlaceId: 'place:fixture',
    currentResidenceId: 'place:fixture',
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
    education: { completed: 'secondary', enrolledIn: null, lastFactId: null },
    employment: { status: 'not-in-labor-force', wageLevel: null, lastFactId: null },
    health: { conditions: [] },
    finance: { accountId: 'acct:fixture', lastSettlementFactId: null },
  };
  return SimulationSnapshotSchema.parse({
    schemaVersion: 1,
    engineVersion: 'fixture-1',
    dataPackVersions: { fixture: '1' },
    at: '2020-06-15',
    rootSeed: 'fixture',
    rngState: {},
    schedulerState: {},
    activeCharacterId: actor.id,
    actors: [
      actor,
      { ...actor, id: 'char:mother', tier: 'tier1' },
      { ...actor, id: 'char:father', tier: 'tier1' },
    ],
    world: { economyPhase: 'normal', currency: { code: 'FIX', version: 1 } },
    relationships: ['mother', 'father'].map((parent, index) => ({
      id: `rel:${parent}`,
      kind: 'parent-child',
      fromId: `char:${parent}`,
      toId: actor.id,
      since: actor.birthDate,
      until: null,
      biological: true,
      legal: true,
      coResident: false,
      bonds: {
        [actor.id]: {
          trust: index === 0 ? 0.8 : 0.6,
          intimacy: index === 0 ? 0.6 : 0.8,
          conflict: 0.2,
        },
        [`char:${parent}`]: { trust: 0, intimacy: 0, conflict: 1 },
      },
    })),
    householdAccounts: [
      {
        id: 'acct:fixture',
        ownerIds: [actor.id],
        currency: { code: 'FIX', version: 1 },
        balanceMinor: 0,
      },
    ],
    lastJournalSequence: 0,
  });
}

function fact(sequence: number, overrides: Partial<SimEventFact> = {}): SimEventFact {
  return {
    id: `fact:${sequence}`,
    sequence,
    type: 'finance.settlement',
    at: '2020-06-15',
    actorIds: ['char:protagonist'],
    causeEventIds: [],
    outcomeCode: 'settled',
    templateId: 'fixture',
    evidenceIds: [],
    eventVersion: 1,
    details: { incomeMinor: 2_500_000, incomeSource: 'wage', currency: 'FIX-1' },
    ...overrides,
  };
}

function conditions(treated: readonly boolean[]) {
  return treated.map((value, index) => ({
    id: `fixture-${index}`,
    onset: '2000-01-01',
    treated: value,
    factId: `illness:${index}`,
  }));
}

describe('read-only indicators (M4-016)', () => {
  it('derives the documented baseline from a schema-valid fictional snapshot', () => {
    const values = deriveIndicators(fixture(), []);
    expect(values.health).toBe(1);
    expect(values.economy).toBe(0.5);
    expect(values.knowledge).toBeCloseTo(0.6, 6);
    expect(values.relationships).toBeCloseTo(0.7333333333, 6);
    expect(values.happiness).toBeCloseTo(0.7283333333, 6);
    expect(
      ['health', 'economy', 'knowledge', 'relationships'].map((key) =>
        indicatorPercent(values[key as keyof typeof values]),
      ),
    ).toEqual([100, 50, 60, 73]);
  });

  it('accounts for age and illness, and improves health when treatment begins', () => {
    const snapshot = fixture();
    snapshot.at = '2040-06-15';
    snapshot.actors[0]!.health.conditions = conditions([false, false]);
    const untreated = deriveIndicators(snapshot, []);
    expect(untreated.health).toBeCloseTo(0.3, 6);
    expect(indicatorPercent(untreated.health)).toBe(30);
    snapshot.actors[0]!.health.conditions[0]!.treated = true;
    expect(deriveIndicators(snapshot, []).health).toBeGreaterThan(untreated.health);
    snapshot.at = '2070-06-15';
    snapshot.actors[0]!.health.conditions = conditions([false, false, false]);
    expect(deriveIndicators(snapshot, []).health).toBe(0);
  });

  it('uses debt and recent in-debt settlement without inventing income', () => {
    const snapshot = fixture();
    snapshot.householdAccounts[0]!.balanceMinor = -5_000_000;
    const values = deriveIndicators(snapshot, [fact(1, { outcomeCode: 'in-debt' })]);
    expect(values.economy).toBeCloseTo(1 / 6, 6);
    expect(indicatorPercent(values.economy)).toBe(17);
    expect(values.happiness).toBeCloseTo(0.595, 6);
    snapshot.householdAccounts = [];
    expect(deriveIndicators(snapshot, []).economy).toBe(0.5);
  });

  it('ignores ended and unrelated relationships, using only the protagonist bond', () => {
    const snapshot = fixture();
    snapshot.relationships[0]!.until = '2019-01-01';
    snapshot.relationships[1]!.toId = 'char:mother';
    snapshot.relationships[1]!.bonds = {
      'char:father': { trust: 1, intimacy: 1, conflict: 0 },
      'char:mother': { trust: 1, intimacy: 1, conflict: 0 },
    };
    expect(deriveIndicators(snapshot, []).relationships).toBe(0);
    snapshot.relationships = [];
    expect(deriveIndicators(snapshot, []).relationships).toBe(0);
  });

  it('includes both recent-window boundaries and excludes NPC and future facts', () => {
    const snapshot = fixture();
    const baseline = deriveIndicators(snapshot, []).happiness;
    const facts = [
      fact(1, { type: 'career.hired', at: addDays(snapshot.at, -730) }),
      fact(2, { type: 'education.admitted' }),
      fact(3, { type: 'career.job-lost', at: addDays(snapshot.at, -731) }),
      fact(4, { type: 'career.job-lost', at: addDays(snapshot.at, 1) }),
      fact(5, { type: 'career.job-lost', actorIds: ['char:mother'] }),
    ];
    expect(deriveIndicators(snapshot, facts).happiness).toBeCloseTo(
      baseline + 2 * RECENT_EVENT_WEIGHT,
    );
    expect(
      deriveIndicators(
        snapshot,
        Array.from({ length: 10 }, (_, i) => fact(i, { type: 'career.hired' })),
      ).happiness,
    ).toBeCloseTo(baseline + RECENT_EVENT_LIMIT, 6);
    expect(
      deriveIndicators(
        snapshot,
        Array.from({ length: 10 }, (_, i) => fact(i, { type: 'health.illness-onset' })),
      ).happiness,
    ).toBeCloseTo(baseline - RECENT_EVENT_LIMIT, 6);
  });

  it('still derives final values for a deceased actor and rejects a missing protagonist', () => {
    const snapshot = fixture();
    snapshot.actors[0]!.vitalStatus = {
      kind: 'deceased',
      deathDate: snapshot.at,
      deathFactId: 'fact:death',
    };
    for (const value of Object.values(deriveIndicators(snapshot, []))) {
      expect(Number.isFinite(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }
    snapshot.activeCharacterId = 'char:missing';
    expect(() => deriveIndicators(snapshot, [])).toThrow('Snapshot has no protagonist');
    expect(() => deriveIncome(snapshot, [])).toThrow('Snapshot has no protagonist');
  });

  it('selects the highest protagonist settlement sequence without sorting inputs', () => {
    const snapshot = fixture();
    const facts = [
      fact(4, { details: { incomeMinor: 700, incomeSource: 'pension' } }),
      fact(9, { actorIds: ['char:mother'] }),
      fact(2),
    ];
    const before = canonicalJson(facts);
    expect(deriveIncome(snapshot, facts)).toEqual({
      incomeMinor: 700,
      incomeSource: 'pension',
      at: snapshot.at,
    });
    expect(canonicalJson(facts)).toBe(before);
    expect(deriveIncome(snapshot, [])).toBeNull();
    expect(deriveIncome(snapshot, [fact(1, { actorIds: ['char:mother'] })])).toBeNull();
    expect(
      deriveIncome(snapshot, [fact(1, { details: { incomeMinor: 0, incomeSource: 'none' } })]),
    ).toEqual({ incomeMinor: 0, incomeSource: 'none', at: snapshot.at });
  });

  it('rejects malformed settlement details instead of displaying invented zero income', () => {
    for (const details of [
      undefined,
      {},
      { incomeMinor: '100', incomeSource: 'wage' },
      { incomeMinor: 100, incomeSource: 'unknown' },
    ]) {
      expect(deriveIncome(fixture(), [fact(1, { details })])).toBeNull();
    }
  });

  it.each([
    [0, 0],
    [0.5, 50],
    [0.733333, 73],
    [1, 100],
    [-3, 0],
    [7, 100],
  ])('rounds and clamps %s to %s percent', (input, expected) => {
    expect(indicatorPercent(input)).toBe(expected);
  });
});

/** 测试夹具（虚构数据）：按给定的义务教育年限返回同一份学制。 */
function educationQueries(compulsoryYears: number, secondaryYears = 3): EducationQueries {
  const system = {
    primaryStartAge: 6,
    primaryYears: 6,
    secondaryYears,
    tertiaryYears: 4,
    compulsoryYears,
    entranceExam: { kind: 'none' as const },
    feeShare: 0,
    grade: 'D' as const,
    sourceIds: ['fixture:m3-012d'],
  };
  return {
    secondaryEnrollmentRate: () => null,
    upperSecondaryCompletionRate: () => null,
    systemAt: () => system,
  };
}

describe('M3-012d：义务教育录取与大学考试失败对幸福的影响', () => {
  const admitted = (stage: 'secondary' | 'tertiary') =>
    fact(1, { type: 'education.admitted', details: { stage, path: 'selection' } });

  it('义务教育内的录取不算正面经历', () => {
    const snapshot = fixture();
    const baseline = deriveIndicators(snapshot, []).happiness;
    // 小学 6 + 初中 3 = 9 年义务教育：初中录取是制度保证的学位。
    expect(
      deriveIndicators(snapshot, [admitted('secondary')], educationQueries(9)).happiness,
    ).toBeCloseTo(baseline, 10);
    // 不提供学制时保持旧口径（计入），避免夹具与历史快照的行为突变。
    expect(deriveIndicators(snapshot, [admitted('secondary')]).happiness).toBeCloseTo(
      baseline + RECENT_EVENT_WEIGHT,
      10,
    );
  });

  it('非义务教育阶段的录取仍算正面经历', () => {
    const snapshot = fixture();
    const baseline = deriveIndicators(snapshot, []).happiness;
    // 义务教育只覆盖小学 6 年：初中录取是竞争性结果。
    expect(
      deriveIndicators(snapshot, [admitted('secondary')], educationQueries(6)).happiness,
    ).toBeCloseTo(baseline + RECENT_EVENT_WEIGHT, 10);
    expect(
      deriveIndicators(snapshot, [admitted('tertiary')], educationQueries(9)).happiness,
    ).toBeCloseTo(baseline + RECENT_EVENT_WEIGHT, 10);
  });

  it('大学入学考试失败算负面经历，其他阶段的考试失败不算', () => {
    const snapshot = fixture();
    const baseline = deriveIndicators(snapshot, []).happiness;
    expect(
      deriveIndicators(snapshot, [
        fact(1, { type: 'education.exam-failed', details: { stage: 'tertiary', passRate: 0.4 } }),
      ]).happiness,
    ).toBeCloseTo(baseline - RECENT_EVENT_WEIGHT, 10);
    expect(
      deriveIndicators(snapshot, [
        fact(1, { type: 'education.exam-failed', details: { stage: 'secondary' } }),
      ]).happiness,
    ).toBeCloseTo(baseline, 10);
  });
});

const ratio = fc.double({ min: 0, max: 1, noNaN: true });
const balance = fc.integer({ min: -1_000_000_000, max: 1_000_000_000 });

describe('indicator properties', () => {
  it('always returns five finite ratios in range', () => {
    fc.assert(
      fc.property(
        ratio,
        balance,
        fc.array(fc.boolean(), { maxLength: 12 }),
        fc.integer({ min: 0, max: 120 }),
        (aptitude, amount, illnesses, age) => {
          const snapshot = fixture();
          snapshot.actors[0]!.traits.aptitude = aptitude;
          snapshot.actors[0]!.birthDate = `${String(2020 - age).padStart(4, '0')}-06-15`;
          snapshot.actors[0]!.health.conditions = conditions(illnesses);
          snapshot.householdAccounts[0]!.balanceMinor = amount;
          const values = deriveIndicators(snapshot, [fact(1)]);
          expect(Object.keys(values)).toEqual([...INDICATOR_KEYS]);
          for (const value of Object.values(values)) {
            expect(Number.isFinite(value)).toBe(true);
            expect(value).toBeGreaterThanOrEqual(0);
            expect(value).toBeLessThanOrEqual(1);
            const percent = indicatorPercent(value);
            expect(Number.isInteger(percent)).toBe(true);
            expect(percent).toBeGreaterThanOrEqual(0);
            expect(percent).toBeLessThanOrEqual(100);
          }
        },
      ),
      { numRuns: 200 },
    );
  });

  it('cannot improve health by adding untreated illness or losing treatment', () => {
    fc.assert(
      fc.property(fc.array(fc.boolean(), { maxLength: 10 }), (illnesses) => {
        const snapshot = fixture();
        snapshot.actors[0]!.health.conditions = conditions([...illnesses, true]);
        const treated = deriveIndicators(snapshot, []).health;
        snapshot.actors[0]!.health.conditions.at(-1)!.treated = false;
        const untreated = deriveIndicators(snapshot, []).health;
        expect(untreated).toBeLessThanOrEqual(treated);
        snapshot.actors[0]!.health.conditions.push(...conditions([false]));
        expect(deriveIndicators(snapshot, []).health).toBeLessThanOrEqual(untreated);
        snapshot.actors[0]!.health.conditions = conditions(illnesses);
        expect(deriveIndicators(snapshot, []).health).toBeGreaterThanOrEqual(treated);
      }),
      { numRuns: 200 },
    );
  });

  it('cannot improve economy by decreasing the balance', () => {
    fc.assert(
      fc.property(balance, fc.nat(1_000_000), (amount, decrease) => {
        const snapshot = fixture();
        snapshot.householdAccounts[0]!.balanceMinor = amount;
        const before = deriveIndicators(snapshot, [fact(1)]).economy;
        snapshot.householdAccounts[0]!.balanceMinor -= decrease;
        expect(deriveIndicators(snapshot, [fact(1)]).economy).toBeLessThanOrEqual(before);
      }),
      { numRuns: 200 },
    );
  });

  it('strictly increases knowledge through completed education levels', () => {
    fc.assert(
      fc.property(ratio, (aptitude) => {
        const snapshot = fixture();
        snapshot.actors[0]!.traits.aptitude = aptitude;
        const values = EDUCATION_LEVELS.map((level) => {
          snapshot.actors[0]!.education.completed = level;
          return deriveIndicators(snapshot, []).knowledge;
        });
        for (let index = 1; index < values.length; index += 1)
          expect(values[index]).toBeGreaterThan(values[index - 1]!);
      }),
      { numRuns: 100 },
    );
  });

  it('responds monotonically to the protagonist trust, intimacy and conflict', () => {
    fc.assert(
      fc.property(ratio, ratio, ratio, (trust, intimacy, conflict) => {
        const snapshot = fixture();
        const bond = snapshot.relationships[0]!.bonds[snapshot.activeCharacterId]!;
        Object.assign(bond, { trust, intimacy, conflict });
        const before = deriveIndicators(snapshot, []).relationships;
        bond.trust = 1;
        expect(deriveIndicators(snapshot, []).relationships).toBeGreaterThanOrEqual(before);
        bond.trust = trust;
        bond.intimacy = 1;
        expect(deriveIndicators(snapshot, []).relationships).toBeGreaterThanOrEqual(before);
        bond.intimacy = intimacy;
        bond.conflict = 1;
        expect(deriveIndicators(snapshot, []).relationships).toBeLessThanOrEqual(before);
      }),
      { numRuns: 200 },
    );
  });

  it('is deterministic and leaves all input bytes unchanged', () => {
    fc.assert(
      fc.property(balance, fc.array(fc.boolean(), { maxLength: 12 }), (amount, illnesses) => {
        const snapshot = fixture();
        snapshot.householdAccounts[0]!.balanceMinor = amount;
        snapshot.actors[0]!.health.conditions = conditions(illnesses);
        const facts = Array.from({ length: 10 }, (_, index) =>
          fact(10 - index, { actorIds: index % 2 === 0 ? ['char:protagonist'] : ['char:mother'] }),
        );
        const before = canonicalJson({ snapshot, facts });
        expect(deriveIndicators(snapshot, facts)).toEqual(deriveIndicators(snapshot, facts));
        expect(canonicalJson({ snapshot, facts })).toBe(before);
      }),
      { numRuns: 50 },
    );
  });
});

it('derives fine-state effects monotonically without modifying the snapshot', () => {
  fc.assert(
    fc.property(
      fc.double({ min: 0, max: 1, noNaN: true }),
      fc.double({ min: 0, max: 1, noNaN: true }),
      (a, b) => {
        const low = Math.min(a, b),
          high = Math.max(a, b);
        const base = fixture();
        const higher = fixture();
        base.actors[0]!.wellbeing.stress = low;
        higher.actors[0]!.wellbeing.stress = high;
        expect(deriveIndicators(higher, []).happiness).toBeLessThanOrEqual(
          deriveIndicators(base, []).happiness,
        );
        base.actors[0]!.social.ties = low;
        higher.actors[0]!.social.ties = high;
        expect(deriveIndicators(higher, []).relationships).toBeGreaterThanOrEqual(
          deriveIndicators(base, []).relationships,
        );
        base.actors[0]!.skills = [{ id: 'skill:fixture', level: low, since: base.at }];
        higher.actors[0]!.skills = [{ id: 'skill:fixture', level: high, since: higher.at }];
        const before = canonicalJson(higher);
        expect(deriveIndicators(higher, []).knowledge).toBeGreaterThanOrEqual(
          deriveIndicators(base, []).knowledge,
        );
        expect(canonicalJson(higher)).toBe(before);
      },
    ),
  );
});
