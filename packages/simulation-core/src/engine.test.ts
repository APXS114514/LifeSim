import {
  SimulationSnapshotSchema,
  checkJournalInvariants,
  type SimulationSnapshot,
} from '@lifesim/content-schema';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  FAR_FUTURE,
  TOY_ACTOR,
  createToySimulation,
  toyModules,
  type TrapKind,
} from './__fixtures__/toy-world.ts';
import { addYears } from './calendar.ts';
import { Simulation } from './engine.ts';
import { SimulationError } from './errors.ts';
import { canonicalJson } from './json.ts';

const forever = { targetDate: FAR_FUTURE, stopAtMajorDecision: false, maxWorkUnits: 1_000_000 };

/** 跑完一生，返回全部事实与最终快照。 */
function runToEnd(simulation: Simulation) {
  const result = simulation.advanceTo(forever);
  expect(result.stopReason).toBe('protagonist-died');
  return { facts: simulation.facts, snapshot: simulation.snapshot() };
}

function runYearByYear(simulation: Simulation) {
  let year = 1971;
  while (!simulation.ended) {
    simulation.advanceTo({ ...forever, targetDate: `${year}-01-01` });
    year++;
  }
  return { facts: simulation.facts, snapshot: simulation.snapshot() };
}

function runInTinySteps(simulation: Simulation) {
  while (!simulation.ended) simulation.advanceTo({ ...forever, maxWorkUnits: 1 });
  return { facts: simulation.facts, snapshot: simulation.snapshot() };
}

const seeds = fc.string({ minLength: 1, maxLength: 12 });

describe('determinism', () => {
  it('produces byte-identical facts for the same seed', () => {
    fc.assert(
      fc.property(seeds, (seed) => {
        const a = runToEnd(createToySimulation(seed));
        const b = runToEnd(createToySimulation(seed));
        expect(canonicalJson(a.facts)).toBe(canonicalJson(b.facts));
      }),
      { numRuns: 30 },
    );
  });

  it('produces different lives for different seeds', () => {
    const a = runToEnd(createToySimulation('seed-a'));
    const b = runToEnd(createToySimulation('seed-b'));
    expect(canonicalJson(a.facts)).not.toBe(canonicalJson(b.facts));
  });

  it('keeps a valid, chronological journal with backward causes only', () => {
    fc.assert(
      fc.property(seeds, (seed) => {
        const { facts } = runToEnd(createToySimulation(seed));
        expect(checkJournalInvariants(facts, { complete: true })).toEqual([]);
      }),
      { numRuns: 30 },
    );
  });
});

describe('one canonical advancer', () => {
  it('gives the same facts and snapshot for fast-forward, year-by-year and one-event steps', () => {
    fc.assert(
      fc.property(seeds, (seed) => {
        const fast = runToEnd(createToySimulation(seed));
        const yearly = runYearByYear(createToySimulation(seed));
        const tiny = runInTinySteps(createToySimulation(seed));
        expect(canonicalJson(yearly.facts)).toBe(canonicalJson(fast.facts));
        expect(canonicalJson(tiny.facts)).toBe(canonicalJson(fast.facts));
        expect(canonicalJson(yearly.snapshot)).toBe(canonicalJson(fast.snapshot));
      }),
      { numRuns: 20 },
    );
  });

  it('resumes from a snapshot exactly where an uninterrupted run would be', () => {
    fc.assert(
      fc.property(seeds, fc.integer({ min: 1, max: 40 }), (seed, years) => {
        const whole = runToEnd(createToySimulation(seed));

        const first = createToySimulation(seed);
        first.advanceTo({ ...forever, targetDate: addYears('1970-06-15', years) });
        const saved = JSON.parse(JSON.stringify(first.snapshot())) as SimulationSnapshot;
        const restored = Simulation.restore(saved, {
          modules: toyModules(),
          dataPackVersions: { TOY: '1' },
        });
        restored.advanceTo(forever);

        expect(canonicalJson([...first.facts, ...restored.facts])).toBe(canonicalJson(whole.facts));
        expect(canonicalJson(restored.snapshot())).toBe(canonicalJson(whole.snapshot));
      }),
      { numRuns: 20 },
    );
  });

  it('stops on cancellation between events and can continue', () => {
    const simulation = createToySimulation('cancel');
    const result = simulation.advanceTo(forever, { cancelled: true });
    expect(result.stopReason).toBe('cancelled');
    expect(result.newFacts).toEqual([]);
    expect(canonicalJson(runToEnd(simulation).facts)).toBe(
      canonicalJson(runToEnd(createToySimulation('cancel')).facts),
    );
  });

  it('refuses to move the clock backwards', () => {
    const simulation = createToySimulation('clock');
    simulation.advanceTo({ ...forever, targetDate: '1980-01-01' });
    expect(() => simulation.advanceTo({ ...forever, targetDate: '1979-12-31' })).toThrow(
      /date-regression/,
    );
  });

  it('produces snapshots that satisfy the shared schema', () => {
    const simulation = createToySimulation('schema');
    simulation.advanceTo({ ...forever, targetDate: '1990-01-01' });
    expect(SimulationSnapshotSchema.safeParse(simulation.snapshot()).success).toBe(true);
  });
});

