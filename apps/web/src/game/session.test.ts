import { canonicalJson, SchedulerStateSchema, Simulation } from '@lifesim/simulation-core';
import { describe, expect, it, vi } from 'vitest';
import { FOCUS_PRESET_MAX_AGE, GameSession, parseGameSave } from './session.ts';

const request = {
  seed: 'ui-0',
  region: 'JP' as const,
  year: 1978 as const,
  birthDate: '1978-05-04',
};

describe('GameSession', () => {
  it.each([false, true])(
    'keeps committed facts recoverable after a later event fails (restored=%s)',
    (restoreFirst) => {
      let session = GameSession.create({ ...request, seed: 'review-error' });
      session.settleBirthDay();
      if (restoreFirst) session = GameSession.restore(session.serialize());
      const mortality = session.region.mortalityQ.bind(session.region);
      // 测试夹具：入学事实提交后，让同一天的健康检查失败。
      const failure = vi.spyOn(session.region, 'mortalityQ').mockImplementation((year, age) => {
        if (age === 7) throw new Error('fixture-health-table-unavailable');
        return mortality(year, age);
      });
      try {
        for (let age = 1; age < 7; age += 1) session.stepYear();
        expect(() => session.stepYear()).toThrow('fixture-health-table-unavailable');
        expect(session.facts).toHaveLength(session.simulation.lastSequence + 1);
        const restored = GameSession.restore(
          parseGameSave(JSON.parse(JSON.stringify(session.serialize()))),
        );
        expect(restored.facts).toEqual(session.facts);
        restored.finish();
        const uninterrupted = GameSession.create({ ...request, seed: 'review-error' });
        uninterrupted.finish();
        expect(canonicalJson(restored.facts)).toBe(canonicalJson(uninterrupted.facts));
      } finally {
        failure.mockRestore();
      }
    },
  );

  it('advances to a major decision and applies a player choice', () => {
    const session = GameSession.create(request);
    session.advance();
    expect(session.pending?.type).toBe('choice.after-secondary');
    expect(session.pending?.options.map((option) => option.id)).toContain('start-work');
    session.choose('start-work');
    expect(session.facts.some((fact) => String(fact.details?.['option']) === 'start-work')).toBe(
      true,
    );
  });

  it('finishes a complete life and summarizes it', () => {
    const session = GameSession.create(request);
    session.advance();
    session.finish();
    expect(session.isEnded).toBe(true);
    const summary = session.summary;
    expect(summary.ageAtDeath).not.toBeNull();
    expect(summary.factCount).toBeGreaterThan(10);
  });

  it('round-trips through a save without changing the future', () => {
    const original = GameSession.create(request);
    original.advance();
    const saved = parseGameSave(JSON.parse(JSON.stringify(original.serialize())));
    const restored = GameSession.restore(saved);
    expect(restored.facts).toEqual(original.facts);
    expect(restored.pending?.key).toBe(original.pending?.key);

    original.finish();
    restored.finish();
    expect(JSON.stringify(restored.facts)).toBe(JSON.stringify(original.facts));
  });

  it('renders every fact in both UI languages', () => {
    const session = GameSession.create(request);
    session.finish();
    for (const fact of session.facts) {
      expect(session.render(fact, 'zh-Hans').length).toBeGreaterThan(0);
      expect(session.render(fact, 'en').length).toBeGreaterThan(0);
    }
  });
});

