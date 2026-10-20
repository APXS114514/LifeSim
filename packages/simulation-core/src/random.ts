/**
 * 可复现的随机数（GDD §11.4）。
 *
 * 随机流是「计数器式」派生的：每个随机流由「根种子 + 键」确定性地生成，
 * 键由事件类型、实体 ID 与时段组成（即事件的幂等键）。因此：
 * - 无关事件的执行顺序、分批推进的切分方式都不会改变某个事件拿到的随机数；
 * - 快照不需要保存「已消费的随机流位置」，只需记录算法版本（`RNG_ALGORITHM`）。
 *
 * 散列：四路乘法散列（FNV-1a 的结构），用 MurmurHash3 的 fmix32 收尾；
 * 生成器：sfc32。三者都是公有领域算法，这里按算法描述重新实现。
 * 只用 32 位整数运算，各 JS 引擎结果一致。
 * 修改这里的任何算法都会改变存档的后续结果，必须同时提升 `RNG_ALGORITHM` 的版本号。
 */
export const RNG_ALGORITHM = 'fnv4-fmix32+sfc32/1';

function fmix32(input: number): number {
  let h = input;
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/** 字符串 → 128 位（四个 uint32）。 */
export function hash128(text: string): [number, number, number, number] {
  let a = 0x811c9dc5;
  let b = 0x9e3779b9;
  let c = 0x6a09e667;
  let d = 0xbb67ae85;
  for (let index = 0; index < text.length; index++) {
    const unit = text.charCodeAt(index);
    a = Math.imul(a ^ unit, 0x01000193);
    b = Math.imul(b ^ unit, 0x5bd1e995);
    c = Math.imul(c ^ unit, 0x27d4eb2f);
    d = Math.imul(d ^ unit, 0x165667b1);
  }
  a = fmix32(a ^ text.length);
  b = fmix32(b ^ a);
  c = fmix32(c ^ b);
  d = fmix32(d ^ c);
  a = fmix32(a ^ d);
  return [a, b, c, d];
}

/** 字符串指纹（32 位十六进制），用于黄金测试与基准的工作量校验，不用于安全场景。 */
export function fingerprint(text: string): string {
  return hash128(text)
    .map((word) => word.toString(16).padStart(8, '0'))
    .join('');
}

export class RandomStream {
  #a: number;
  #b: number;
  #c: number;
  #d: number;

  constructor(seed: readonly [number, number, number, number]) {
    [this.#a, this.#b, this.#c, this.#d] = seed;
    // sfc32 的常规做法：先丢弃若干输出，让种子充分混合。
    for (let round = 0; round < 12; round++) this.nextUint32();
  }

  nextUint32(): number {
    const t = (((this.#a + this.#b) | 0) + this.#d) | 0;
    this.#d = (this.#d + 1) | 0;
    this.#a = this.#b ^ (this.#b >>> 9);
    this.#b = (this.#c + (this.#c << 3)) | 0;
    this.#c = (this.#c << 21) | (this.#c >>> 11);
    this.#c = (this.#c + t) | 0;
    return t >>> 0;
  }

  /** [0, 1) 上的均匀数，53 位精度。 */
  next(): number {
    const high = this.nextUint32() >>> 5;
    const low = this.nextUint32() >>> 6;
    return (high * 67108864 + low) / 9007199254740992;
  }

  /**
   * 以概率 p 返回 true。无论 p 为多少都恰好消耗一次抽样，
   * 这样规则里概率的变化不会让同一随机流里后续的抽样整体错位。
   */
  chance(probability: number): boolean {
    return this.next() < probability;
  }

  /** [0, n) 上的均匀整数。 */
  int(n: number): number {
    if (!Number.isInteger(n) || n <= 0) throw new RangeError(`Invalid range: ${n}`);
    return Math.floor(this.next() * n);
  }

  /** 按权重抽取；条目顺序即判定顺序，调用方必须给出固定顺序。 */
  weighted<T extends string>(entries: readonly (readonly [T, number])[]): T {
    const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
    if (!(total > 0)) throw new RangeError('Weights must sum to a positive number');
    let u = this.next() * total;
    for (const [value, weight] of entries) {
      if (u < weight) return value;
      u -= weight;
    }
    const last = entries.at(-1);
    if (!last) throw new RangeError('No entries to choose from');
    return last[0];
  }
}

/** 由根种子与键派生一个独立随机流。同一 (seed, key) 永远得到同一序列。 */
export function deriveStream(rootSeed: string, key: string): RandomStream {
  return new RandomStream(hash128(`lifesim-rng/1\u0000${rootSeed}\u0000${key}`));
}
