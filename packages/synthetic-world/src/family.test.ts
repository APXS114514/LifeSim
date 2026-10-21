import {
  RelationshipsSchema,
  checkJournalInvariants,
  type SimEventFact,
} from '@lifesim/content-schema';
import {
  addYears,
  ageOn,
  canonicalJson,
  fromDayNumber,
  toDayNumber,
  type Simulation,
} from '@lifesim/simulation-core';
import { createLifeSimulation, lifeInvariants, restoreLifeSimulation } from '@lifesim/systems';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { syntheticRegion } from './region.ts';

const BIRTH = '1960-03-15';

function born(seed: string): Simulation {
  const simulation = createLifeSimulation({ seed, region: syntheticRegion, birthDate: BIRTH });
  simulation.advanceTo({
    targetDate: BIRTH,
    stopAtMajorDecision: false,
    maxWorkUnits: 100,
  });
  return simulation;
}

describe('birth family (M3-010)', () => {
  it('creates the protagonist, two Tier1 parents and their accounts', () => {
    const simulation = born('family-1');
    const snapshot = simulation.snapshot();
    expect(snapshot.actors).toHaveLength(3);

    const protagonist = snapshot.actors.find((actor) => actor.id === 'char:protagonist');
    const mother = snapshot.actors.find((actor) => actor.id === 'char:protagonist:mother');
    const father = snapshot.actors.find((actor) => actor.id === 'char:protagonist:father');
    expect(protagonist?.tier).toBe('protagonist');
    expect(mother?.tier).toBe('tier1');
    expect(father?.tier).toBe('tier1');
    if (!mother || !father) throw new Error('parents were not created');
    expect(mother.birthDate < BIRTH).toBe(true);
    expect(father.birthDate < BIRTH).toBe(true);

    expect(snapshot.householdAccounts).toHaveLength(3);
    for (const actor of snapshot.actors) {
      const account = snapshot.householdAccounts.find(
        (candidate) => candidate.id === actor.finance.accountId,
      );
      expect(account?.ownerIds).toEqual([actor.id]);
      expect(account?.balanceMinor).toBe(0);
    }
  });

  it('writes two parent-child relationships with both bond directions', () => {
    const snapshot = born('family-1').snapshot();
    expect(snapshot.relationships).toHaveLength(2);
    for (const relationship of snapshot.relationships) {
      expect(relationship.kind).toBe('parent-child');
      expect(relationship.toId).toBe('char:protagonist');
      expect(relationship.fromId).toMatch(/^char:protagonist:(mother|father)$/);
      expect(relationship.since).toBe(BIRTH);
      expect(relationship.until).toBeNull();
      expect(relationship.biological).toBe(true);
      expect(relationship.legal).toBe(true);
      expect(relationship.coResident).toBe(true);
      expect(Object.keys(relationship.bonds).sort()).toEqual(
        [relationship.fromId, relationship.toId].sort(),
      );
    }
  });

  it('emits two family.parent facts caused by the birth fact', () => {
    const simulation = born('family-1');
    const facts = simulation.facts;
    const birth = facts.find((fact) => fact.type === 'life.birth');
    expect(birth).toBeDefined();
    const parents = facts.filter((fact) => fact.type === 'family.parent');
    expect(parents).toHaveLength(2);
    expect(parents.map((fact) => fact.outcomeCode).sort()).toEqual(['father', 'mother']);
    for (const fact of parents) {
      expect(fact.causeEventIds).toContain(birth?.id);
      expect(fact.actorIds[0]).toMatch(/^char:protagonist:(mother|father)$/);
      expect(fact.details?.['ageAtBirth']).toBeGreaterThanOrEqual(18);
      expect(fact.details?.['ageAtBirth']).toBeLessThanOrEqual(45);
      expect(fact.details?.['education']).toBeTypeOf('string');
    }
  });

  it('is deterministic and passes the snapshot schema', () => {
    const first = born('family-repeat');
    const second = born('family-repeat');
    expect(canonicalJson(first.snapshot())).toBe(canonicalJson(second.snapshot()));
    expect(canonicalJson(first.facts)).toBe(canonicalJson(second.facts));
  });

  it('continues identically after a snapshot round-trip at birth', () => {
    const saved = born('family-restore');
    const savedFacts = [...saved.facts];
    const json = JSON.parse(JSON.stringify(saved.snapshot())) as ReturnType<Simulation['snapshot']>;
    const resumed = restoreLifeSimulation(json, syntheticRegion);
    const target = addYears(BIRTH, 5);
    resumed.advanceTo({ targetDate: target, stopAtMajorDecision: false, maxWorkUnits: 100_000 });

    const uninterrupted = born('family-restore');
    uninterrupted.advanceTo({
      targetDate: target,
      stopAtMajorDecision: false,
      maxWorkUnits: 100_000,
    });
    expect(canonicalJson([...savedFacts, ...resumed.facts])).toBe(
      canonicalJson(uninterrupted.facts),
    );
  });
});