describe('progressive play (M3-034)', () => {
  const stepRequest = {
    seed: 'ui-step',
    region: 'JP' as const,
    year: 1978 as const,
    birthDate: '1978-05-04',
  };

  /** 开局并结算出生当天（界面点「开始人生」后调用的路径）。 */
  function fresh(seed: string, birthDate?: string): GameSession {
    const session = GameSession.create({
      ...stepRequest,
      seed,
      ...(birthDate ? { birthDate } : {}),
    });
    session.settleBirthDay();
    return session;
  }

  it('starts paused on the birth day with the birth and family facts', () => {
    const session = fresh('ui-start');
    expect(session.clock).toBe(session.birth.birthDate);
    expect(session.currentDate).toBe(session.birth.birthDate);
    expect(session.age).toBe(0);
    expect(session.pending).toBeNull();
    expect(session.facts[0]?.type).toBe('life.birth');
    expect(session.facts.filter((fact) => fact.type === 'family.parent')).toHaveLength(2);
  });

  it('advances exactly one birthday per step, even through years without new facts', () => {
    const session = fresh('ui-yearly');
    const seen: string[] = [];
    for (let step = 1; step <= 10; step += 1) {
      const result = session.stepYear();
      expect(result.stopReason).not.toBe('major-decision');
      expect(result.clock).toBe(session.clock);
      expect(session.age).toBe(step);
      seen.push(result.clock);
    }
    const expected: string[] = [];
    for (let step = 1; step <= 10; step += 1) {
      const [year] = stepRequest.birthDate.split('-');
      expected.push(`${Number(year) + step}-${stepRequest.birthDate.slice(5)}`);
    }
    expect(seen).toEqual(expected);
    // 没有新事实的年份也要前进：出生当年之后的头一年几乎没有事件。
    expect(session.clock).toBe(expected.at(-1));
  });

  it('keeps the leap-day rule: 2 月 29 日出生者在平年落在 2 月 28 日', () => {
    const session = GameSession.create({
      ...stepRequest,
      seed: 'ui-leap',
      year: 2000,
      birthDate: '2000-02-29',
    });
    session.settleBirthDay();
    const stops: string[] = [];
    for (let step = 0; step < 5; step += 1) stops.push(session.stepYear().clock);
    expect(stops).toEqual(['2001-02-28', '2002-02-28', '2003-02-28', '2004-02-29', '2005-02-28']);
  });

  it('stops before a major decision, adds nothing while waiting, and only settles that day', () => {
    const session = fresh('ui-decide');
    let result = session.stepYear();
    for (let step = 0; step < 40 && result.stopReason !== 'major-decision'; step += 1) {
      result = session.stepYear();
    }
    expect(result.stopReason).toBe('major-decision');
    expect(session.pending).not.toBeNull();
    expect(session.facts.every((fact) => fact.at <= session.clock)).toBe(true);
    expect(session.clock).toBe(session.pending?.at);

    const before = session.facts.length;
    const waiting = session.stepYear();
    expect(waiting.stopReason).toBe('major-decision');
    expect(waiting.newFacts).toEqual([]);
    expect(session.facts).toHaveLength(before);

    const decisionAt = session.clock;
    session.choose(session.pending?.recommended.optionId ?? 'start-work');
    expect(session.clock).toBe(decisionAt);
    expect(session.facts.every((fact) => fact.at <= decisionAt)).toBe(true);
    expect(session.pending).toBeNull();
  });

  it('gives byte-identical lives for year-by-year, fast-forward and mixed play', () => {
    function playByYears(seed: string): GameSession {
      const session = fresh(seed);
      while (!session.isEnded) {
        if (session.pending) {
          session.choose(session.pending.recommended.optionId);
          continue;
        }
        session.stepYear();
      }
      return session;
    }
    function playByFastForward(seed: string): GameSession {
      const session = fresh(seed);
      while (!session.isEnded) {
        if (session.pending) {
          session.choose(session.pending.recommended.optionId);
          continue;
        }
        session.advanceToNextDecision();
      }
      return session;
    }
    function playMixed(seed: string): GameSession {
      const session = fresh(seed);
      for (let step = 0; step < 10; step += 1) session.stepYear();
      while (!session.isEnded) {
        if (session.pending) {
          session.choose(session.pending.recommended.optionId);
          continue;
        }
        session.advanceToNextDecision();
      }
      return session;
    }
    const seed = 'ui-equivalence';
    const years = playByYears(seed);
    const fast = playByFastForward(seed);
    const mixed = playMixed(seed);
    expect(years.isEnded).toBe(true);
    expect(canonicalJson(years.facts)).toBe(canonicalJson(fast.facts));
    expect(canonicalJson(mixed.facts)).toBe(canonicalJson(fast.facts));
    expect(canonicalJson(years.simulation.snapshot())).toBe(
      canonicalJson(fast.simulation.snapshot()),
    );
    expect(canonicalJson(mixed.simulation.snapshot())).toBe(
      canonicalJson(fast.simulation.snapshot()),
    );
  });

  it('never simulates past the next anniversary', () => {
    const session = fresh('ui-lookahead');
    const targets: string[] = [];
    const original = session.simulation.advanceTo.bind(session.simulation);
    vi.spyOn(session.simulation, 'advanceTo').mockImplementation((request, cancellation) => {
      targets.push(request.targetDate);
      return original(request, cancellation);
    });
    for (let step = 0; step < 6; step += 1) {
      const limit = session.nextAnniversary();
      session.stepYear();
      expect(targets.every((target) => target <= limit)).toBe(true);
      targets.length = 0;
    }
  });

  it('round-trips a mid-life save and keeps playing identically', () => {
    const original = fresh('ui-save');
    for (let step = 0; step < 12; step += 1) original.stepYear();
    const saved = parseGameSave(JSON.parse(JSON.stringify(original.serialize())));
    const restored = GameSession.restore(saved);
    expect(restored.clock).toBe(original.clock);
    expect(restored.facts).toEqual(original.facts);
    expect(restored.pending?.key).toBe(original.pending?.key);

    original.finish();
    restored.finish();
    expect(canonicalJson(restored.facts)).toBe(canonicalJson(original.facts));
    expect(canonicalJson(restored.simulation.snapshot())).toBe(
      canonicalJson(original.simulation.snapshot()),
    );
  });

  it('rejects a save whose facts do not match the snapshot journal', () => {
    const session = fresh('ui-tamper');
    const tampered = JSON.parse(JSON.stringify(session.serialize())) as {
      facts: { sequence: number }[];
    };
    tampered.facts = tampered.facts.slice(0, -1);
    expect(() => GameSession.restore(tampered as never)).toThrow();
  });
});

