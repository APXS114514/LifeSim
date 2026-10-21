import { addYears, canonicalJson, type Simulation } from '@lifesim/simulation-core';
import { createLifeSimulation, restoreLifeSimulation } from '@lifesim/systems';
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
