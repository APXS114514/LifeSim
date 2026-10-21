import type { PixelImage } from './avatar.ts';
import { PixelCanvas, pick, sprite, type Sprite } from './sprite.ts';

/**
 * 像素场景（M4-022）：场景 = 天空 + 远景 + 地面 + 道具。按场景规格确定性地合成，
 * 不依赖模拟状态以外的任何东西，也不消耗模拟的随机流（变体只来自散列）。
 *
 * UI-01 提供两个示意样例（农村、城镇）；UI-04 按地区 × 年代 × 城乡 × 人生阶段扩充目录（ART 任务）。
 */

export const SCENE_WIDTH = 144;
export const SCENE_HEIGHT = 48;
const HORIZON = 30;

export type SceneId = 'rural-village' | 'urban-blocks';

export interface SceneContext {
  readonly settlement: 'urban' | 'rural';
  /** 画面所在的公历年份。 */
  readonly year: number;
}

/** 场景目录的选择规则：按现居地的城乡（UI-04 再加地区与年代）。 */
export function sceneFor(context: SceneContext): SceneId {
  return context.settlement === 'urban' ? 'urban-blocks' : 'rural-village';
}

// ---------- 精灵（原创） ----------

const SUN = sprite(['..uuu..', '.uuuuu.', 'uuuuuuu', 'uuuuuuu', 'uuuuuuu', '.uuuuu.', '..uuu..']);

const CLOUD = sprite([
  '......oooo......',
  '...oooooooooo...',
  '.oooooooooooooo.',
  'oooooooooooooooo',
  '.OOOOOOOOOOOOOO.',
]);

const HOUSE = sprite([
  '..........xxxxxx..........',
  '........xxxxxxxxxx........',
  '......xxxxxxxxxxxxxx......',
  '....xxxxxxxxxxxxxxxxxx....',
  '..xxxxxxxxxxxxxxxxxxxxxx..',
  'XXXXXXXXXXXXXXXXXXXXXXXXXX',
  '..WWWWWWWWWWWWWWWWWWWWWW..',
  '..WWNNNNWWWWWWWWWWNNNNWW..',
  '..WWNnnNWWWqqqqWWWNnnNWW..',
  '..WWNnnNWWWqqqqWWWNnnNWW..',
  '..WWNNNNWWWqqqqWWWNNNNWW..',
  '..wWWWWWWWWqqqqWWWWWWWWw..',
  '..wWWWWWWWWqqNqWWWWWWWWw..',
  '..wWWWWWWWWqqqqWWWWWWWWw..',
  '..wwwwwwwwwqqqqwwwwwwwww..',
  '..DDDDDDDDDDDDDDDDDDDDDD..',
]);

const TREE = sprite([
  '....llll....',
  '..llllllll..',
  '.llllLlllll.',
  'llllllllLlll',
  'lllLllllllll',
  'llllllLlllll',
  '.llllllllLl.',
  '..llLlllll..',
  '...llllll...',
  '.....tt.....',
  '.....tt.....',
  '.....tt.....',
  '.....tt.....',
  '.....tt.....',
  '.....tt.....',
  '....tttt....',
]);

const SMALL_TREE = sprite([
  '..llll..',
  '.llllLl.',
  'llLlllll',
  'lllllLll',
  '.llllll.',
  '...tt...',
  '...tt...',
  '...tt...',
  '..tttt..',
]);

const POLE = sprite([
  'zzzzzzzzz',
  'Z...z...Z',
  ...Array.from({ length: 22 }, () => '....z....'),
  '...zzz...',
]);

const FENCE = sprite(['z....z', 'zzzzzz', 'z....z', 'zzzzzz', 'z....z']);

const LAMP = sprite(['mmmm.', 'm.MM.', ...Array.from({ length: 16 }, () => 'm....'), 'mm...']);

/** 多层住宅楼：按宽度与层数程序化生成，亮灯的窗户由散列决定（只是画面）。 */
export function apartmentBlock(width: number, floors: number, hash: number): Sprite {
  const floorHeight = 5;
  const height = floors * floorHeight + 3;
  const canvas = new PixelCanvas(width, height, 'b');
  canvas.rect(0, 0, width, 2, 'B');
  canvas.rect(width - 2, 0, 2, height, 'B');
  for (let floor = 0; floor < floors; floor += 1) {
    const top = 3 + floor * floorHeight;
    for (let x = 2, column = 0; x + 3 <= width - 3; x += 5, column += 1) {
      const lit = pick([false, false, false, true], hash, floor * 31 + column);
      canvas.rect(x, top, 3, 3, lit ? 'I' : 'i');
    }
  }
  const door = Math.floor(width / 2) - 2;
  canvas.rect(door, height - 4, 4, 4, 'q');
  return sprite(canvas.rows());
}

// ---------- 调色板（原创素材数据） ----------

