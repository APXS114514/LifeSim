import { SimulationSnapshotSchema, type CharacterState } from '@lifesim/content-schema';
import { addYears, canonicalJson, deriveStream } from '@lifesim/simulation-core';
import fc from 'fast-check';
import { describe, expect, it, vi } from 'vitest';
import { FIXTURE_REGION } from './__fixtures__/focus-region.ts';
import { createLifeSimulation, restoreLifeSimulation } from './module.ts';
import { DEFAULT_PRINCIPLES } from './life.ts';
import {
  FOCUS_EFFECTS,
  YEARLY_FOCUS_IDS,
  yearlyFocusDecisionKey,
  yearlyFocusOptions,
  type YearlyFocus,
} from './yearly-focus.ts';

const BIRTH = '1970-05-04';
const ADVANCE = { stopAtMajorDecision: false, maxWorkUnits: 100_000 };
const REGION = { ...FIXTURE_REGION, mortalityQ: () => 0 };
function run(seed: string, focus: YearlyFocus, until = 30) {
  const simulation = createLifeSimulation({ seed, region: REGION, birthDate: BIRTH });
  for (let age = 0; age <= until; age++) simulation.preset(yearlyFocusDecisionKey(age), focus);
  simulation.advanceTo({ ...ADVANCE, targetDate: addYears(BIRTH, until) });
  return simulation;
}
function own(simulation: ReturnType<typeof run>): CharacterState {
  return simulation.state.actors.find((actor) => actor.tier === 'protagonist')!;
}

/** Global journal IDs shift when the protagonist emits different facts; preserve their referents. */
function npcProjection(simulation: ReturnType<typeof run>): string {
  const labels = new Map(
    simulation.facts.map(({ id, sequence: _sequence, causeEventIds: _causes, ...fact }) => [
      id,
      canonicalJson(fact),
    ]),
  );
  expect(new Set(labels.values()).size).toBe(simulation.facts.length);
  return JSON.stringify(
    {
      actors: simulation.state.actors.filter((actor) => actor.tier !== 'protagonist'),
      facts: simulation.facts
        .filter(
          (fact) =>
            fact.actorIds.length > 0 && fact.actorIds.every((id) => id !== 'char:protagonist'),
        )
        .map(({ id: _id, sequence: _sequence, ...fact }) => fact),
    },
    (_key, value: unknown) => (typeof value === 'string' ? (labels.get(value) ?? value) : value),
  );
}

