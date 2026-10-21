import type { ISODate } from '@lifesim/content-schema';
import { toDayNumber } from '@lifesim/simulation-core';
import {
  advanceYear,
  displayDate,
  isYearDone,
  startYear,
  visibleFactCount,
  type YearReveal,
} from './year-pacing.ts';

export interface YearRevealView {
  readonly visibleCount: number;
  readonly progress: number;
  readonly from: ISODate;
  readonly to: ISODate;
  readonly date: ISODate;
  readonly animate: boolean;
}

/** 只保存展示进度，绝不推进模拟或改变存档。 */
export class YearRevealClock {
  #yearMs: number;
  #clock: ISODate;
  #factCount: number;
  #from: ISODate;
  #reveal: YearReveal;

  constructor(options: { yearMs: number; clock: ISODate; factCount: number }) {
    assertDuration(options.yearMs);
    toDayNumber(options.clock);
    this.#yearMs = options.yearMs;
    this.#clock = options.clock;
    this.#from = options.clock;
    this.#factCount = options.factCount;
    this.#reveal = { ...startYear(options.factCount, 0), progress: 1 };
  }

  setYearMs(yearMs: number): void {
    assertDuration(yearMs);
    this.#yearMs = yearMs;
  }

  observe(input: {
    clock: ISODate;
    factCount: number;
    isPlaying: boolean;
    allowAnimation: boolean;
  }): { animate: boolean } {
    const days = toDayNumber(input.clock) - toDayNumber(this.#clock);
    startYear(input.factCount, 0); // 使用同一计数校验，不复制移植模块的逻辑。
    if (days < 0 || input.factCount < this.#factCount) {
      throw new RangeError('Reveal clock and fact count cannot move backwards');
    }
    if (
      days === 0 &&
      input.factCount === this.#factCount &&
      input.isPlaying &&
      input.allowAnimation
    ) {
      return { animate: !this.isComplete };
    }
    const previousCount = this.#factCount;
    this.#from = this.#clock;
    this.#clock = input.clock;
    this.#factCount = input.factCount;
    if (
      input.isPlaying &&
      input.allowAnimation &&
      (days === 365 || days === 366) &&
      input.factCount > previousCount
    ) {
      this.#reveal = startYear(previousCount, input.factCount - previousCount);
    } else {
      this.complete();
    }
    return { animate: !this.isComplete };
  }

  frame(elapsedMs: number): void {
    if (this.isComplete) return;
    if (!Number.isFinite(elapsedMs)) throw new RangeError('Elapsed time must be finite');
    this.#reveal = advanceYear(this.#reveal, elapsedMs, this.#yearMs);
    // 多帧浮点累加可能把完整一年表示成 0.9999999999999999。
    // 只容忍一个机器精度单位，不让已显示的 100% 多等待一帧。
    if (isYearDone({ ...this.#reveal, progress: this.#reveal.progress + Number.EPSILON })) {
      this.complete();
    }
  }

  complete(): void {
    this.#from = this.#clock;
    this.#reveal = { ...startYear(this.#factCount, 0), progress: 1 };
  }

  get isComplete(): boolean {
    return isYearDone(this.#reveal);
  }

  get view(): YearRevealView {
    return {
      visibleCount: visibleFactCount(this.#reveal),
      progress: this.#reveal.progress,
      from: this.#from,
      to: this.#clock,
      date: displayDate(this.#from, this.#clock, this.#reveal.progress),
      animate: !this.isComplete,
    };
  }
}

function assertDuration(yearMs: number): void {
  if (!(yearMs > 0) || !Number.isFinite(yearMs))
    throw new RangeError('Year duration must be positive and finite');
}
