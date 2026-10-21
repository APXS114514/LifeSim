import { toDayNumber } from '@lifesim/simulation-core';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  BASE_YEAR_MS,
  MAX_FRAME_MS,
  PACE_MULTIPLIERS,
  advanceYear,
  baseYearMsForLifeLength,
  displayDate,
  isYearDone,
  startYear,
  visibleFactCount,
  yearDurationMs,
} from './year-pacing.ts';

describe('year pacing (ported from 1injp, MIT)', () => {
  it('keeps the upstream pace: 48 s per year at 1×, 3 s at 16×', () => {
    expect(PACE_MULTIPLIERS).toEqual([1, 2, 4, 16]);
    expect(yearDurationMs(1)).toBe(48_000);
    expect(yearDurationMs(16)).toBe(3_000);
    // 48 秒一年 ≈ 一生 80 年约 64 分钟，正好对应 M4-017 的「一生时长」预设。
    expect(baseYearMsForLifeLength(64)).toBe(BASE_YEAR_MS);
    expect(baseYearMsForLifeLength(10, 80)).toBe(7_500);
  });

  it('shows the first new fact at once and the rest as the year progresses', () => {
    let reveal = startYear(10, 4);
    expect(visibleFactCount(reveal)).toBe(11);
    reveal = advanceYear(reveal, 200, 800); // 进度 0.25
    expect(visibleFactCount(reveal)).toBe(12);
    reveal = advanceYear(reveal, 200, 800); // 0.5
    expect(visibleFactCount(reveal)).toBe(13);
    reveal = advanceYear(reveal, 250, 800); // 0.8125
    expect(visibleFactCount(reveal)).toBe(14);
    expect(isYearDone(reveal)).toBe(false);
    reveal = advanceYear(reveal, 250, 800);
    expect(isYearDone(reveal)).toBe(true);
    expect(visibleFactCount(reveal)).toBe(14);
  });

  it('counts at most one frame of elapsed time, so a background tab never skips a year', () => {
    const reveal = advanceYear(startYear(0, 3), 60_000, 1_000);
    expect(reveal.progress).toBeCloseTo(MAX_FRAME_MS / 1_000);
    expect(isYearDone(reveal)).toBe(false);
  });

  it('shows nothing new in a year without facts', () => {
    const reveal = advanceYear(startYear(7, 0), 250, 500);
    expect(visibleFactCount(reveal)).toBe(7);
  });

  it('reveals monotonically and never more than the year holds', () => {
    fc.assert(
      fc.property(
        fc.nat({ max: 500 }),
        fc.nat({ max: 40 }),
        fc.array(fc.nat({ max: 400 }), { maxLength: 60 }),
        fc.integer({ min: 100, max: 50_000 }),
        (before, count, frames, yearMs) => {
          let reveal = startYear(before, count);
          let last = visibleFactCount(reveal);
          for (const frame of frames) {
            reveal = advanceYear(reveal, frame, yearMs);
            const visible = visibleFactCount(reveal);
            expect(visible).toBeGreaterThanOrEqual(last);
            expect(visible).toBeLessThanOrEqual(before + count);
            expect(reveal.progress).toBeLessThanOrEqual(1);
            last = visible;
          }
        },
      ),
      { numRuns: 300 },
    );
  });

  it('interpolates the displayed date inside the year and never passes its end', () => {
    expect(displayDate('1999-05-04', '2000-05-04', 0)).toBe('1999-05-04');
    expect(displayDate('1999-05-04', '2000-05-04', 1)).toBe('2000-05-04');
    // 跨闰日：这一年有 366 天，一半是 183 天，即 5 月 4 日之后的 11 月 3 日。
    expect(displayDate('1999-05-04', '2000-05-04', 0.5)).toBe('1999-11-03');
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 400 }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        (days, p) => {
          const end = new Date(Date.UTC(2001, 0, 1 + days)).toISOString().slice(0, 10);
          const shown = displayDate('2001-01-01', end, p);
          expect(toDayNumber(shown)).toBeGreaterThanOrEqual(toDayNumber('2001-01-01'));
          expect(toDayNumber(shown)).toBeLessThanOrEqual(toDayNumber(end));
        },
      ),
      { numRuns: 200 },
    );
  });

  it('rejects inputs that would make the pacing meaningless', () => {
    expect(() => startYear(-1, 2)).toThrow(RangeError);
    expect(() => startYear(0, 1.5)).toThrow(RangeError);
    expect(() => advanceYear(startYear(0, 1), 10, 0)).toThrow(RangeError);
    expect(() => displayDate('2000-01-02', '2000-01-01', 0.5)).toThrow(RangeError);
    expect(() => displayDate('2000-01-01', '2000-12-31', Number.NaN)).toThrow(RangeError);
    expect(() => baseYearMsForLifeLength(0)).toThrow(RangeError);
  });
});