describe('M3-041 yearly focus', () => {
  it('uses exactly the approved probability and fine-state design table', () => {
    expect(FOCUS_EFFECTS).toEqual({
      balanced: { education: 1, hiring: 1, jobLoss: 1, onset: 1, stress: 0, ties: 0 },
      study: { education: 1.15, hiring: 0.95, jobLoss: 1, onset: 1, stress: 0.01, ties: 0 },
      work: { education: 0.95, hiring: 1.15, jobLoss: 0.85, onset: 1.1, stress: 0.03, ties: 0 },
      health: { education: 1, hiring: 0.95, jobLoss: 1, onset: 0.85, stress: -0.02, ties: 0 },
      family: { education: 1, hiring: 0.95, jobLoss: 1, onset: 1, stress: -0.01, ties: 0.03 },
      leisure: {
        education: 0.95,
        hiring: 0.95,
        jobLoss: 1,
        onset: 0.95,
        stress: -0.03,
        ties: 0.01,
      },
    });
  });

  it('offers pure age-appropriate choices and keeps learning available after retirement', () => {
    const actor = own(run('options', 'balanced', 0));
    const before = canonicalJson(actor);
    const options = (age: number, status = actor.employment.status) =>
      yearlyFocusOptions({ ...actor, employment: { ...actor.employment, status } }, age, REGION);
    expect(
      options(0)
        .filter((option) => option.eligible)
        .map((option) => option.id),
    ).toEqual(['balanced', 'health', 'family', 'leisure']);
    expect(options(6).find((option) => option.id === 'study')?.eligible).toBe(true);
    expect(options(14).find((option) => option.id === 'work')?.eligible).toBe(false);
    expect(options(15, 'unemployed').find((option) => option.id === 'work')?.eligible).toBe(true);
    expect(options(20, 'student').find((option) => option.id === 'work')?.eligible).toBe(false);
    expect(options(70, 'retired').find((option) => option.id === 'work')?.eligible).toBe(false);
    expect(options(70, 'retired').find((option) => option.id === 'study')?.eligible).toBe(true);
    expect(options(0)).toEqual(options(0));
    expect(canonicalJson(actor)).toBe(before);
  });

  it('never pauses even with all decisions requested and softly falls back from an ineligible preset', () => {
    const sim = createLifeSimulation({ seed: 'fallback', region: REGION, birthDate: BIRTH });
    sim.preset(yearlyFocusDecisionKey(0), 'work');
    const result = sim.advanceTo({
      targetDate: BIRTH,
      stopAtMajorDecision: true,
      pauseOn: 'all',
      maxWorkUnits: 1000,
    });
    expect(result.stopReason).toBe('target-reached');
    const fact = sim.facts.find((entry) => entry.details?.decision === 'choice.yearly-focus')!;
    expect(fact.details).toMatchObject({
      option: 'balanced',
      decidedBy: 'principles',
      presetIgnored: 'work',
    });
    expect(sim.pendingDecision('all')).toBeNull();
    expect(() => sim.preset(yearlyFocusDecisionKey(0), 'health')).toThrow();
  });

  it('chooses from principles without a preset and preserves approved birth defaults', () => {
    const sim = createLifeSimulation({
      seed: 'principles',
      region: REGION,
      birthDate: BIRTH,
      principles: {
        ...DEFAULT_PRINCIPLES,
        family: 0,
        wealth: 0,
        health: 0,
        knowledge: 1,
        risk: 0,
        stability: 0,
      },
    });
    sim.advanceTo({ ...ADVANCE, targetDate: addYears(BIRTH, 6) });
    expect(
      sim.facts.filter((fact) => fact.details?.decision === 'choice.yearly-focus').at(-1)
        ?.outcomeCode,
    ).toBe('study');
    const birth = own(run('defaults', 'family', 0));
    expect(birth.wellbeing.stress).toBe(0.3);
    expect(birth.social.ties).toBe(0.5);
    const afterYear = own(run('defaults', 'family', 1));
    expect(afterYear.wellbeing.stress).toBeCloseTo(0.29);
    expect(afterYear.social.ties).toBeCloseTo(0.53);
  });

  it('clamps repeated fine-state changes and leaves every NPC unchanged', () => {
    const baseline = run('bounds', 'balanced', 100);
    for (const focus of ['family', 'leisure', 'work'] as const) {
      const sim = run('bounds', focus, 100);
      expect(npcProjection(sim)).toBe(npcProjection(baseline));
      const actor = own(sim);
      expect(actor.wellbeing.stress).toBeGreaterThanOrEqual(0);
      expect(actor.wellbeing.stress).toBeLessThanOrEqual(1);
      expect(actor.social.ties).toBeGreaterThanOrEqual(0);
      expect(actor.social.ties).toBeLessThanOrEqual(1);
    }
    expect(own(run('bounds', 'family', 100)).social.ties).toBe(1);
    expect(own(run('bounds', 'leisure', 100)).wellbeing.stress).toBe(0);
  });

  it('increases enrollment with study versus leisure and reduces onset with health versus work in paired cohorts', () => {
    let studyEntries = 0;
    let leisureEntries = 0;
    let healthOnsets = 0;
    let workOnsets = 0;
    const cohortRegion = {
      ...REGION,
      annualLivingCostMinor: () => 0,
      primaryEnrollmentP: () => 0.5,
      secondaryContinuationP: () => 0,
      illnessOnsetP: (_year: number, age: number) => (age === 18 ? 0.5 : 0),
    };
    for (let index = 0; index < 300; index++) {
      for (const focus of ['study', 'leisure', 'health', 'work'] as const) {
        const sim = createLifeSimulation({
          seed: `focus-cohort-${index}`,
          region: cohortRegion,
          birthDate: BIRTH,
        });
        sim.preset(
          yearlyFocusDecisionKey(focus === 'study' || focus === 'leisure' ? 6 : 18),
          focus,
        );
        sim.advanceTo({ ...ADVANCE, targetDate: addYears(BIRTH, 18) });
        if (focus === 'study')
          studyEntries += Number(
            sim.facts.some((fact) => fact.type === 'education.primary-started'),
          );
        if (focus === 'leisure')
          leisureEntries += Number(
            sim.facts.some((fact) => fact.type === 'education.primary-started'),
          );
        if (focus === 'health')
          healthOnsets += Number(sim.facts.some((fact) => fact.type === 'health.illness-onset'));
        if (focus === 'work')
          workOnsets += Number(sim.facts.some((fact) => fact.type === 'health.illness-onset'));
      }
    }
    expect(studyEntries).toBeGreaterThan(leisureEntries);
    expect(healthOnsets).toBeLessThan(workOnsets);
  }, 30_000);

  it('keeps death probability independent of focus and does not consume an extra health draw', () => {
    for (const focus of ['balanced', 'health', 'family', 'leisure'] as const) {
      const mortalityQ = vi.fn(() => 0.1);
      const region = { ...REGION, mortalityQ, illnessOnsetP: () => 0 };
      const sim = createLifeSimulation({ seed: 'death-draw', region, birthDate: BIRTH });
      sim.preset(yearlyFocusDecisionKey(0), focus);
      sim.advanceTo({ ...ADVANCE, targetDate: addYears(BIRTH, 1) });
      expect(mortalityQ).toHaveBeenCalledWith(1970, 0, own(sim).sex);
      const random = deriveStream('death-draw', 'health.check|char:protagonist|age:0');
      random.chance(0);
      const dies = random.chance(0.1);
      expect(sim.facts.some((fact) => fact.type === 'life.death')).toBe(dies);
    }
  });

  it('keeps the selected multiplier through a paused and restored university-to-job-search chain', () => {
    const seed = Array.from({ length: 30 }, (_, index) => `focus-chain-${index}`).find(
      (candidate) =>
        !deriveStream(candidate, 'choice.after-secondary|char:protagonist|age:18').chance(0.575),
    )!;
    expect(seed).toBeDefined();
    const region = {
      ...REGION,
      primaryEnrollmentP: () => 1,
      secondaryContinuationP: () => 1,
      universityAdmissionP: () => 0.5,
      hiringP: () => 0.5,
      illnessOnsetP: () => 0,
    };
    const sim = createLifeSimulation({ seed, region, birthDate: BIRTH });
    sim.preset(yearlyFocusDecisionKey(18), 'study');
    sim.advanceTo({ ...ADVANCE, stopAtMajorDecision: true, targetDate: addYears(BIRTH, 18) });
    const pending = sim.pendingDecision()!;
    expect(pending.type).toBe('choice.after-secondary');
    const previous = [...sim.facts];
    const restored = restoreLifeSimulation(
      SimulationSnapshotSchema.parse(JSON.parse(JSON.stringify(sim.snapshot()))),
      region,
    );
    for (const current of [sim, restored]) {
      current.decide(pending.key, 'apply-university');
      current.advanceTo({ ...ADVANCE, targetDate: addYears(BIRTH, 18) });
      expect(current.facts.some((fact) => fact.type === 'education.admission-failed')).toBe(true);
      const hired = deriveStream(seed, 'career.job-search|char:protagonist|age:18').chance(0.475);
      expect(
        current.facts.some(
          (fact) => fact.at === addYears(BIRTH, 18) && fact.type === 'career.hired',
        ),
      ).toBe(hired);
    }
    expect(canonicalJson([...previous, ...restored.facts])).toBe(canonicalJson(sim.facts));
    expect(canonicalJson(restored.snapshot())).toBe(canonicalJson(sim.snapshot()));
  });

  it('keeps facts and snapshots identical through yearly steps, event steps, fast forward and restore', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1, maxLength: 12 }), (seed) => {
        const make = () => {
          const sim = createLifeSimulation({ seed, region: REGION, birthDate: BIRTH });
          for (let age = 0; age <= 30; age++)
            sim.preset(
              yearlyFocusDecisionKey(age),
              YEARLY_FOCUS_IDS[age % YEARLY_FOCUS_IDS.length]!,
            );
          return sim;
        };
        const fast = make();
        fast.advanceTo({ ...ADVANCE, targetDate: addYears(BIRTH, 30) });
        const yearly = make();
        for (let age = 0; age <= 30; age++)
          yearly.advanceTo({ ...ADVANCE, targetDate: addYears(BIRTH, age) });
        const event = make();
        while (event.clock < addYears(BIRTH, 30))
          event.advanceTo({ ...ADVANCE, maxWorkUnits: 1, targetDate: addYears(BIRTH, 30) });
        event.advanceTo({ ...ADVANCE, targetDate: addYears(BIRTH, 30) });
        expect(canonicalJson(yearly.facts)).toBe(canonicalJson(fast.facts));
        expect(canonicalJson(event.facts)).toBe(canonicalJson(fast.facts));
        expect(canonicalJson(event.snapshot())).toBe(canonicalJson(fast.snapshot()));
        const original = make();
        original.advanceTo({ ...ADVANCE, maxWorkUnits: 5, targetDate: BIRTH });
        const previousFacts = [...original.facts];
        const restored = restoreLifeSimulation(
          SimulationSnapshotSchema.parse(JSON.parse(JSON.stringify(original.snapshot()))),
          REGION,
        );
        restored.advanceTo({ ...ADVANCE, targetDate: addYears(BIRTH, 30) });
        expect(canonicalJson([...previousFacts, ...restored.facts])).toBe(
          canonicalJson(fast.facts),
        );
        expect(canonicalJson(restored.snapshot())).toBe(canonicalJson(fast.snapshot()));
      }),
      { numRuns: 25 },
    );
  }, 30_000);
});
