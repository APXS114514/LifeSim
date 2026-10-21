/*!
 * LifeSim — apps/web/src/game/year-pacing.ts
 *
 * Ported from satorunet/1injp (https://github.com/satorunet/1injp),
 * commit 5f19a0e7b4233c27492ea110c516eb0ab1c50948, app.js:
 * SPEEDS / YEAR_MS (lines 576–577), interval() (677), the progress loop of
 * schedule() (680–688), showDate() (705–708) and the year reveal around
 * flushLog(upto) (688, 731). Registered in third_party/ported-code.json
 * (id: 1injp-year-pacing).
 *
 * Changes: rewritten as pure TypeScript functions; DOM, sound, animation frames
 * and wall-clock reads removed (the caller passes elapsed time); dates use
 * LifeSim's canonical calendar instead of the JS Date object.
 *
 * Copyright (c) 2026 satoru.net
 * SPDX-License-Identifier: MIT
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */
import type { ISODate } from '@lifesim/content-schema';
import { fromDayNumber, toDayNumber } from '@lifesim/simulation-core';

/**
 * 年内节奏（M3-044 移植，供 M4-017 接入界面）。
 *
 * 只负责「这一年已经算好的事实，按年度进度条依次显示多少条、显示到哪一天」。
 * 它不推进模拟：M3-034 的约束不变——每次 tick 只推进一个周年节点，事实由内核算出后
 * 才在这里按进度揭示；显示的日期永远落在这一年的起止之间，不会超过权威时钟。
 */

/** 1× 时一年的毫秒数（上游 `YEAR_MS = 48000`：1× 一年 48 秒，16× 一年 3 秒）。 */
export const BASE_YEAR_MS = 48_000;

/** 倍速档位（上游 `SPEEDS = [1, 2, 4, 16]`）。 */
export const PACE_MULTIPLIERS = [1, 2, 4, 16] as const;
export type PaceMultiplier = (typeof PACE_MULTIPLIERS)[number];

/** 单帧最多计入的毫秒数（上游 `Math.min(250, now - last)`）：后台标签页回来时不会一下跳过整年。 */
export const MAX_FRAME_MS = 250;

/** 一年的时长：上游 `interval() = YEAR_MS / speed`。 */
export function yearDurationMs(multiplier: PaceMultiplier, baseYearMs = BASE_YEAR_MS): number {
  if (!(baseYearMs > 0)) throw new RangeError(`baseYearMs must be positive: ${baseYearMs}`);
  return baseYearMs / multiplier;
}

/** 「一生时长」预设（分钟）换算成 1× 时一年的毫秒数；80 年、64 分钟正好是上游的 48 秒一年。 */
export function baseYearMsForLifeLength(minutes: number, expectedYears = 80): number {
  if (!(minutes > 0) || !(expectedYears > 0)) {
    throw new RangeError(
      `Life length and expected years must be positive: ${minutes}, ${expectedYears}`,
    );
  }
  return (minutes * 60_000) / expectedYears;
}

/** 一年的揭示进度：年初已经显示了多少条、这一年新增多少条、进度 0—1。 */
export interface YearReveal {
  readonly shownBefore: number;
  readonly newFacts: number;
  readonly progress: number;
}

function assertCount(name: string, value: number): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative integer: ${value}`);
  }
}

/** 一年开始：进度归零（上游在算完一年后记下 `{ from: S.logN, n }` 并把进度清零）。 */
export function startYear(shownBefore: number, newFacts: number): YearReveal {
  assertCount('shownBefore', shownBefore);
  assertCount('newFacts', newFacts);
  return { shownBefore, newFacts, progress: 0 };
}

/** 计入一帧经过的时间（上游 `S.prog += dt / interval()`，`dt` 不超过 250 ms），进度封顶为 1。 */
export function advanceYear(reveal: YearReveal, elapsedMs: number, yearMs: number): YearReveal {
  if (!(yearMs > 0)) throw new RangeError(`yearMs must be positive: ${yearMs}`);
  const frame = Math.min(MAX_FRAME_MS, Math.max(0, elapsedMs));
  return { ...reveal, progress: Math.min(1, reveal.progress + frame / yearMs) };
}

export function isYearDone(reveal: YearReveal): boolean {
  return reveal.progress >= 1;
}

/**
 * 当前应当显示的事实条数（含年初之前的）。
 * 上游：年初立即显示第一条（`flushLog(S.logN + 1)`），之后显示到
 * `from + 1 + floor(prog × n)` 条；进度满时全部显示。
 */
export function visibleFactCount(reveal: YearReveal): number {
  const { shownBefore, newFacts, progress } = reveal;
  if (newFacts === 0) return shownBefore;
  if (progress >= 1) return shownBefore + newFacts;
  return Math.min(shownBefore + newFacts, shownBefore + 1 + Math.floor(progress * newFacts));
}

/**
 * 进度条上显示的日期：从这一年的起点按进度逐日推进，进度满时等于终点。
 * 上游用 `new Date(…, b.d + floor(prog × 365))`；这里用规范日历的日序号，闰年按实际天数，
 * 并且终点就是内核的权威时钟，所以显示日期永远不会超前。
 */
export function displayDate(from: ISODate, to: ISODate, progress: number): ISODate {
  const start = toDayNumber(from);
  const end = toDayNumber(to);
  if (end < start) throw new RangeError(`Year end ${to} is before its start ${from}`);
  if (Number.isNaN(progress)) throw new RangeError('progress must be a number');
  const clamped = Math.min(1, Math.max(0, progress));
  return fromDayNumber(start + Math.floor(clamped * (end - start)));
}