const SCENE_PALETTE = {
  k: '#a6dcf5',
  K: '#c8ecfa',
  u: '#ffd56e',
  o: '#ffffff',
  O: '#dff0f8',
  f: '#9fc8b6',
  F: '#88b5a1',
  s: '#b7cbd6',
  S: '#a3bac6',
  g: '#86b56c',
  G: '#6e9c58',
  d: '#cdab80',
  D: '#a98861',
  t: '#7a5236',
  l: '#5f9e57',
  L: '#4b8446',
  W: '#efe6d4',
  w: '#d8cab0',
  x: '#b65d4c',
  X: '#8f4639',
  N: '#6b5a4a',
  n: '#a9d8ee',
  q: '#7a5236',
  z: '#6b4a33',
  Z: '#3e3a36',
  a: '#5b6268',
  y: '#ebe5cb',
  v: '#cbd0d3',
  V: '#9ba3a9',
  b: '#dcd6ca',
  B: '#bab2a4',
  i: '#5f7d92',
  I: '#a7cfe2',
  m: '#4a4f55',
  M: '#fff3b8',
} as const;

// ---------- 合成 ----------

function sky(canvas: PixelCanvas, variant: number): void {
  canvas.rect(0, 0, SCENE_WIDTH, 14, 'k');
  canvas.rect(0, 14, SCENE_WIDTH, HORIZON - 14, 'K');
  canvas.stamp(SUN, 12 + (variant % 18), 1);
  canvas.stamp(CLOUD, 42 + (variant % 12), 5);
  canvas.stamp(CLOUD, 96 + ((variant >>> 4) % 20), 9);
}

/** 远景山丘：用整数近似的正弦起伏（确定性，与浏览器的浮点实现无关）。 */
function hills(canvas: PixelCanvas, phase: number): void {
  const wave = [0, 1, 2, 2, 3, 3, 3, 2, 2, 1, 0, -1, -2, -2, -3, -3, -3, -2, -2, -1];
  for (let x = 0; x < SCENE_WIDTH; x += 1) {
    const offset = wave[Math.floor((x + phase) / 3) % wave.length] ?? 0;
    const top = 21 + offset;
    canvas.rect(x, top, 1, HORIZON - top, 'f');
    canvas.rect(x, top + 4, 1, HORIZON - top - 4, 'F');
  }
}

function skyline(canvas: PixelCanvas, variant: number): void {
  for (let x = 0, index = 0; x < SCENE_WIDTH; index += 1) {
    const width = 6 + pick([0, 2, 4, 6], variant, index);
    const top = 16 + pick([0, 2, 3, 5, 6], variant, index + 50);
    canvas.rect(x, top, width, HORIZON - top, index % 2 === 0 ? 's' : 'S');
    x += width;
  }
}

function ruralVillage(variant: number): PixelImage {
  const canvas = new PixelCanvas(SCENE_WIDTH, SCENE_HEIGHT);
  sky(canvas, variant);
  hills(canvas, variant % 40);
  canvas.rect(0, HORIZON, SCENE_WIDTH, 2, 'g');
  canvas.rect(0, HORIZON + 2, SCENE_WIDTH, 4, 'd');
  canvas.rect(0, HORIZON + 6, SCENE_WIDTH, 1, 'D');
  for (let row = HORIZON + 7; row < SCENE_HEIGHT; row += 1) {
    canvas.rect(0, row, SCENE_WIDTH, 1, row % 2 === 0 ? 'g' : 'G');
  }
  canvas.rect(0, 9, SCENE_WIDTH, 1, 'Z');
  canvas.stamp(POLE, 92, 8);
  canvas.stamp(HOUSE, 16, HORIZON - 14);
  canvas.stamp(TREE, 58, HORIZON - 14);
  canvas.stamp(TREE, 124, HORIZON - 14);
  for (let x = 0; x < 16; x += 6) canvas.stamp(FENCE, x, HORIZON - 3);
  for (let x = 44; x < 58; x += 6) canvas.stamp(FENCE, x, HORIZON - 3);
  canvas.stamp(SMALL_TREE, 106, HORIZON - 7);
  return { rows: canvas.rows(), palette: SCENE_PALETTE };
}

function urbanBlocks(variant: number): PixelImage {
  const canvas = new PixelCanvas(SCENE_WIDTH, SCENE_HEIGHT);
  sky(canvas, variant);
  skyline(canvas, variant);
  const blocks: [number, number, number][] = [
    [4, 28, 4],
    [38, 24, 5],
    [70, 30, 3],
    [108, 32, 4],
  ];
  blocks.forEach(([x, width, floors], index) => {
    const block = apartmentBlock(width, floors, variant ^ (index * 0x45d9f3b));
    canvas.stamp(block, x, HORIZON - block.height);
  });
  canvas.rect(0, HORIZON, SCENE_WIDTH, 3, 'v');
  canvas.rect(0, HORIZON + 3, SCENE_WIDTH, 1, 'V');
  canvas.rect(0, HORIZON + 4, SCENE_WIDTH, 11, 'a');
  for (let x = 2; x < SCENE_WIDTH; x += 10) canvas.rect(x, HORIZON + 9, 5, 1, 'y');
  canvas.rect(0, HORIZON + 15, SCENE_WIDTH, 3, 'v');
  for (const x of [34, 66, 102, 140]) canvas.stamp(LAMP, x, HORIZON - 17);
  canvas.stamp(SMALL_TREE, 58, HORIZON - 7);
  return { rows: canvas.rows(), palette: SCENE_PALETTE };
}

export function composeScene(id: SceneId, variant: number): PixelImage {
  return id === 'urban-blocks' ? urbanBlocks(variant) : ruralVillage(variant);
}
