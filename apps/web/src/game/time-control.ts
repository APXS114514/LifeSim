import type { PendingDecision } from '@lifesim/simulation-core';
import type { StepResult } from './session.ts';

/**
 * 时间控制状态机（M3-034）。与 React、DOM 和真实时间无关：
 * 计时器由注入的 {@link TimerScheduler} 提供，测试用假计时器驱动。
 *
 * 核心约束：每次 tick 恰好推进一个周年节点；绝不预先模拟后面的年份再「假装」逐年显示。
 */

export type TimeControlState = 'paused' | 'playing' | 'awaiting-decision' | 'ended';

/** 速度档位（每年毫秒数）：慢、常速、快、很快。 */
export const SPEED_LEVELS = [2000, 1000, 500, 250] as const;
export type SpeedLevel = (typeof SPEED_LEVELS)[number];
export const DEFAULT_SPEED: SpeedLevel = 1000;

/** 控制状态机需要的会话接口；`GameSession` 已满足，测试可以替换。 */
export interface SteppableSession {
  readonly isEnded: boolean;
  readonly pending: PendingDecision | null;
  stepYear(): StepResult;
  choose(optionId: string): void;
  advanceToNextDecision(): void;
  finish(): void;
}

export interface TimerScheduler {
  /** 安排一次回调，返回取消函数。 */
  schedule(callback: () => void, ms: number): () => void;
}

export interface TimeControlOptions {
  session: SteppableSession;
  scheduler: TimerScheduler;
  speed?: SpeedLevel;
  /** 每次推进、选择或结束后调用；界面据此自动存档。 */
  onChange?: () => void;
  /** 推进失败时调用；控制状态退回到暂停，不留下半个状态。 */
  onError?: (error: unknown) => void;
}

/** 浏览器计时器适配器（真正的定时器只出现在这一层）。 */
export function timerScheduler(): TimerScheduler {
  return {
    schedule(callback, ms) {
      const id = globalThis.setTimeout(callback, ms);
      let cancelled = false;
      return () => {
        if (cancelled) return;
        cancelled = true;
        globalThis.clearTimeout(id);
      };
    },
  };
}

export class TimeControl {
  readonly #session: SteppableSession;
  readonly #scheduler: TimerScheduler;
  readonly #onChange: (() => void) | undefined;
  readonly #onError: ((error: unknown) => void) | undefined;
  readonly #listeners = new Set<() => void>();
  #state: TimeControlState;
  #speed: SpeedLevel;
  #cancelTick: (() => void) | null = null;
  #resumeAfterDecision: 'playing' | 'paused' = 'paused';

  constructor(options: TimeControlOptions) {
    this.#session = options.session;
    this.#scheduler = options.scheduler;
    this.#onChange = options.onChange;
    this.#onError = options.onError;
    this.#speed = options.speed ?? DEFAULT_SPEED;
    // 新建与读档后一律暂停；若存档正好停在一个等待中的重大决定上，则直接等待决定，
    // 否则玩家会看到决定卡却无法选择。
    this.#state = options.session.isEnded
      ? 'ended'
      : options.session.pending
        ? 'awaiting-decision'
        : 'paused';
  }

  get state(): TimeControlState {
    return this.#state;
  }

  get speed(): SpeedLevel {
    return this.#speed;
  }

  /** 订阅状态变化；返回取消订阅函数。 */
  subscribe(listener: () => void): () => void {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }

  /** 开始自动播放（每秒按当前速度推进一年）。暂停中才有效，重复调用是幂等的。 */
  play(): void {
    if (this.#state !== 'paused') return;
    this.#state = 'playing';
    this.#schedule();
    this.#emit();
  }

  /** 暂停；只在播放中有效。 */
  pause(): void {
    if (this.#state !== 'playing') return;
    this.#cancel();
    this.#state = 'paused';
    this.#emit();
  }

  /** 调整速度；播放中从下一次 tick 起生效。 */
  setSpeed(speed: SpeedLevel): void {
    if (!SPEED_LEVELS.includes(speed)) throw new RangeError(`Unknown speed ${speed}`);
    this.#speed = speed;
    this.#emit();
  }

  /** 「下一年」：推进一个周年节点，但不安排下一次。只在暂停时可用。 */
  stepOnce(): void {
    if (this.#state !== 'paused') return;
    this.#advanceOnce('paused');
    this.#commit();
  }

  /** 「快进到下一个决定」：只在暂停时可用。 */
  fastForward(): void {
    if (this.#state !== 'paused') return;
    if (!this.#run(() => this.#session.advanceToNextDecision())) {
      this.#commit();
      return;
    }
    this.#resumeAfterDecision = 'paused';
    this.#state = this.#session.isEnded ? 'ended' : 'awaiting-decision';
    this.#commit();
  }

  /** 作出重大决定；结束当天结算后回到决定出现前的状态。只在等待决定时可用。 */
  choose(optionId: string): void {
    if (this.#state !== 'awaiting-decision') return;
    if (!this.#run(() => this.#session.choose(optionId))) {
      this.#commit();
      return;
    }
    if (this.#session.isEnded) {
      this.#state = 'ended';
    } else if (this.#session.pending) {
      this.#state = 'awaiting-decision';
    } else {
      this.#state = this.#resumeAfterDecision;
      if (this.#state === 'playing') this.#schedule();
    }
    this.#commit();
  }

  /** 「直接模拟至结局」：按人生原则选完剩余决定直到死亡。由界面二次确认后调用。 */
  finishLife(): void {
    if (this.#state === 'ended') return;
    this.#cancel();
    if (!this.#run(() => this.#session.finish())) {
      this.#commit();
      return;
    }
    this.#state = 'ended';
    this.#commit();
  }

  /** 页面不可见时自动暂停；重新可见后保持暂停，等玩家自己继续。 */
  onVisibilityChange(hidden: boolean): void {
    if (hidden) this.pause();
  }

  dispose(): void {
    this.#cancel();
    this.#listeners.clear();
  }

  #advanceOnce(from: 'playing' | 'paused'): void {
    let result: StepResult;
    try {
      result = this.#session.stepYear();
    } catch (error) {
      this.#fail(error);
      return;
    }
    if (this.#session.isEnded) {
      this.#state = 'ended';
      return;
    }
    if (result.stopReason === 'major-decision' || this.#session.pending) {
      this.#state = 'awaiting-decision';
      this.#resumeAfterDecision = from;
      return;
    }
    this.#state = from;
  }

  #tick = (): void => {
    this.#cancelTick = null;
    if (this.#state !== 'playing') return;
    this.#advanceOnce('playing');
    if (this.#state === 'playing') this.#schedule();
    this.#commit();
  };

  #schedule(): void {
    this.#cancel();
    this.#cancelTick = this.#scheduler.schedule(this.#tick, this.#speed);
  }

  #cancel(): void {
    const cancel = this.#cancelTick;
    this.#cancelTick = null;
    cancel?.();
  }

  /** 执行一次不含返回值的推进；失败时退回暂停并上报，不让界面停在半个状态。 */
  #run(action: () => void): boolean {
    try {
      action();
      return true;
    } catch (error) {
      this.#fail(error);
      return false;
    }
  }

  #fail(error: unknown): void {
    this.#cancel();
    this.#state = 'paused';
    this.#onError?.(error);
  }

  #emit(): void {
    for (const listener of [...this.#listeners]) listener();
  }

  #commit(): void {
    this.#emit();
    this.#onChange?.();
  }
}