/**
 * M3-011：Tier1 NPC（出生家庭里的父母）的生命周期。
 *
 * 这些测试用真实规则与合成地区跑完整人生：NPC 有自己的就业/健康/死亡事实，
 * 死亡后不再产生任何事实，而且 NPC 的生活不改变主角的抽样（验收 7）。
 */
const FOREVER_DATE = '2200-01-01' as const;
const TIER1_BIRTH = '1960-03-15' as const;
const PARENTS = ['char:protagonist:mother', 'char:protagonist:father'] as const;
const FOREVER_ADVANCE = {
  targetDate: FOREVER_DATE,
  stopAtMajorDecision: false,
  maxWorkUnits: 1_000_000,
};

function wholeLife(seed: string, birthDate: string = TIER1_BIRTH): Simulation {
  const simulation = createLifeSimulation({ seed, region: syntheticRegion, birthDate });
  simulation.advanceTo(FOREVER_ADVANCE);
  return simulation;
}

function factsOf(facts: readonly SimEventFact[], actorId: string): SimEventFact[] {
  return facts.filter((fact) => fact.actorIds.length === 1 && fact.actorIds[0] === actorId);
}

function isParent(actorId: string | undefined): boolean {
  return PARENTS.some((parent) => parent === actorId);
}

/** 就业或健康类 NPC 事实：任务验收 1 与报告里的「NPC 过自己的日子」都以它们为准。 */
const NPC_WORK_OR_HEALTH = [
  'npc.hired',
  'npc.job-lost',
  'npc.job-search-failed',
  'npc.retired',
  'npc.illness-onset',
] as const;

