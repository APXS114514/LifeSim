import { PixelCanvas, pick, sprite, type Palette, type Sprite } from './sprite.ts';

/**
 * 像素头像（M4-022）：按人生阶段选头身模板，按年代与城乡选服装颜色。
 *
 * 美术方针：差异来自人生阶段、服装与年代，不来自族裔特征。肤色与发色只在一组自然的
 * 中性范围里按散列挑选，与出生地区无关；地区与年代的差别交给场景与服饰（见 ART 任务）。
 */

export type LifeStage = 'infant' | 'child' | 'teen' | 'adult' | 'elder';

/** 年龄 → 人生阶段（只用于选画面，不影响任何规则）。 */
export function lifeStageFor(age: number): LifeStage {
  if (age < 3) return 'infant';
  if (age < 12) return 'child';
  if (age < 18) return 'teen';
  if (age < 60) return 'adult';
  return 'elder';
}

// 字符：h 头发 s 皮肤 S 皮肤阴影 e 眼睛 m 嘴 p 脸颊 c 衣服 C 衣服阴影 w 领口 b 襁褓 B 襁褓阴影
const ADULT = sprite([
  '........................',
  '........................',
  '........hhhhhhhh........',
  '......hhhhhhhhhhhh......',
  '.....hhhhhhhhhhhhhh.....',
  '.....hhhhhhhhhhhhhh.....',
  '.....hhhhssssssshhh.....',
  '.....hhsssssssssshh.....',
  '.....hssssssssssssh.....',
  '.....hsssessssesssh.....',
  '.....ssssssssssssss.....',
  '......ssssssssssss......',
  '......sssssmmsssss......',
  '......SssssssssssS......',
  '.......SSssssssSS.......',
  '........SSSSSSSS........',
  '..........SSSS..........',
  '.....ccccwSSSSwcccc.....',
  '...ccccccwwSSwwcccccc...',
  '..cccccccccwwccccccccc..',
  '.cccccccccccccccccccccc.',
  '.ccCccccccccccccccccCcc.',
  'cccCccccccccccccccccCccc',
  'cccCccccccccccccccccCccc',
]);

const ELDER = sprite([
  '........................',
  '........................',
  '........hhhhhhhh........',
  '......hhssssssssss......',
  '.....hhsssssssssshh.....',
  '.....hssssssssssssh.....',
  '.....hsSSssssssSSsh.....',
  '.....hssssssssssssh.....',
  '.....hssssssssssssh.....',
  '.....hsssessssesssh.....',
  '.....ssssssssssssss.....',
  '......sSssssssssSs......',
  '......sssssmmsssss......',
  '......SssssssssssS......',
  '.......SSssssssSS.......',
  '........SSSSSSSS........',
  '..........SSSS..........',
  '.....ccccwSSSSwcccc.....',
  '...ccccccwwSSwwcccccc...',
  '..cccccccccwwccccccccc..',
  '.cccccccccccccccccccccc.',
  '.ccCccccccccccccccccCcc.',
  'cccCccccccccccccccccCccc',
  'cccCccccccccccccccccCccc',
]);

const CHILD = sprite([
  '........................',
  '........................',
  '........................',
  '........hhhhhhhh........',
  '......hhhhhhhhhhhh......',
  '.....hhhhhhhhhhhhhh.....',
  '.....hhhhhhhhhhhhhh.....',
  '.....hhsssssssssshh.....',
  '.....hsssessssesssh.....',
  '.....ssssssssssssss.....',
  '.....ssspssmmsspsss.....',
  '......ssssssssssss......',
  '.......SSSssssSSS.......',
  '.........SSSSSS.........',
  '.......ccccwwcccc.......',
  '.....cccccccccccccc.....',
  '....cccccccccccccccc....',
  '...cccccccccccccccccc...',
  '...ccCccccccccccccCcc...',
  '...ccCccccccccccccCcc...',
  '...ccCccccccccccccCcc...',
  '...ccCccccccccccccCcc...',
  '...ccCccccccccccccCcc...',
  '...ccCccccccccccccCcc...',
]);

const INFANT = sprite([
  '........................',
  '........................',
  '........................',
  '..........hhh...........',
  '........ssssssss........',
  '.......ssssssssss.......',
  '......ssssssssssss......',
  '......ssssssssssss......',
  '.....ssssessssessss.....',
  '.....ssssssssssssss.....',
  '.....ssspssmmsspsss.....',
  '......ssssssssssss......',
  '.......SSssssssSS.......',
  '......bbbbbbbbbbbb......',
  '.....bbbbbbbbbbbbbb.....',
  '....bbbbBbbbbbbBbbbb....',
  '....bbbbbBbbbbBbbbbb....',
  '....bbbbbbBbbBbbbbbb....',
  '....bbbbbbbBBbbbbbbb....',
  '.....bbbbbbbbbbbbbb.....',
  '......bbbbbbbbbbbb......',
  '........................',
  '........................',
  '........................',
]);

