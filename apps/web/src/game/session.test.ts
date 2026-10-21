import { canonicalJson, Simulation } from '@lifesim/simulation-core';
import { describe, expect, it, vi } from 'vitest';
import { GameSession, parseGameSave } from './session.ts';

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