describe('pending decision guard (M3-040)', () => {
  const guardRequest = {
    seed: 'ui-guard',
    region: 'JP' as const,
    year: 1978 as const,
    birthDate: '1978-05-04',
  };

  /**
   * 测试夹具：把队首伪装成一个排在 `clock` 之后的重大决定（不是真实规则），
   * 用来验证界面不会提前显示未来日期的决定。
   */
  function fixtureFutureDecision(clock: string): NonNullable<GameSession['pending']> {
    return {
      key: 'fixture.future-major',
      type: 'fixture.future-major',
      at: `${Number(clock.slice(0, 4)) + 1}${clock.slice(4)}`,
      actorId: 'protagonist',
      options: [],
      recommended: { optionId: 'fixture-option', reasons: [] },
    };
  }

  function fresh(seed: string): GameSession {
    const session = GameSession.create({ ...guardRequest, seed });
    session.settleBirthDay();
    return session;
  }

  it('does not surface a major decision scheduled after the clock while stepping years', () => {
    const session = fresh('ui-guard-future');
    expect(session.pending).toBeNull();
    const firstAnniversary = session.nextAnniversary();
    const birthClock = session.clock;

    // 测试夹具：advanceTo 执行期间让内核按原实现判断队首（否则推进本身会坏），
    // 其余时候把队首伪装成排在当前时钟之后的重大决定。
    let inAdvance = false;
    const advance = session.simulation.advanceTo.bind(session.simulation);
    vi.spyOn(session.simulation, 'advanceTo').mockImplementation((request, cancellation) => {
      inAdvance = true;
      try {
        return advance(request, cancellation);
      } finally {
        inAdvance = false;
      }
    });
    const original = session.simulation.pendingDecision.bind(session.simulation);
    vi.spyOn(session.simulation, 'pendingDecision').mockImplementation(() =>
      inAdvance ? original() : fixtureFutureDecision(session.clock),
    );

    const first = session.stepYear();
    expect(first.stopReason).not.toBe('major-decision');
    expect(first.clock).toBe(firstAnniversary);
    expect(session.clock).toBe(firstAnniversary);
    expect(session.clock).not.toBe(birthClock);
    expect(session.pending).toBeNull();

    // 未来日期的决定不得卡住推进：年龄逐年增加，而不是原地重复停在「待决」。
    for (let step = 2; step <= 6; step += 1) {
      const result = session.stepYear();
      expect(result.stopReason).not.toBe('major-decision');
      expect(session.pending).toBeNull();
      expect(session.age).toBe(step);
    }
  });

  it('does not surface a future-dated decision when restoring a save', () => {
    const session = fresh('ui-guard-restore');
    for (let step = 0; step < 6; step += 1) session.stepYear();
    expect(session.pending).toBeNull();
    const saved = parseGameSave(JSON.parse(JSON.stringify(session.serialize())));

    // 测试夹具：读档期间队首是一个排在会话时钟之后的重大决定。
    const spy = vi.spyOn(Simulation.prototype, 'pendingDecision');
    spy.mockImplementation(function (this: Simulation) {
      return fixtureFutureDecision(this.clock);
    });
    try {
      const restored = GameSession.restore(saved);
      expect(restored.clock).toBe(session.clock);
      expect(restored.facts).toEqual(session.facts);
      expect(restored.pending).toBeNull();
    } finally {
      spy.mockRestore();
    }
  });

  it('keeps a decision that is scheduled on the current clock across a save round-trip', () => {
    const session = fresh('ui-guard-decision');
    let result = session.stepYear();
    for (let step = 0; step < 40 && result.stopReason !== 'major-decision'; step += 1) {
      result = session.stepYear();
    }
    expect(result.stopReason).toBe('major-decision');
    expect(session.pending).not.toBeNull();
    expect(session.pending?.at).toBe(session.clock);

    const saved = parseGameSave(JSON.parse(JSON.stringify(session.serialize())));
    const restored = GameSession.restore(saved);
    expect(restored.clock).toBe(session.clock);
    expect(restored.pending).not.toBeNull();
    expect(restored.pending?.key).toBe(session.pending?.key);
    expect(restored.pending?.at).toBe(restored.clock);
  });
});