describe('Tier1 NPC lifecycles (M3-011)', () => {
  it('gives the parents their own employment or health facts before the protagonist turns 30', () => {
    const limit = addYears(TIER1_BIRTH, 30);
    // 固定种子（npc-2/3/5：两个父母在第 30 年仍在世，所以「有事实」不是早死造成的假象）。
    for (const seed of ['npc-2', 'npc-3', 'npc-5']) {
      const simulation = wholeLife(seed);
      const snapshot = simulation.snapshot();
      const ids = new Set(snapshot.actors.map((actor) => actor.id));
      for (const fact of simulation.facts) {
        for (const actorId of fact.actorIds) expect(ids.has(actorId)).toBe(true);
      }
      for (const parentId of PARENTS) {
        const parent = snapshot.actors.find((actor) => actor.id === parentId);
        if (!parent) throw new Error(`${seed} has no ${parentId}`);
        const alive = parent.vitalStatus.kind === 'alive' || parent.vitalStatus.deathDate > limit;
        expect(alive).toBe(true);
      }
      const own = simulation.facts.filter(
        (fact) =>
          fact.actorIds.length === 1 &&
          isParent(fact.actorIds[0]) &&
          fact.at <= limit &&
          NPC_WORK_OR_HEALTH.some((type) => type === fact.type),
      );
      expect(own.length).toBeGreaterThan(0);
    }
  });

  it('stops every fact for a parent who dies within three years (the dead do not act)', () => {
    // 固定种子 npc-86：父亲在建档约 2.9 年后去世。
    const simulation = wholeLife('npc-86');
    const fatherId = 'char:protagonist:father';
    const own = factsOf(simulation.facts, fatherId);
    const death = own.find((fact) => fact.type === 'life.death');
    if (!death) throw new Error('seed npc-86 no longer loses the father early');
    expect(death.at <= addYears(TIER1_BIRTH, 3)).toBe(true);
    expect(death.templateId).toBe('npc.death');
    expect(death.details?.['role']).toBe('father');
    expect(own.filter((fact) => fact.at > death.at)).toEqual([]);
    expect(
      simulation.facts.filter((fact) => fact.actorIds.includes(fatherId) && fact.at > death.at),
    ).toEqual([]);
    const snapshot = simulation.snapshot();
    const father = snapshot.actors.find((actor) => actor.id === fatherId);
    expect(father?.vitalStatus.kind).toBe('deceased');
    for (const relationship of snapshot.relationships) {
      if (relationship.fromId !== fatherId && relationship.toId !== fatherId) continue;
      expect(relationship.coResident).toBe(false);
      // 亲子关系不因死亡解除。
      expect(relationship.until).toBeNull();
    }
    expect(RelationshipsSchema.safeParse(snapshot.relationships).success).toBe(true);
  });

  it('never lets a minor work, an under-age person retire, or a dead NPC act', () => {
    const { minimumWorkingAge, retirementAge } = syntheticRegion.rules;
    const seeds = fc.string({ minLength: 1, maxLength: 8 });
    const births = fc
      .integer({ min: toDayNumber('1950-01-01'), max: toDayNumber('2026-12-31') })
      .map(fromDayNumber);
    fc.assert(
      fc.property(seeds, births, (seed, birthDate) => {
        const simulation = wholeLife(seed, birthDate);
        const snapshot = simulation.snapshot();
        const facts = simulation.facts;
        const birthDates = new Map(snapshot.actors.map((actor) => [actor.id, actor.birthDate]));
        const deathDates = new Map(
          snapshot.actors
            .filter((actor) => actor.vitalStatus.kind === 'deceased')
            .map((actor) => [
              actor.id,
              actor.vitalStatus.kind === 'deceased' ? actor.vitalStatus.deathDate : null,
            ]),
        );
        const issues: string[] = [];
        for (const fact of facts) {
          for (const actorId of fact.actorIds) {
            const birthDateOf = birthDates.get(actorId);
            if (!birthDateOf) {
              issues.push(`${fact.id} names unknown actor ${actorId}`);
              continue;
            }
            const deathDate = deathDates.get(actorId);
            if (deathDate && fact.at > deathDate) {
              issues.push(`${fact.id} involves ${actorId} after their death`);
            }
            const age = ageOn(birthDateOf, fact.at);
            if (fact.type === 'npc.hired' && age < minimumWorkingAge) {
              issues.push(`${fact.id} hires ${actorId} at ${age}`);
            }
            if (fact.type === 'npc.retired' && age < retirementAge) {
              issues.push(`${fact.id} retires ${actorId} at ${age}`);
            }
          }
        }
        for (const invariant of lifeInvariants(syntheticRegion)) {
          for (const message of invariant.check(simulation.state, simulation.clock)) {
            issues.push(`${invariant.id}: ${message}`);
          }
        }
        expect(checkJournalInvariants(facts, { complete: true })).toEqual([]);
        expect(issues).toEqual([]);
      }),
      { numRuns: 50 },
    );
  });

  it('is deterministic and continues identically after a snapshot round-trip', () => {
    const first = wholeLife('npc-restore');
    const second = wholeLife('npc-restore');
    expect(canonicalJson(second.facts)).toBe(canonicalJson(first.facts));

    const interrupted = createLifeSimulation({
      seed: 'npc-restore',
      region: syntheticRegion,
      birthDate: TIER1_BIRTH,
    });
    interrupted.advanceTo({ ...FOREVER_ADVANCE, targetDate: addYears(TIER1_BIRTH, 25) });
    const saved = JSON.parse(JSON.stringify(interrupted.snapshot())) as ReturnType<
      Simulation['snapshot']
    >;
    const resumed = restoreLifeSimulation(saved, syntheticRegion);
    resumed.advanceTo(FOREVER_ADVANCE);
    expect(canonicalJson([...interrupted.facts, ...resumed.facts])).toBe(
      canonicalJson(first.facts),
    );
  });
});
