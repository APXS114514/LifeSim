import { describe, expect, it } from 'vitest';
import { GameSession, parseGameSave } from './session.ts';
import { DEFAULT_SPEED, TimeControl, type TimerScheduler } from './time-control.ts';

const request = {
  seed: 'ui-0',
  region: 'JP' as const,
  year: 1978 as const,
  birthDate: '1978-05-04',
};

/** 测试夹具：可手动推进的假计时器，不使用真实时间。 */
class FakeTimer implements TimerScheduler {
  readonly #queue: { fn: () => void; ms: number; cancelled: boolean }[] = [];

  schedule(fn: () => void, ms: number): () => void {
    const entry = { fn, ms, cancelled: false };
    this.#queue.push(entry);
    return () => {
      entry.cancelled = true;
    };
  }

  /** 尚未取消的计时器数量。 */
  get pending(): number {
    return this.#queue.filter((entry) => !entry.cancelled).length;
  }

  /** 最近一次安排的间隔（毫秒）。 */
  get lastDelay(): number {
    return this.#queue.at(-1)?.ms ?? 0;
  }

  /** 触发最早的一个未取消计时器；没有可触发时返回 false。 */
  tick(): boolean {
    const entry = this.#queue.find((candidate) => !candidate.cancelled);
    if (!entry) return false;
    entry.cancelled = true;
    entry.fn();
    return true;
  }
}

function setup(seed = 'ui-control') {
  const session = GameSession.create({ ...request, seed });
  session.settleBirthDay();
  const scheduler = new FakeTimer();
  const control = new TimeControl({ session, scheduler });
  return { session, scheduler, control };
}