it('saves optional reflections, restores legacy saves and salvages damaged entries', () => {
  const session = GameSession.create(request);
  const record = {
    node: 5 as const,
    at: session.clock,
    option: 'home',
    note: '  你好  ',
    status: 'answered' as const,
  };
  expect(session.recordReflection(record)).toBe(true);
  const records = session.reflections;
  expect(session.recordReflection({ ...record, note: 'duplicate' })).toBe(false);
  expect(session.reflections).toBe(records);
  const save = session.serialize();
  expect(save.reflections).toEqual([{ ...record, note: '你好' }]);
  expect(GameSession.restore(parseGameSave(save)).reflections).toEqual(session.reflections);
  delete save.reflections;
  expect(GameSession.restore(parseGameSave(save)).reflections).toEqual([]);
  for (const reflections of ['x', [{ node: 99 }], [{ node: 5, status: 'wat' }]])
    expect(GameSession.restore(parseGameSave({ ...save, reflections })).reflections).toEqual([]);
});

it('keeps authoritative facts, clock and snapshots byte-identical with or without reflections', () => {
  const a = GameSession.create(request),
    b = GameSession.create(request);
  for (let age = 1; age <= 15; age += 1) {
    a.stepYear();
    b.stepYear();
    if (age === 5 || age === 15)
      a.recordReflection({
        node: age,
        at: a.clock,
        option: null,
        note: '本机留言',
        status: 'answered',
      });
    expect(a.clock).toBe(b.clock);
    expect(canonicalJson(a.simulation.snapshot())).toBe(canonicalJson(b.simulation.snapshot()));
    expect(canonicalJson(a.facts)).toBe(canonicalJson(b.facts));
  }
  a.finish();
  b.finish();
  expect(canonicalJson(a.facts)).toBe(canonicalJson(b.facts));
  expect(canonicalJson(a.simulation.snapshot())).toBe(canonicalJson(b.simulation.snapshot()));
});

