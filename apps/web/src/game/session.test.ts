import { canonicalJson } from '@lifesim/simulation-core';
import { describe, expect, it, vi } from 'vitest';
import { GameSession, parseGameSave } from './session.ts';

const request = {
  seed: 'ui-0',
  region: 'JP' as const,
  year: 1978 as const,
  birthDate: '1978-05-04',
};

describe('GameSession', () => {
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
