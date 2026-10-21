import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { MAX_FRAME_MS } from './year-pacing.ts';
import { YearRevealClock } from './year-reveal.ts';

function clock() {
  return new YearRevealClock({ yearMs: 1_000, clock: '2000-05-04', factCount: 10 });
}

const nextYear = { clock: '2001-05-04', factCount: 14, isPlaying: true, allowAnimation: true };

describe('year reveal clock', () => {
  it('shows a restored session in full and starts a new year with its first fact', () => {
    const reveal = clock();
    expect(reveal.view).toMatchObject({
      visibleCount: 10,
      progress: 1,
      date: '2000-05-04',
      animate: false,
    });
    expect(reveal.observe(nextYear)).toEqual({ animate: true });
    expect(reveal.view).toMatchObject({
      visibleCount: 11,
      progress: 0,
      from: '2000-05-04',
      to: '2001-05-04',
      date: '2000-05-04',
    });
  });

  it('finishes monotonically without passing the authoritative date or fact count', () => {
    const reveal = clock();
    reveal.observe(nextYear);
    let previous = reveal.view;
    for (let frame = 0; frame < 10; frame += 1) {
      reveal.frame(100);
      const current = reveal.view;
      expect(current.visibleCount).toBeGreaterThanOrEqual(previous.visibleCount);
      expect(current.visibleCount).toBeLessThanOrEqual(nextYear.factCount);
      expect(current.date >= current.from && current.date <= current.to).toBe(true);
      expect(current.progress).toBeLessThanOrEqual(1);
      previous = current;
    }
    expect(reveal.isComplete).toBe(true);
    expect(reveal.view).toMatchObject({ visibleCount: 14, animate: false, date: nextYear.clock });
  });

  it('caps each elapsed frame and lets speed changes preserve progress', () => {
    const reveal = clock();
    reveal.observe(nextYear);
    reveal.frame(60_000);
    expect(reveal.view.progress).toBe(MAX_FRAME_MS / 1_000);
    reveal.setYearMs(500);
    reveal.frame(100);
    expect(reveal.view.progress).toBeCloseTo(0.45);
  });

  it.each([
    { isPlaying: false, allowAnimation: true },
    { isPlaying: true, allowAnimation: false },
  ])('reveals manual actions, decisions and reduced motion immediately: %j', (options) => {
    const reveal = clock();
    reveal.observe({ ...nextYear, ...options });
    expect(reveal.isComplete).toBe(true);
    expect(reveal.view).toMatchObject({ visibleCount: 14, progress: 1, date: nextYear.clock });
  });

  it('retains every previous fact when a new tick arrives before reveal finishes', () => {
    const reveal = clock();
    reveal.observe(nextYear);
    reveal.frame(100);
    const shown = reveal.view.visibleCount;
    reveal.observe({ ...nextYear, clock: '2002-05-04', factCount: 17 });
    expect(reveal.view.visibleCount).toBe(15);
    expect(reveal.view.visibleCount).toBeGreaterThanOrEqual(shown);
    reveal.complete();
    expect(reveal.view).toMatchObject({ visibleCount: 17, date: '2002-05-04', animate: false });
    const before = reveal.view;
    reveal.frame(100);
    expect(reveal.view).toEqual(before);
  });

  it('does not restart reveal on unchanged playback notifications', () => {
    const reveal = clock();
    reveal.observe(nextYear);
    reveal.frame(100);
    const before = reveal.view;
    reveal.observe(nextYear);
    expect(reveal.view).toEqual(before);
  });

  it('handles years without facts and jumps in full, including leap anniversaries', () => {
    const reveal = clock();
    reveal.observe({ ...nextYear, factCount: 10 });
    expect(reveal.view).toMatchObject({ visibleCount: 10, progress: 1 });
    reveal.observe({ ...nextYear, clock: '2010-05-04', factCount: 20 });
    expect(reveal.view).toMatchObject({ visibleCount: 20, progress: 1 });
    const leap = new YearRevealClock({ yearMs: 1_000, clock: '2003-02-28', factCount: 1 });
    expect(leap.observe({ ...nextYear, clock: '2004-02-29', factCount: 2 }).animate).toBe(true);
  });

  it('rejects invalid dates, counts and durations', () => {
    const reveal = clock();
    for (const yearMs of [0, -1, Infinity, NaN])
      expect(() => reveal.setYearMs(yearMs)).toThrow(RangeError);
    for (const factCount of [-1, 1.5])
      expect(() => reveal.observe({ ...nextYear, factCount })).toThrow(RangeError);
    expect(() => reveal.observe({ ...nextYear, clock: '1999-05-04' })).toThrow(RangeError);
    expect(() => reveal.observe({ ...nextYear, clock: '2001-02-30' })).toThrow(RangeError);
  });

  it('keeps arbitrary frame sequences monotone and manual actions complete', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 0, max: 60_000 }), { maxLength: 80 }),
        fc.integer({ min: 1, max: 30 }),
        (frames, newFacts) => {
          const reveal = clock();
          reveal.observe({ ...nextYear, factCount: 10 + newFacts });
          let shown = reveal.view.visibleCount;
          for (const elapsed of frames) {
            reveal.frame(elapsed);
            expect(reveal.view.visibleCount).toBeGreaterThanOrEqual(shown);
            expect(reveal.view.visibleCount).toBeLessThanOrEqual(10 + newFacts);
            expect(reveal.view.date <= nextYear.clock).toBe(true);
            shown = reveal.view.visibleCount;
          }
          reveal.observe({
            ...nextYear,
            clock: '2002-05-04',
            factCount: 11 + newFacts,
            isPlaying: false,
          });
          expect(reveal.view.visibleCount).toBe(11 + newFacts);
          expect(reveal.view.progress).toBe(1);
        },
      ),
      { numRuns: 200 },
    );
  });
});