describe('yearly focus selector (M3-037B)', () => {
  const focusRequest = {
    seed: 'ui-focus',
    region: 'JP' as const,
    year: 1978 as const,
    birthDate: '1978-05-04',
  };

  function fresh(seed: string): GameSession {
    const session = GameSession.create({ ...focusRequest, seed });
    session.settleBirthDay();
    return session;
  }

  /** 按年龄取主角的年度重点事实细节。 */
  function focusByAge(session: GameSession): Map<number, Record<string, unknown>> {
    const byAge = new Map<number, Record<string, unknown>>();
    for (const fact of session.facts) {
      if (fact.type !== 'decision.made' || fact.details?.['decision'] !== 'choice.yearly-focus')
        continue;
      byAge.set(Number(fact.at.slice(0, 4)) - 1978, { ...fact.details });
    }
    return byAge;
  }

  function presetsOf(session: GameSession): Record<string, string> {
    return SchedulerStateSchema.parse(session.serialize().snapshot.schedulerState).presets ?? {};
  }

  function stepYears(session: GameSession, years: number): void {
    for (let step = 0; step < years && !session.isEnded;) {
      if (session.pending) {
        session.choose(session.pending.recommended.optionId);
        continue;
      }
      session.stepYear();
      step += 1;
    }
  }

  it('starts with the age-0 focus decided by principles and offers next year', () => {
    const session = fresh('focus-start');
    const plan = session.focusPlan();
    expect(plan.current).toMatchObject({ age: 0, decidedBy: 'principles', presetIgnored: null });
    expect(plan.fromAge).toBe(1);
    expect(plan.selected).toBeNull();
    // 1 岁时学习与工作都不可选；其余四项始终可选。
    expect(plan.eligibleNow).toEqual({
      balanced: true,
      study: false,
      work: false,
      health: true,
      family: true,
      leisure: true,
    });
  });

  it('applies a standing focus from the next birthday until it is changed back', () => {
    const session = fresh('focus-standing');
    session.setFocus('health');
    expect(session.focusPlan().selected).toBe('health');
    stepYears(session, 3);
    const byAge = focusByAge(session);
    expect(byAge.get(0)).toMatchObject({ decidedBy: 'principles' });
    for (const age of [1, 2, 3]) {
      expect(byAge.get(age)).toMatchObject({ option: 'health', decidedBy: 'preset' });
    }
    expect(session.focusPlan()).toMatchObject({
      current: { age: 3, focus: 'health', decidedBy: 'preset' },
      fromAge: 4,
      selected: 'health',
    });
    session.setFocus(null);
    expect(session.focusPlan().selected).toBeNull();
    stepYears(session, 2);
    expect(focusByAge(session).get(4)).toMatchObject({ decidedBy: 'principles' });
    expect(focusByAge(session).get(5)).toMatchObject({ decidedBy: 'principles' });
  });

  it('falls back to principles while the standing focus is not yet eligible', () => {
    const session = fresh('focus-study');
    session.setFocus('study');
    stepYears(session, 6);
    const byAge = focusByAge(session);
    for (const age of [1, 2, 3, 4, 5]) {
      expect(byAge.get(age)).toMatchObject({ decidedBy: 'principles', presetIgnored: 'study' });
    }
    expect(byAge.get(6)).toMatchObject({ option: 'study', decidedBy: 'preset' });
    expect(byAge.get(6)).not.toHaveProperty('presetIgnored');
    // 回退的那几年在面板上如实显示。
    const earlier = fresh('focus-study');
    earlier.setFocus('study');
    stepYears(earlier, 1);
    expect(earlier.focusPlan().current).toMatchObject({
      age: 1,
      decidedBy: 'principles',
      presetIgnored: 'study',
    });
  });

  it('writes one preset per remaining year and keeps the choice across a save', () => {
    const original = fresh('focus-save');
    original.setFocus('family');
    stepYears(original, 4);
    const presets = presetsOf(original);
    expect(Object.keys(presets)).toHaveLength(FOCUS_PRESET_MAX_AGE - 4);
    expect(new Set(Object.values(presets))).toEqual(new Set(['family']));
    const restored = GameSession.restore(
      parseGameSave(JSON.parse(JSON.stringify(original.serialize()))),
    );
    expect(restored.focusPlan()).toEqual(original.focusPlan());
    original.finish();
    restored.finish();
    expect(canonicalJson(restored.facts)).toBe(canonicalJson(original.facts));
    // 主角去世时内核清除剩余预设。
    expect(presetsOf(original)).toEqual({});
    expect(original.serialize().snapshot.schedulerState).not.toHaveProperty('presets');
    expect(() => {
      original.setFocus('health');
    }).toThrow();
  });

  it('gives byte-identical lives with a standing focus for year-by-year, fast-forward and finish', () => {
    const seed = 'focus-equivalence';
    const byYears = fresh(seed);
    byYears.setFocus('work');
    stepYears(byYears, 200);
    const fast = fresh(seed);
    fast.setFocus('work');
    while (!fast.isEnded) {
      if (fast.pending) fast.choose(fast.pending.recommended.optionId);
      else fast.advanceToNextDecision();
    }
    const finished = fresh(seed);
    finished.setFocus('work');
    finished.finish();
    expect(byYears.isEnded).toBe(true);
    expect(canonicalJson(byYears.facts)).toBe(canonicalJson(fast.facts));
    expect(canonicalJson(finished.facts)).toBe(canonicalJson(fast.facts));
    expect(canonicalJson(byYears.simulation.snapshot())).toBe(
      canonicalJson(fast.simulation.snapshot()),
    );
    // 「工作」在成年后确实按设定生效。
    expect(
      [...focusByAge(fast).values()].some((details) => details['decidedBy'] === 'preset'),
    ).toBe(true);
  });

  it('leaves years that were already settled untouched', () => {
    const session = fresh('focus-past');
    stepYears(session, 3);
    const before = canonicalJson(session.facts);
    session.setFocus('leisure');
    expect(canonicalJson(session.facts)).toBe(before);
    expect(session.focusPlan().fromAge).toBe(4);
    const presets = presetsOf(session);
    expect(Object.keys(presets).some((key) => /\|age:[0-3]$/.test(key))).toBe(false);
  });
});