describe('TimeControl', () => {
  it('starts paused on the birth day with no pending tick', () => {
    const { session, scheduler, control } = setup();
    expect(control.state).toBe('paused');
    expect(control.speed).toBe(DEFAULT_SPEED);
    expect(scheduler.pending).toBe(0);
    expect(session.age).toBe(0);
  });

  it('advances exactly one year per tick and stops scheduling when paused', () => {
    const { session, scheduler, control } = setup();
    control.play();
    expect(control.state).toBe('playing');
    expect(scheduler.pending).toBe(1);
    expect(scheduler.lastDelay).toBe(control.speed);

    expect(scheduler.tick()).toBe(true);
    expect(session.age).toBe(1);
    expect(scheduler.pending).toBe(1);

    control.pause();
    expect(control.state).toBe('paused');
    expect(scheduler.pending).toBe(0);
    const age = session.age;
    expect(scheduler.tick()).toBe(false);
    expect(session.age).toBe(age);

    control.play();
    expect(scheduler.tick()).toBe(true);
    expect(session.age).toBe(age + 1);
  });

  it('is idempotent and applies a new speed from the next tick', () => {
    const { scheduler, control } = setup();
    control.pause();
    expect(scheduler.pending).toBe(0);
    control.play();
    control.play();
    expect(scheduler.pending).toBe(1);
    control.setSpeed(250);
    expect(control.speed).toBe(250);
    expect(scheduler.tick()).toBe(true);
    expect(scheduler.lastDelay).toBe(250);
    control.setSpeed(500);
    expect(scheduler.tick()).toBe(true);
    expect(scheduler.lastDelay).toBe(500);
  });

  it('stops at a major decision and resumes playing after the choice', () => {
    const { session, scheduler, control } = setup('ui-decision');
    control.play();
    for (let step = 0; step < 40 && control.state === 'playing'; step += 1) {
      expect(scheduler.tick()).toBe(true);
    }
    expect(control.state).toBe('awaiting-decision');
    expect(session.pending).not.toBeNull();
    expect(scheduler.pending).toBe(0);
    const decisionAt = session.clock;
    expect(session.age).toBeGreaterThan(10);
    expect(decisionAt).toBe(session.pending?.at);

    control.choose(session.pending?.recommended.optionId ?? 'start-work');
    expect(session.pending).toBeNull();
    expect(control.state).toBe('playing');
    expect(session.clock).toBe(decisionAt);
    expect(scheduler.pending).toBe(1);
  });

  it('stays paused after a decision that was reached while paused', () => {
    const { session, scheduler, control } = setup('ui-decision-paused');
    for (let step = 0; step < 40 && control.state === 'paused'; step += 1) {
      control.stepOnce();
    }
    expect(control.state).toBe('awaiting-decision');
    expect(scheduler.pending).toBe(0);
    control.choose(session.pending?.recommended.optionId ?? 'start-work');
    expect(control.state).toBe('paused');
    expect(scheduler.pending).toBe(0);
  });

  it('steps one year only while paused', () => {
    const { session, scheduler, control } = setup('ui-step-once');
    control.stepOnce();
    expect(session.age).toBe(1);
    expect(scheduler.pending).toBe(0);
    control.play();
    const age = session.age;
    control.stepOnce();
    expect(session.age).toBe(age);
  });

  it('fast-forwards to the next decision from a paused state', () => {
    const { session, scheduler, control } = setup('ui-fast');
    control.fastForward();
    expect(control.state).toBe('awaiting-decision');
    expect(session.age).toBeGreaterThan(10);
    expect(scheduler.pending).toBe(0);

    control.choose(session.pending?.recommended.optionId ?? 'start-work');
    control.fastForward();
    expect(control.state).toBe('ended');
    expect(session.isEnded).toBe(true);
  });

  it('finishes the whole life and ends', () => {
    const { session, control } = setup('ui-finish');
    control.play();
    control.finishLife();
    expect(control.state).toBe('ended');
    expect(session.isEnded).toBe(true);
    expect(session.summary.ageAtDeath).not.toBeNull();
    control.play();
    control.stepOnce();
    control.fastForward();
    expect(control.state).toBe('ended');
  });

  it('pauses when the page becomes hidden and notifies subscribers', () => {
    const { control } = setup('ui-visibility');
    const seen: string[] = [];
    const unsubscribe = control.subscribe(() => {
      seen.push(control.state);
    });
    control.play();
    control.onVisibilityChange(true);
    expect(control.state).toBe('paused');
    expect(seen).toEqual(['playing', 'paused']);
    unsubscribe();
    control.play();
    expect(seen).toEqual(['playing', 'paused']);
  });

  it('reports failures instead of leaving a half-advanced session', () => {
    const { session, control } = setup('ui-error');
    const failures: unknown[] = [];
    const scheduler = new FakeTimer();
    const broken = new TimeControl({
      session: {
        get isEnded() {
          return session.isEnded;
        },
        get pending() {
          return session.pending;
        },
        stepYear() {
          throw new Error('kernel exploded');
        },
        choose: (optionId: string) => {
          session.choose(optionId);
        },
        advanceToNextDecision: () => {
          session.advanceToNextDecision();
        },
        finish: () => {
          session.finish();
        },
      },
      scheduler,
      onError: (error) => failures.push(error),
    });
    broken.play();
    expect(scheduler.tick()).toBe(true);
    expect(broken.state).toBe('paused');
    expect(failures).toHaveLength(1);
    expect(String(failures[0])).toContain('kernel exploded');
    control.pause();
  });

  it('restores a save that is waiting on a decision as awaiting, so it stays choosable', () => {
    const session = GameSession.create({ ...request, seed: 'probe-0' });
    session.settleBirthDay();
    session.advanceToNextDecision();
    expect(session.pending).not.toBeNull();
    const saved = parseGameSave(JSON.parse(JSON.stringify(session.serialize())));
    const restored = GameSession.restore(saved);
    const control = new TimeControl({ session: restored, scheduler: new FakeTimer() });
    expect(control.state).toBe('awaiting-decision');
    control.choose(restored.pending?.recommended.optionId ?? 'start-work');
    expect(control.state).toBe('paused');
    expect(restored.pending).toBeNull();
  });
});