/** 长发：在两侧加发束（儿童、少年、成年可用）。 */
const LONG_HAIR = sprite([
  ...Array.from({ length: 9 }, () => '........................'),
  '.....h............h.....',
  '....hh............hh....',
  '....hh............hh....',
  '....hh............hh....',
  '....h..............h....',
  ...Array.from({ length: 10 }, () => '........................'),
]);

const TEMPLATES: Record<LifeStage, Sprite> = {
  infant: INFANT,
  child: CHILD,
  teen: ADULT,
  adult: ADULT,
  elder: ELDER,
};

/** 自然的中性肤色范围（与地区无关）。每项：[主色, 阴影, 脸颊]。 */
const SKIN_TONES: readonly (readonly [string, string, string])[] = [
  ['#f2cfb1', '#dcae8c', '#eeaa9a'],
  ['#e8bd98', '#cf9f7b', '#e39d86'],
  ['#dcae86', '#c1926b', '#d68f78'],
];

/** 深色发色范围；老年统一转为灰白。 */
const HAIR_TONES = ['#2a2320', '#3a2b24', '#4a3829'] as const;
const ELDER_HAIR = '#bdbab3';

/**
 * 服装颜色按年代分组（纺织与成衣的常见色调随年代变亮）；同一组里按散列挑选。
 * 这是设计假设，只影响画面。
 */
const CLOTHING_BY_ERA: readonly {
  readonly from: number;
  readonly colors: readonly (readonly [string, string])[];
}[] = [
  {
    from: 1950,
    colors: [
      ['#55708a', '#425a70'],
      ['#6d7454', '#565c42'],
      ['#7d6e57', '#645745'],
    ],
  },
  {
    from: 1970,
    colors: [
      ['#34587a', '#284660'],
      ['#7a5c45', '#614836'],
      ['#3f6f70', '#305757'],
    ],
  },
  {
    from: 1990,
    colors: [
      ['#8a3f4c', '#6e313c'],
      ['#3d6a9a', '#30547b'],
      ['#5f666e', '#4a5057'],
    ],
  },
  {
    from: 2010,
    colors: [
      ['#3d8fc4', '#2f74a0'],
      ['#c76b5c', '#a5574a'],
      ['#3b4249', '#2c3238'],
    ],
  },
];

/** 中小学阶段的校服：深色上衣、白色领口（不区分地区）。 */
const SCHOOL_UNIFORM: readonly [string, string] = ['#2f3e55', '#243044'];
const BLANKET: readonly [string, string] = ['#f4e2b8', '#e2cb94'];

export interface AvatarInput {
  readonly stage: LifeStage;
  /** 画面所在的公历年份（决定服装色调）。 */
  readonly year: number;
  /** 确定性散列（例如种子 + 角色 ID），只用来挑美术变体。 */
  readonly variant: number;
}

export interface PixelImage {
  readonly rows: readonly string[];
  readonly palette: Palette;
}

export function composeAvatar(input: AvatarInput): PixelImage {
  const template = TEMPLATES[input.stage];
  const canvas = new PixelCanvas(template.width, template.height).stamp(template, 0, 0);
  const longHair =
    (input.stage === 'child' || input.stage === 'teen' || input.stage === 'adult') &&
    pick([false, true], input.variant, 3);
  if (longHair) canvas.stamp(LONG_HAIR, 0, 0);

  const [skin, skinShade, cheek] = pick(SKIN_TONES, input.variant, 1);
  const hair = input.stage === 'elder' ? ELDER_HAIR : pick(HAIR_TONES, input.variant, 2);
  const era =
    [...CLOTHING_BY_ERA].reverse().find((entry) => input.year >= entry.from) ?? CLOTHING_BY_ERA[0];
  const [cloth, clothShade] =
    input.stage === 'child' || input.stage === 'teen'
      ? input.stage === 'teen'
        ? SCHOOL_UNIFORM
        : pick(era?.colors ?? [SCHOOL_UNIFORM], input.variant, 4)
      : pick(era?.colors ?? [SCHOOL_UNIFORM], input.variant, 4);

  return {
    rows: canvas.rows(),
    palette: {
      h: hair,
      s: skin,
      S: skinShade,
      p: cheek,
      e: '#1f1a17',
      m: '#a8624f',
      c: cloth,
      C: clothShade,
      w: '#f3f1ea',
      b: BLANKET[0],
      B: BLANKET[1],
    },
  };
}