describe('death ends the run', () => {
  it('produces nothing after the protagonist dies', () => {
    fc.assert(
      fc.property(seeds, (seed) => {
        const simulation = createToySimulation(seed);
        const { facts, snapshot } = runToEnd(simulation);
        const death = facts.find((fact) => fact.type === 'toy.died');
        expect(death).toBeDefined();
        expect(facts.at(-1)).toBe(death);
        expect(snapshot.schedulerState).toMatchObject({ queue: [], ended: true });

        const again = simulation.advanceTo(forever);
        expect(again).toMatchObject({ stopReason: 'protagonist-died', newFacts: [] });
      }),
      { numRuns: 30 },
    );
  });
});

describe('atomic settlement', () => {
  function trapped(kind: TrapKind, seed = 'trap') {
    const simulation = createToySimulation(seed, { trap: { age: 3, kind } });
    simulation.advanceTo({ ...forever, targetDate: '1973-06-14' }); // 前一天
    return simulation;
  }

  function expectFailure(kind: TrapKind, code: string) {
    const simulation = trapped(kind);
    const before = canonicalJson(simulation.snapshot());
    let error: unknown;
    try {
      simulation.advanceTo(forever);
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(SimulationError);
    const failure = error as SimulationError;
    expect(failure.code).toBe(code);
    // 失败信息必须足以复现：种子、事件键、日期。
    expect(failure.message).toContain('seed=trap');
    expect(failure.message).toContain('at=1973-06-15');
    expect(failure.context.eventKey).toBeTruthy();
    // 失败的事件不留下任何状态，事件仍在队首，重试得到同样的错误。
    expect(canonicalJson(simulation.snapshot())).not.toContain('mutated-before-failure');
    expect(() => simulation.advanceTo(forever)).toThrow(SimulationError);
    return { simulation, failure, before };
  }

  it('rolls back a handler that throws midway', () => {
    const { failure } = expectFailure('throw', 'handler-failed');
    expect(failure.message).toContain('trap sprung');
  });

  it('detects an event that re-schedules an already processed key (cycle)', () => {
    expectFailure('cycle', 'duplicate-event-key');
  });

  it('detects a runaway same-day chain', () => {
    expectFailure('chain', 'chain-too-deep');
  });

  it('refuses to schedule into the past', () => {
    expectFailure('past', 'past-schedule');
  });

  it('refuses facts that cite unknown causes', () => {
    expectFailure('bad-cause', 'unknown-cause');
  });

  it('rejects states that break character invariants', () => {
    const { failure } = expectFailure('invalid-state', 'invariant-violation');
    expect(failure.details.join('\n')).toContain('Enrolled in tertiary');
  });

  it('runs module invariants before committing', () => {
    const { failure } = expectFailure('invariant', 'invariant-violation');
    expect(failure.details.join('\n')).toContain('toy.residence-is-a-place');
  });
});

describe('decisions', () => {
  /** 找一个能活到 18 岁的种子。 */
  function seedReaching18(): string {
    for (let index = 0; index < 500; index++) {
      const seed = `adult-${index}`;
      const simulation = createToySimulation(seed);
      simulation.advanceTo({ ...forever, targetDate: '1988-06-16' });
      if (!simulation.ended) return seed;
    }
    throw new Error('no seed reaches 18');
  }
  const seed = seedReaching18();

  it('pauses before a major decision and resumes with the player choice', () => {
    const simulation = createToySimulation(seed);
    const paused = simulation.advanceTo({ ...forever, stopAtMajorDecision: true });
    expect(paused.stopReason).toBe('major-decision');
    expect(paused.reachedDate).toBe('1988-06-15');
    const pending = paused.pendingDecision;
    expect(pending?.key).toBe(`toy.career|${TOY_ACTOR}|career`);
    // 知识权重 0.9、财富 0.2 的角色，代理会推荐读书。
    expect(pending?.recommended.optionId).toBe('study');
    expect(pending?.options.find((option) => option.id === 'emigrate')?.eligible).toBe(false);

    expect(() => simulation.decide(pending?.key ?? '', 'emigrate')).toThrow(/invalid-decision/);
    simulation.decide(pending?.key ?? '', 'work');
    simulation.advanceTo({ ...forever, stopAtMajorDecision: true });

    const decision = simulation.facts.find((fact) => fact.type === 'decision.made');
    expect(decision?.details).toMatchObject({ option: 'work', decidedBy: 'player' });
    const career = simulation.facts.find((fact) => fact.type === 'toy.career');
    expect(career?.outcomeCode).toBe('work');
    expect(career?.causeEventIds).toEqual([decision?.id]);
  });

  it('gives identical results for interactive play and a pre-recorded action sequence', () => {
    const interactive = createToySimulation(seed);
    const paused = interactive.advanceTo({ ...forever, stopAtMajorDecision: true });
    interactive.decide(paused.pendingDecision?.key ?? '', 'work');
    interactive.advanceTo({ ...forever, stopAtMajorDecision: true });

    const scripted = createToySimulation(seed, {
      decisions: { [`toy.career|${TOY_ACTOR}|career`]: 'work' },
    });
    scripted.advanceTo(forever);
    expect(canonicalJson(scripted.facts)).toBe(canonicalJson(interactive.facts));
  });

  it('lets life principles decide when the player does not intervene', () => {
    const simulation = createToySimulation(seed);
    simulation.advanceTo(forever);
    const decision = simulation.facts.find((fact) => fact.type === 'decision.made');
    expect(decision?.details).toMatchObject({
      option: 'study',
      decidedBy: 'principles',
      reason1: 'knowledge',
    });
  });
});

describe('guarantees added in the M1 audit', () => {
  function adultSeed(): string {
    for (let index = 0; index < 500; index++) {
      const seed = `impure-${index}`;
      const simulation = createToySimulation(seed);
      simulation.advanceTo({ ...forever, targetDate: '1988-06-16' });
      if (!simulation.ended) return seed;
    }
    throw new Error('no seed reaches 18');
  }

  it('rejects decision options that draw random numbers, both when pausing and when settling', () => {
    const seed = adultSeed();
    const paused = createToySimulation(seed, { impureDecision: true });
    expect(() => paused.advanceTo({ ...forever, stopAtMajorDecision: true })).toThrow(
      /impure-decision-options/,
    );
    const automatic = createToySimulation(seed, { impureDecision: true });
    expect(() => automatic.advanceTo(forever)).toThrow(/impure-decision-options/);
  });

  it('freezes committed facts so callers cannot rewrite the journal', () => {
    const simulation = createToySimulation('frozen');
    simulation.advanceTo({ ...forever, targetDate: '1975-01-01' });
    const fact = simulation.facts[0];
    expect(fact).toBeDefined();
    expect(Object.isFrozen(fact)).toBe(true);
    expect(() => {
      (fact as { outcomeCode: string }).outcomeCode = 'rewritten';
    }).toThrow(TypeError);
    expect(() => {
      (fact?.causeEventIds as string[]).push('fact:0');
    }).toThrow(TypeError);
  });
});
