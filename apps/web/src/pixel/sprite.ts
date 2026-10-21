/**
 * 像素绘制原语（M4-022）：精灵是「每行一个字符串」的调色板索引网格，`.` 表示透明。
 *
 * 全部是纯函数：同一输入同一输出，不读时间、不用 Math.random、不消耗模拟的随机流。
 * 像素美术（精灵与调色板）都是本项目原创的素材数据，集中放在 src/pixel/ 下。
 */

export const TRANSPARENT = '.';

export interface Sprite {
  readonly width: number;
  readonly height: number;
  readonly rows: readonly string[];
}

/** 调色板：网格字符 → CSS 颜色。 */
export type Palette = Readonly<Record<string, string>>;

/** 校验并冻结一个精灵：每行等宽、至少一行。 */
export function sprite(rows: readonly string[]): Sprite {
  const width = rows[0]?.length ?? 0;
  if (rows.length === 0 || width === 0) throw new RangeError('A sprite needs at least one pixel');
  rows.forEach((row, index) => {
    if (row.length !== width) {
      throw new RangeError(`Sprite row ${index} has ${row.length} pixels, expected ${width}`);
    }
  });
  return Object.freeze({ width, height: rows.length, rows: Object.freeze([...rows]) });
}

/** 同一行里连续同色的像素合并成一段，渲染时一段一个矩形。 */
export interface PixelRun {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly key: string;
}

export function pixelRuns(rows: readonly string[]): PixelRun[] {
  const runs: PixelRun[] = [];
  rows.forEach((row, y) => {
    let start = 0;
    for (let x = 1; x <= row.length; x += 1) {
      if (x < row.length && row[x] === row[start]) continue;
      const key = row[start] ?? TRANSPARENT;
      if (key !== TRANSPARENT) runs.push({ x: start, y, width: x - start, key });
      start = x;
    }
  });
  return runs;
}

/** 网格里用到、但调色板里没有的字符（渲染前必须为空）。 */
export function missingColors(rows: readonly string[], palette: Palette): string[] {
  const missing = new Set<string>();
  for (const row of rows) {
    for (const key of row) {
      if (key !== TRANSPARENT && !(key in palette)) missing.add(key);
    }
  }
  return [...missing].sort();
}

/** 可变画布：先铺底、再按顺序盖印精灵，最后输出行字符串。 */
export class PixelCanvas {
  readonly width: number;
  readonly height: number;
  readonly #cells: string[][];

  constructor(width: number, height: number, fill: string = TRANSPARENT) {
    if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
      throw new RangeError(`Canvas size must be positive integers: ${width}×${height}`);
    }
    this.width = width;
    this.height = height;
    this.#cells = Array.from({ length: height }, () => Array.from({ length: width }, () => fill));
  }

  /** 填一个矩形（超出画布的部分忽略）。 */
  rect(x: number, y: number, width: number, height: number, key: string): this {
    for (let row = Math.max(0, y); row < Math.min(this.height, y + height); row += 1) {
      const cells = this.#cells[row];
      if (!cells) continue;
      for (let col = Math.max(0, x); col < Math.min(this.width, x + width); col += 1) {
        cells[col] = key;
      }
    }
    return this;
  }

  /** 盖印精灵：透明像素不覆盖；`recolor` 可把精灵里的字符换成画布调色板的字符。 */
  stamp(
    source: Sprite,
    x: number,
    y: number,
    recolor: Readonly<Record<string, string>> = {},
  ): this {
    source.rows.forEach((row, dy) => {
      const cells = this.#cells[y + dy];
      if (!cells) return;
      for (let dx = 0; dx < row.length; dx += 1) {
        const key = row[dx] ?? TRANSPARENT;
        const col = x + dx;
        if (key === TRANSPARENT || col < 0 || col >= this.width) continue;
        cells[col] = recolor[key] ?? key;
      }
    });
    return this;
  }

  rows(): string[] {
    return this.#cells.map((cells) => cells.join(''));
  }
}

/**
 * 字符串的 32 位 FNV-1a 散列，只用来在美术变体之间做确定性挑选（不是模拟随机数）。
 */
export function variantHash(text: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/** 从数组里按散列挑一个；数组不能为空。 */
export function pick<T>(items: readonly T[], hash: number, salt = 0): T {
  if (items.length === 0) throw new RangeError('Cannot pick from an empty list');
  const index = (hash ^ Math.imul(salt + 1, 0x9e3779b1)) >>> 0;
  return items[index % items.length] as T;
}
