import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { RNG_ALGORITHM, deriveStream, fingerprint } from './random.ts';

describe('random streams', () => {
  it('stay bit-for-bit identical (changing this breaks every save; bump RNG_ALGORITHM)', () => {
    expect(RNG_ALGORITHM).toBe('fnv4-fmix32+sfc32/1');
    const stream = deriveStream('golden-seed', 'life.annual|char:p|age:18');
    expect([stream.nextUint32(), stream.nextUint32(), stream.nextUint32(), stream.next()]).toEqual([
      103904497, 3673595780, 3066960700, 0.3123325054968574,
    ]);
    expect(fingerprint('LifeSim')).toBe('248be23c5bdf46535dc183e1d4d11920');
  });

  it('give the same sequence for the same seed and key, and different ones otherwise', () => {
    fc.assert(
      fc.property(fc.string(), fc.string(), fc.string(), (seed, keyA, keyB) => {
        const draw = (s: string, k: string) => {
          const stream = deriveStream(s, k);
          return [stream.next(), stream.next(), stream.next()];
        };
        expect(draw(seed, keyA)).toEqual(draw(seed, keyA));
        if (keyA !== keyB) expect(draw(seed, keyA)).not.toEqual(draw(seed, keyB));
      }),
    );
  });

  it('produce uniform values in [0, 1)', () => {
    const stream = deriveStream('uniformity', 'test');
    const buckets = new Array<number>(10).fill(0);
    const n = 50_000;
    for (let i = 0; i < n; i++) {
      const u = stream.next();
      expect(u).toBeGreaterThanOrEqual(0);
      expect(u).toBeLessThan(1);
      buckets[Math.floor(u * 10)]! += 1;
    }
    // 每个桶期望 5000，标准差约 67；容差取 5 个标准差。
    for (const count of buckets) expect(Math.abs(count - n / 10)).toBeLessThan(335);
  });

  it('consume exactly one draw per chance() call regardless of the probability', () => {
    const a = deriveStream('s', 'k');
    const b = deriveStream('s', 'k');
    a.chance(0);
    b.chance(1);
    expect(a.next()).toBe(b.next());
  });

  it('pick weighted options in proportion to their weights', () => {
    const stream = deriveStream('weights', 'test');
    const counts = { low: 0, middle: 0, high: 0 };
    for (let i = 0; i < 30_000; i++) {
      counts[
        stream.weighted([
          ['low', 1],
          ['middle', 2],
          ['high', 1],
        ] as const)
      ] += 1;
    }
    expect(counts.middle / 30_000).toBeCloseTo(0.5, 1);
    expect(counts.low / 30_000).toBeCloseTo(0.25, 1);
  });
});
