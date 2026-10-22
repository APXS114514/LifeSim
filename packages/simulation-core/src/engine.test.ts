import {
  CharacterStateSchema,
  HouseholdAccountSchema,
  RelationshipsSchema,
  SimulationSnapshotSchema,
  checkJournalInvariants,
  type SimulationSnapshot,
} from '@lifesim/content-schema';
import fc from 'fast-check';
import { describe, expect, it, vi } from 'vitest';
import {
  FAR_FUTURE,
  HOBBY_KEY,
  TOY_ACTOR,
  TOY_PARENT_RELATIONSHIP,
  companionAccountId,
  companionId,
  createToySimulation,
  focusKey,
  makeActor,
  toyModules,
  type TrapKind,
} from './__fixtures__/toy-world.ts';
import { addYears } from './calendar.ts';
import { Simulation } from './engine.ts';
import { SimulationError } from './errors.ts';
import { canonicalJson } from './json.ts';
import type { SimulationModule, SimState } from './types.ts';

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

  it('rejects an invalid value written into a single field (incremental field check)', () => {
    const { failure } = expectFailure('invalid-field', 'invariant-violation');
    const details = failure.details.join('\n');
    // 报错信息来自整份 schema 的慢路径，与以前逐字相同。
    expect(details).toContain(`actor ${TOY_ACTOR}`);
    expect(details).toContain('wellbeing');
  });

  it('rejects an actor that gained a key outside the schema (strict object)', () => {
    const { failure } = expectFailure('extra-key', 'invariant-violation');
    const details = failure.details.join('\n');
    expect(details).toContain(`actor ${TOY_ACTOR}`);
    expect(details).toContain('Unrecognized key');
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

  it('still rejects an invalid change to an actor or account the event did not mainly touch', () => {
    for (const [kind, needle] of [
      ['invalid-companion', `actor ${companionId(0)}`],
      ['invalid-account', `account ${companionAccountId(0)}`],
    ] as const) {
      const simulation = createToySimulation('companions', {
        companions: 2,
        trap: { age: 3, kind },
      });
      simulation.advanceTo({ ...forever, targetDate: '1973-06-14' });
      let error: unknown;
      try {
        simulation.advanceTo(forever);
      } catch (caught) {
        error = caught;
      }
      expect(error).toBeInstanceOf(SimulationError);
      expect((error as SimulationError).code).toBe('invariant-violation');
      expect((error as SimulationError).details.join('\n')).toContain(needle);
      // 失败的事件没有提交：同伴与账户仍是出生时的合法状态，重试得到同样的错误。
      const snapshot = simulation.snapshot();
      expect(snapshot.actors.find((actor) => actor.id === companionId(0))?.education).toEqual({
        completed: 'none',
        enrolledIn: null,
        lastFactId: null,
      });
      expect(
        snapshot.householdAccounts.find((account) => account.id === companionAccountId(0))
          ?.balanceMinor,
      ).toBe(0);
      expect(() => simulation.advanceTo(forever)).toThrow(SimulationError);
    }
  });

  it('re-parses only the actors and accounts an event changed, not the whole cast (M3-035)', () => {
    const simulation = createToySimulation('companions', { companions: 5 });
    simulation.advanceTo({ ...forever, targetDate: '1972-01-01' });
    const actorParse = vi.spyOn(CharacterStateSchema, 'safeParse');
    const accountParse = vi.spyOn(HouseholdAccountSchema, 'safeParse');
    try {
      // 1972-06-15 的生日事件只抽随机数、写事实，不改任何角色或账户。
      const result = simulation.advanceTo({ ...forever, targetDate: '1972-06-15' });
      expect(result.newFacts.map((fact) => fact.type)).toEqual(['toy.birthday']);
      expect(actorParse).not.toHaveBeenCalled();
      expect(accountParse).not.toHaveBeenCalled();
    } finally {
      actorParse.mockRestore();
      accountParse.mockRestore();
    }
  });

  it('rejects an invalid relationship graph on the event that wrote it (M3-036)', () => {
    for (const [kind, needle] of [
      ['self-relationship', 'cannot link an actor to themselves'],
      ['bond-out-of-range', 'relationships:'],
      ['parent-cycle', 'must not form a cycle'],
    ] as const) {
      const simulation = createToySimulation('family', {
        companions: 2,
        family: true,
        trap: { age: 3, kind },
      });
      simulation.advanceTo({ ...forever, targetDate: '1973-06-14' });
      let error: unknown;
      try {
        simulation.advanceTo(forever);
      } catch (caught) {
        error = caught;
      }
      expect(error, kind).toBeInstanceOf(SimulationError);
      expect((error as SimulationError).code).toBe('invariant-violation');
      expect((error as SimulationError).details.join('\n')).toContain(needle);
      // 失败的事件没有提交：关系图仍是出生时那一条合法关系，重试得到同样的错误。
      const snapshot = simulation.snapshot();
      expect(snapshot.relationships.map((relationship) => relationship.id)).toEqual([
        TOY_PARENT_RELATIONSHIP,
      ]);
      expect(snapshot.relationships[0]?.bonds[TOY_ACTOR]?.trust).toBe(0.6);
      expect(() => simulation.advanceTo(forever)).toThrow(SimulationError);
    }
  });

  it('parses the relationship graph only when an event changes it (M3-036)', () => {
    const relationshipParse = vi.spyOn(RelationshipsSchema, 'safeParse');
    try {
      const simulation = createToySimulation('family', { companions: 2, family: true });
      // 出生事件写入了关系，必须校验过一次。
      expect(relationshipParse).toHaveBeenCalledTimes(1);
      relationshipParse.mockClear();
      simulation.advanceTo({ ...forever, targetDate: '1975-01-01' });
      expect(simulation.facts.length).toBeGreaterThan(1);
      expect(relationshipParse).not.toHaveBeenCalled();
    } finally {
      relationshipParse.mockRestore();
    }
  });

  it('gives the same facts and snapshot with or without companions for the protagonist', () => {
    const alone = runToEnd(createToySimulation('companions'));
    const withCompanions = runToEnd(createToySimulation('companions', { companions: 3 }));
    expect(canonicalJson(withCompanions.facts)).toBe(canonicalJson(alone.facts));
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

describe('preset choices and pause policy (ADR-0008, M3-037A)', () => {
  function decisionFacts(simulation: Simulation, type: string) {
    return simulation.facts.filter(
      (fact) => fact.type === 'decision.made' && fact.details?.['decision'] === type,
    );
  }

  /** 一个活过 18 岁的种子（toy world 的死亡是随机的）。 */
  function adult(): string {
    for (let index = 0; index < 500; index++) {
      const seed = `adr8-${index}`;
      const simulation = createToySimulation(seed, { choices: true });
      simulation.advanceTo({ ...forever, targetDate: '1988-06-16' });
      if (!simulation.ended) return seed;
    }
    throw new Error('no seed reaches 18');
  }

  it('adopts a preset and records it as decided by preset', () => {
    const simulation = createToySimulation('adr8-preset', { choices: true });
    simulation.preset(focusKey(3), 'study');
    simulation.advanceTo({ ...forever, targetDate: '1973-06-15' });
    const fact = decisionFacts(simulation, 'toy.focus').find((f) => f.at === '1973-06-15');
    expect(fact?.details?.['option']).toBe('study');
    expect(fact?.details?.['decidedBy']).toBe('preset');
    expect(fact?.details).not.toHaveProperty('presetIgnored');
  });

  it('falls back to life principles when a preset is no longer eligible, without throwing', () => {
    const simulation = createToySimulation('adr8-fallback', { choices: true });
    simulation.preset(focusKey(5), 'work'); // 5 岁不能选「工作」
    simulation.advanceTo({ ...forever, targetDate: '1975-06-15' });
    const fact = decisionFacts(simulation, 'toy.focus').find((f) => f.at === '1975-06-15');
    expect(fact?.details?.['decidedBy']).toBe('principles');
    expect(fact?.details?.['presetIgnored']).toBe('work');
    expect(fact?.details?.['option']).not.toBe('work');
  });

  it('lets a preset be changed or cleared before the event, and refuses invalid keys', () => {
    const simulation = createToySimulation('adr8-edit', { choices: true });
    simulation.preset(focusKey(2), 'study');
    simulation.preset(focusKey(2), 'rest');
    simulation.preset(focusKey(4), 'study');
    simulation.preset(focusKey(4), null);
    simulation.advanceTo({ ...forever, targetDate: '1974-06-15' });
    const byDate = new Map(decisionFacts(simulation, 'toy.focus').map((f) => [f.at, f.details]));
    expect(byDate.get('1972-06-15')?.['option']).toBe('rest');
    expect(byDate.get('1972-06-15')?.['decidedBy']).toBe('preset');
    expect(byDate.get('1974-06-15')?.['decidedBy']).toBe('principles');

    for (const [key, code] of [
      [focusKey(2), 'invalid-decision'], // 已处理
      ['toy.unknown|char:toy|age:30', 'invalid-decision'], // 未注册的类型
      [`toy.birthday|${TOY_ACTOR}|age:30`, 'invalid-decision'], // 不是决策事件
      ['not-a-key', 'invalid-decision'],
    ] as const) {
      let error: unknown;
      try {
        simulation.preset(key, 'rest');
      } catch (caught) {
        error = caught;
      }
      expect(error, key).toBeInstanceOf(SimulationError);
      expect((error as SimulationError).code).toBe(code);
    }
  });

  it('pauses before ordinary decisions only when asked to, and never before background ones', () => {
    const seed = adult();
    const major = createToySimulation(seed, { choices: true });
    const first = major.advanceTo({ ...forever, stopAtMajorDecision: true });
    expect(first.pendingDecision?.type).toBe('toy.career');

    const all = createToySimulation(seed, { choices: true });
    const stop = all.advanceTo({ ...forever, stopAtMajorDecision: true, pauseOn: 'all' });
    expect(stop.stopReason).toBe('major-decision');
    expect(stop.pendingDecision?.key).toBe(HOBBY_KEY);
    expect(all.clock).toBe('1980-06-15');
    expect(all.pendingDecision()).toBeNull(); // 只看重大决定时，普通决定不算待决
    expect(all.pendingDecision('all')?.key).toBe(HOBBY_KEY);
    // 年度重点是 background：1—10 岁的十个生日都没有停下来（10 岁当天重点的优先级 15 先于爱好的 16）。
    expect(decisionFacts(all, 'toy.focus')).toHaveLength(10);

    all.decide(HOBBY_KEY, 'music');
    const next = all.advanceTo({ ...forever, stopAtMajorDecision: true, pauseOn: 'all' });
    expect(next.pendingDecision?.type).toBe('toy.career');
    const hobby = decisionFacts(all, 'toy.hobby')[0];
    expect(hobby?.details?.['decidedBy']).toBe('player');
    expect(hobby?.details?.['option']).toBe('music');
  });

  it('keeps presets in snapshots until used and restores snapshots that have none', () => {
    const simulation = createToySimulation('adr8-snap', { choices: true });
    simulation.preset(focusKey(6), 'study');
    simulation.preset(focusKey(2), 'rest');
    simulation.advanceTo({ ...forever, targetDate: '1971-01-01' });
    const saved = simulation.snapshot();
    expect(saved.schedulerState).toMatchObject({
      presets: { [focusKey(2)]: 'rest', [focusKey(6)]: 'study' },
    });
    const restored = Simulation.restore(
      SimulationSnapshotSchema.parse(JSON.parse(JSON.stringify(saved))),
      {
        modules: toyModules({ choices: true }),
        dataPackVersions: { TOY: '1' },
      },
    );
    restored.advanceTo({ ...forever, targetDate: '1977-01-01' });
    simulation.advanceTo({ ...forever, targetDate: '1977-01-01' });
    expect(canonicalJson(restored.facts)).toBe(
      canonicalJson(simulation.facts.filter((fact) => fact.at >= '1971-01-01')),
    );
    // 用过的预设不再留在快照里；没有预设时快照里没有这个字段（旧快照的形状）。
    expect(canonicalJson(simulation.snapshot().schedulerState)).not.toContain('presets');
    const plain = createToySimulation('adr8-plain').snapshot();
    expect(plain.schedulerState).not.toHaveProperty('presets');
    expect(() =>
      Simulation.restore(plain, { modules: toyModules(), dataPackVersions: { TOY: '1' } }),
    ).not.toThrow();
  });

  it('gives identical lives for the same presets, whether played year by year or fast-forwarded', () => {
    const choice = fc.constantFrom('rest', 'study', 'work');
    fc.assert(
      fc.property(
        seeds,
        fc.dictionary(fc.integer({ min: 1, max: 40 }).map(String), choice, { maxKeys: 12 }),
        (seed, presets) => {
          const make = () => {
            const simulation = createToySimulation(seed, { choices: true });
            for (const [age, option] of Object.entries(presets)) {
              simulation.preset(focusKey(Number(age)), option);
            }
            return simulation;
          };
          const fast = runToEnd(make());
          const again = runToEnd(make());
          const yearly = runYearByYear(make());
          expect(canonicalJson(again.facts)).toBe(canonicalJson(fast.facts));
          expect(canonicalJson(yearly.facts)).toBe(canonicalJson(fast.facts));
          expect(canonicalJson(yearly.snapshot)).toBe(canonicalJson(fast.snapshot));
        },
      ),
      { numRuns: 40 },
    );
  });
});

describe('copy-on-write transactions in the kernel (ADR-0011)', () => {
  type Probe = 'leak' | 'nan' | 'nan-and-invalid';
  /** 处理器留在外面的引用：草稿里的角色与状态，以及它自己新建后放进状态的对象。 */
  interface Leaked {
    actor?: { currentResidenceId: string };
    state?: SimState;
    own?: { note: string };
  }

  /** 夹具：出生后第二天跑一次 `probe.write`，按 payload 做不同的写入。 */
  function probeSimulation(probe: Probe, leaked: Leaked = {}): Simulation {
    const module: SimulationModule = {
      id: 'probe',
      events: [
        {
          type: 'probe.birth',
          version: 1,
          priority: 0,
          handle(ctx) {
            ctx.state.actors.push(makeActor(TOY_ACTOR, ctx.at));
            ctx.emit({ type: 'probe.born', outcomeCode: 'born', actorIds: [TOY_ACTOR] });
            ctx.schedule({
              type: 'probe.write',
              at: '1970-06-16',
              entityId: TOY_ACTOR,
              period: 'write',
              payload: probe,
            });
          },
        },
        {
          type: 'probe.write',
          version: 1,
          priority: 0,
          handle(ctx) {
            const actor = ctx.actor(TOY_ACTOR);
            switch (ctx.occurrence.payload) {
              case 'leak': {
                const own = { note: 'kept' };
                ctx.state.world = { own };
                actor.currentResidenceId = 'place:moved';
                leaked.actor = actor;
                leaked.state = ctx.state;
                leaked.own = own;
                break;
              }
              case 'nan':
                ctx.state.world = { counter: Number.NaN };
                break;
              case 'nan-and-invalid':
                ctx.state.world = { counter: Number.NaN };
                actor.education = { completed: 'none', enrolledIn: 'tertiary', lastFactId: null };
                break;
              default:
                break;
            }
            ctx.emit({ type: 'probe.wrote', outcomeCode: 'wrote', actorIds: [TOY_ACTOR] });
          },
        },
      ],
    };
    return Simulation.create({
      seed: 'probe',
      modules: [module],
      genesis: { type: 'probe.birth', at: '1970-06-15', entityId: TOY_ACTOR, payload: null },
      activeCharacterId: TOY_ACTOR,
      dataPackVersions: { TOY: '1' },
    });
  }

  function failureOf(simulation: Simulation): SimulationError {
    let error: unknown;
    try {
      simulation.advanceTo({ ...forever, targetDate: '1970-06-17' });
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(SimulationError);
    return error as SimulationError;
  }

  it('leaves no handler-held reference able to change committed state', () => {
    const leaked: Leaked = {};
    const simulation = probeSimulation('leak', leaked);
    simulation.advanceTo({ ...forever, targetDate: '1970-06-17' });
    const committed = canonicalJson(simulation.snapshot());
    expect(simulation.snapshot().world).toEqual({ own: { note: 'kept' } });
    expect(simulation.snapshot().actors[0]?.currentResidenceId).toBe('place:moved');
    // 草稿在事务关闭时被撤销：再读写都报错。
    expect(() => {
      if (leaked.actor) leaked.actor.currentResidenceId = 'place:after-commit';
    }).toThrow(TypeError);
    expect(() => leaked.state?.actors).toThrow(TypeError);
    // 处理器自己新建的对象在提交时被复制：之后再改它，已提交的状态不受影响。
    expect(leaked.own).toBeDefined();
    if (leaked.own) leaked.own.note = 'changed';
    expect(canonicalJson(simulation.snapshot())).toBe(committed);
  });

  it('rejects a non-JSON value after the regular checks and rolls the event back', () => {
    const simulation = probeSimulation('nan');
    const before = canonicalJson(simulation.snapshot());
    const failure = failureOf(simulation);
    expect(failure.code).toBe('handler-failed');
    expect(failure.message).toContain('Non-finite number at $.world.counter');
    expect(failure.context.eventKey).toBeTruthy();
    expect(simulation.snapshot().world).toEqual({});
    expect(canonicalJson(simulation.snapshot())).toBe(before);
    // 事件仍在队首，重试得到同样的错误。
    expect(failureOf(simulation).code).toBe('handler-failed');
  });

  it('keeps the original error code when a schema violation comes with a non-JSON value', () => {
    const simulation = probeSimulation('nan-and-invalid');
    const failure = failureOf(simulation);
    expect(failure.code).toBe('invariant-violation');
    expect(failure.details.join('\n')).toContain('Enrolled in tertiary');
    expect(simulation.snapshot().world).toEqual({});
  });
});
