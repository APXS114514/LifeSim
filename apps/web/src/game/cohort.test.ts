import { canonicalJson } from '@lifesim/simulation-core';
import { describe, expect, it, vi } from 'vitest';
import {
  COHORT_SIZE,
  Cohort,
  advanceCohortSimulation,
  advanceCohortStep,
  cohortRequest,
  needsCohortAdvance,
} from './cohort.ts';
import { GameSession } from './session.ts';

const FIXED_BIRTH_DATE = '1978-05-04';

function canonicalFacts(member: Cohort['members'][number]): string {
  return canonicalJson(member.simulation.facts);
}

describe('cohort requests', () => {
  it('derives a fixed seed per member and rejects indices outside 1—4', () => {
    const request = cohortRequest({ seed: 'a', birthDate: FIXED_BIRTH_DATE }, 1);
    expect(request.seed).toBe('a#cohort-1');
    expect(request.region).toBe('random');
    expect(request.year).toBe(1978);
    expect(request.birthDate).toBe(FIXED_BIRTH_DATE);
    expect(cohortRequest({ seed: 'a', birthDate: FIXED_BIRTH_DATE }, COHORT_SIZE).seed).toBe(
      'a#cohort-4',
    );

    for (const index of [0, 5, 1.5]) {
      expect(() => cohortRequest({ seed: 'a', birthDate: FIXED_BIRTH_DATE }, index)).toThrow(
        RangeError,
      );
    }
  });
});

describe('the four born that day', () => {
  it('is reproducible: two independent cohorts reach byte-identical snapshots and facts', () => {
    const input = { seed: 'cohort-0', birthDate: FIXED_BIRTH_DATE };
    const first = new Cohort(input);
    const second = new Cohort(input);

    first.advanceTo('2000-05-04');
    second.advanceTo('2000-05-04');

    for (let index = 0; index < COHORT_SIZE; index += 1) {
      const member = first.members[index];
      const twin = second.members[index];
      if (!member || !twin) throw new Error('Cohort lost a member');
      expect(canonicalJson(member.simulation.snapshot())).toBe(
        canonicalJson(twin.simulation.snapshot()),
      );
      expect(canonicalFacts(member)).toBe(canonicalFacts(twin));
    }
    // 同一天出生、种子不同 → 地区与城乡不同，这正是四人各自的确定性来源。
    expect(new Set(first.members.map((member) => member.birth.packId)).size).toBeGreaterThan(1);
    expect(first.clocks()).toEqual(first.members.map((member) => member.simulation.clock));
  }, 60_000);

  it('leaves the player life byte-identical, before and after finishing', () => {
    const playerRequest = {
      seed: 'iso-0',
      region: 'JP',
      year: 1978,
      birthDate: FIXED_BIRTH_DATE,
    } as const;
    const session = GameSession.create(playerRequest);
    const reference = GameSession.create(playerRequest);
    const snapshotBefore = canonicalJson(session.simulation.snapshot());
    const factsBefore = canonicalJson(session.facts);

    const cohort = new Cohort({ seed: session.request.seed, birthDate: session.birth.birthDate });
    cohort.advanceTo(session.clock);
    cohort.advanceTo('2000-05-04');

    expect(canonicalJson(session.simulation.snapshot())).toBe(snapshotBefore);
    expect(canonicalJson(session.facts)).toBe(factsBefore);

    session.finish();
    reference.finish();
    expect(canonicalJson(session.simulation.snapshot())).toBe(
      canonicalJson(reference.simulation.snapshot()),
    );
    expect(canonicalJson(session.facts)).toBe(canonicalJson(reference.facts));
  }, 60_000);

  it('never advances a member past the player clock', () => {
    const cohort = new Cohort({ seed: 'cohort-not-future', birthDate: '1950-02-01' });
    const targets: { index: number; targetDate: string }[] = [];
    for (const member of cohort.members) {
      const original = member.simulation.advanceTo.bind(member.simulation);
      vi.spyOn(member.simulation, 'advanceTo').mockImplementation((request, cancellation) => {
        targets.push({ index: member.index, targetDate: request.targetDate });
        return original(request, cancellation);
      });
    }

    for (const clock of ['1950-03-02', '2000-05-04'] as const) {
      cohort.advanceTo(clock);
      expect(targets.filter((entry) => entry.targetDate > clock)).toEqual([]);
      for (const member of cohort.members) {
        expect(member.simulation.clock <= clock).toBe(true);
      }
    }
    expect(targets.length).toBeGreaterThan(0);
  }, 60_000);

  it('advancing to the same clock twice adds no facts', () => {
    const cohort = new Cohort({ seed: 'cohort-idempotent', birthDate: FIXED_BIRTH_DATE });
    cohort.advanceTo('1990-05-04');
    const before = cohort.members.map((member) => member.simulation.facts.length);
    cohort.advanceTo('1990-05-04');
    expect(cohort.members.map((member) => member.simulation.facts.length)).toEqual(before);

    // 玩家时钟后退时也是空操作（内核会拒绝日期回退）。
    cohort.advanceTo('1985-05-04');
    expect(cohort.members.map((member) => member.simulation.facts.length)).toEqual(before);
  }, 60_000);

  it('advancing one year per frame matches one uninterrupted advance', () => {
    const input = { seed: 'cohort-stepwise', birthDate: FIXED_BIRTH_DATE };
    const target = '2000-05-04';
    const oneShot = new Cohort(input);
    oneShot.advanceTo(target);

    const stepwise = new Cohort(input);
    let rounds = 0;
    do {
      for (const member of stepwise.members) {
        advanceCohortStep(member, target);
        expect(member.simulation.clock <= target).toBe(true);
      }
      rounds += 1;
      if (rounds > 200) throw new Error('Stepwise cohort advance did not converge');
    } while (stepwise.members.some((member) => needsCohortAdvance(member, target)));

    for (let index = 0; index < COHORT_SIZE; index += 1) {
      const member = oneShot.members[index];
      const twin = stepwise.members[index];
      if (!member || !twin) throw new Error('Cohort lost a member');
      expect(canonicalJson(twin.simulation.snapshot())).toBe(
        canonicalJson(member.simulation.snapshot()),
      );
      expect(canonicalFacts(twin)).toBe(canonicalFacts(member));
    }
  }, 60_000);

  it('settles the birth day even when the target is already the current clock', () => {
    const input = { seed: 'cohort-birth-settle', birthDate: FIXED_BIRTH_DATE };
    const oneShot = new Cohort(input);
    oneShot.advanceTo(FIXED_BIRTH_DATE);

    const stepwise = new Cohort(input);
    for (const member of stepwise.members) advanceCohortStep(member, FIXED_BIRTH_DATE);

    for (let index = 0; index < COHORT_SIZE; index += 1) {
      const member = oneShot.members[index];
      const twin = stepwise.members[index];
      if (!member || !twin) throw new Error('Cohort lost a member');
      expect(twin.simulation.clock).toBe(FIXED_BIRTH_DATE);
      expect(canonicalJson(twin.simulation.snapshot())).toBe(
        canonicalJson(member.simulation.snapshot()),
      );
      expect(canonicalFacts(twin)).toBe(canonicalFacts(member));
    }
  }, 60_000);

  it('stops advancing a member who has died', () => {
    const cohort = new Cohort({ seed: 'cohort-death', birthDate: '1950-02-01' });
    cohort.advanceTo('2200-01-01');
    for (const member of cohort.members) {
      const facts = member.simulation.facts.length;
      advanceCohortSimulation(member.simulation, '2200-01-01');
      expect(member.simulation.facts.length).toBe(facts);
    }
  }, 60_000);
});
