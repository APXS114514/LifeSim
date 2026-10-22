import {
  addSkill,
  canAffordLivingCostShare,
  chargeLivingCostShare,
  costDetails,
  nudgeParentBonds,
  nudgeStress,
  nudgeTies,
  type LifeEventPrototype,
  type LifeEventVariant,
  type PrototypeInput,
  type VariantOutcome,
} from './life-events.ts';

/**
 * M3-042 通用人生事件原型目录 v1（20 个）。概率、窗口、上限与后果全部是 D 级设计假设，
 * 与 `docs/tasks/M3-042.md` 的表 A、表 B 和逐原型规格一一对应；改这里要同时改任务文件里的表。
 *
 * 只有数据与纯函数：`when` 只读输入，`apply` 只通过 life-events.ts 的工具函数写状态，都不抽随机数。
 */

const OPEN_ERA = { from: 1950, to: null } as const;

/** 学一门手艺的学费：当年生活费的 5%。 */
const LEARN_SKILL_TUITION = 0.05;

/** 只调压力（可选地再调社交联系与对父母的感受）的变体。 */
function calm(
  id: string,
  stress: number,
  extra: { ties?: number; trust?: number; intimacy?: number } = {},
  when?: LifeEventVariant['when'],
): LifeEventVariant {
  return {
    id,
    ...(when ? { when } : {}),
    apply(input) {
      nudgeStress(input, stress);
      if (extra.ties !== undefined) nudgeTies(input, extra.ties);
      if (extra.trust !== undefined || extra.intimacy !== undefined) {
        nudgeParentBonds(input, {
          ...(extra.trust !== undefined ? { trust: extra.trust } : {}),
          ...(extra.intimacy !== undefined ? { intimacy: extra.intimacy } : {}),
        });
      }
      return {};
    },
  };
}

/** 在 {@link calm} 之外花一笔生活费；`shown` 为真时把金额写进事实（模板里有 `{{costMinor}}`）。 */
function spend(
  id: string,
  share: number,
  shown: boolean,
  effects: (input: PrototypeInput) => void,
): LifeEventVariant {
  return {
    id,
    apply(input): VariantOutcome {
      effects(input);
      const cost = chargeLivingCostShare(input, share);
      return shown ? { details: costDetails(input, cost) } : {};
    },
  };
}

const rural = (input: PrototypeInput) => input.actor.origin.settlement === 'rural';
const urban = (input: PrototypeInput) => input.actor.origin.settlement === 'urban';
const enrolled = (input: PrototypeInput) => input.actor.education.enrolledIn !== null;
const untreatedIllness = (input: PrototypeInput) =>
  input.actor.health.conditions.some((condition) => !condition.treated);

export const LIFE_EVENT_CATALOG: readonly LifeEventPrototype[] = [
  {
    id: 'early-childhood',
    ages: { from: 1, to: 6 },
    era: OPEN_ERA,
    annualProbability: 0.65,
    lifetimeCap: 6,
    coverageFloor: true,
    variants: ['at-home', 'errand', 'sick-day'].map((id) => calm(id, -0.04, { intimacy: 0.03 })),
  },
  {
    id: 'first-words',
    ages: { from: 1, to: 2 },
    era: OPEN_ERA,
    annualProbability: 0.7,
    // 「第一次」只能发生一次（规格原为 2，会出现两次「第一次开口」，见实施记录）。
    lifetimeCap: 1,
    coverageFloor: true,
    variants: [calm('spoke', -0.02, { intimacy: 0.04 })],
  },
  {
    id: 'first-steps',
    ages: { from: 1, to: 2 },
    era: OPEN_ERA,
    annualProbability: 0.7,
    lifetimeCap: 1,
    coverageFloor: true,
    variants: [calm('walked', -0.02, { intimacy: 0.04 })],
  },
  {
    id: 'family-time',
    ages: { from: 2, to: 17 },
    era: OPEN_ERA,
    annualProbability: 0.6,
    lifetimeCap: 16,
    coverageFloor: true,
    variants: [
      calm('meal', -0.05, { trust: 0.02, intimacy: 0.02 }),
      calm('holiday', -0.07, { trust: 0.02, intimacy: 0.03 }),
      // 家庭广播在五地 1950 年代已存在，1990 年代中期后让位于电视与网络（D 级）。
      { ...calm('radio', -0.04, { trust: 0.01, intimacy: 0.02 }), era: { from: 1950, to: 1995 } },
      calm('chore', 0.01, { intimacy: 0.01 }),
    ],
  },
  {
    id: 'neighborhood-play',
    ages: { from: 3, to: 11 },
    era: OPEN_ERA,
    annualProbability: 0.6,
    lifetimeCap: 9,
    coverageFloor: true,
    variants: [
      calm('yard', -0.05, { ties: 0.04 }),
      calm('field', -0.05, { ties: 0.04 }, rural),
      calm('street', -0.05, { ties: 0.04 }, urban),
    ],
  },
  {
    id: 'first-playmate',
    ages: { from: 4, to: 10 },
    era: OPEN_ERA,
    annualProbability: 0.3,
    lifetimeCap: 1,
    coverageFloor: true,
    variants: [calm('met', -0.03, { ties: 0.1 })],
  },
  {
    id: 'school-days',
    ages: { from: 7, to: 18 },
    era: OPEN_ERA,
    annualProbability: 0.55,
    lifetimeCap: 12,
    coverageFloor: true,
    variants: [
      calm('class', -0.02, { ties: 0.01, trust: 0.01 }, enrolled),
      calm('exam', 0.05, { ties: 0.01, trust: 0.01 }, enrolled),
      calm('sports-day', -0.03, { ties: 0.01, trust: 0.01 }, enrolled),
      // 「没有上学，跟着家里人认字」只适用于从没上过学的人。
      calm(
        'self-study',
        0,
        { ties: 0.01, trust: 0.01 },
        (input) => !enrolled(input) && input.actor.education.completed === 'none',
      ),
      // 已经毕业或辍学、不再上学的人（规格的 self-study 文案不适用于他们，见实施记录）。
      calm(
        'left-school',
        0,
        { ties: 0.01, trust: 0.01 },
        (input) => !enrolled(input) && input.actor.education.completed !== 'none',
      ),
    ],
  },
  {
    id: 'teen-life',
    ages: { from: 12, to: 18 },
    era: OPEN_ERA,
    annualProbability: 0.55,
    lifetimeCap: 7,
    coverageFloor: true,
    variants: [
      calm('confide', -0.04, { ties: 0.03 }),
      calm('sports', -0.03, { ties: 0.03 }),
      calm('reading', -0.02),
    ],
  },
  {
    id: 'daily-routine',
    ages: { from: 18, to: 60 },
    era: OPEN_ERA,
    annualProbability: 0.6,
    lifetimeCap: 43,
    coverageFloor: true,
    // 变体互斥：未治疗的慢性病优先，其次按就业状态；每年恰好一个可用变体，不改变是否发生。
    variants: [
      calm('sick-leave', 0.04, {}, untreatedIllness),
      calm(
        'commute',
        0.02,
        { ties: 0.01 },
        (input) => !untreatedIllness(input) && input.actor.employment.status === 'employed',
      ),
      calm(
        'classes',
        0.01,
        {},
        (input) => !untreatedIllness(input) && input.actor.employment.status === 'student',
      ),
      calm(
        'seeking',
        0.06,
        {},
        (input) => !untreatedIllness(input) && input.actor.employment.status === 'unemployed',
      ),
      calm(
        'at-home',
        0.01,
        {},
        (input) =>
          !untreatedIllness(input) &&
          !['employed', 'student', 'unemployed'].includes(input.actor.employment.status),
      ),
    ],
  },
  {
    id: 'household-affairs',
    ages: { from: 18, to: 65 },
    era: OPEN_ERA,
    annualProbability: 0.55,
    lifetimeCap: 48,
    coverageFloor: true,
    variants: [
      spend('repairs', 0.05, true, (input) => {
        nudgeStress(input, 0.02);
        nudgeParentBonds(input, { trust: 0.02 });
      }),
      spend('neighbor-help', 0.005, false, (input) => {
        nudgeStress(input, -0.01);
        nudgeTies(input, 0.03);
      }),
      calm('budget', 0.03),
    ],
  },
  {
    id: 'rest-and-recover',
    ages: { from: 18, to: 80 },
    era: OPEN_ERA,
    annualProbability: 0.55,
    lifetimeCap: 63,
    coverageFloor: true,
    variants: [
      calm('rest', -0.08),
      spend('holiday', 0.03, true, (input) => {
        nudgeStress(input, -0.1);
      }),
    ],
  },
  {
    id: 'friend-contact',
    ages: { from: 25, to: 105 },
    era: OPEN_ERA,
    annualProbability: 0.4,
    lifetimeCap: 81,
    coverageFloor: true,
    variants: [
      calm('visit', -0.05, { ties: 0.05 }),
      spend('meal', 0.02, true, (input) => {
        nudgeStress(input, -0.04);
        nudgeTies(input, 0.05);
      }),
    ],
  },
  {
    id: 'retired-days',
    ages: { from: 60, to: 105 },
    era: OPEN_ERA,
    annualProbability: 0.55,
    lifetimeCap: 46,
    coverageFloor: true,
    variants: [
      calm('walks', -0.04, { ties: 0.02 }),
      calm('garden', -0.05, { ties: 0.02 }),
      calm('chess', -0.03, { ties: 0.02 }),
    ],
  },
  {
    id: 'old-age-reflection',
    ages: { from: 65, to: 105 },
    era: OPEN_ERA,
    annualProbability: 0.4,
    lifetimeCap: 41,
    coverageFloor: true,
    variants: [calm('memories', -0.03), calm('photo', -0.02)],
  },
  {
    id: 'great-age-days',
    ages: { from: 80, to: 105 },
    era: OPEN_ERA,
    annualProbability: 0.5,
    lifetimeCap: 26,
    coverageFloor: true,
    variants: [
      calm('slow-days', 0, { ties: 0.02 }),
      calm('family-visits', -0.04, { ties: 0.02, intimacy: 0.02 }),
    ],
  },
  {
    id: 'hobby-found',
    ages: { from: 6, to: 16 },
    era: OPEN_ERA,
    annualProbability: 0.25,
    lifetimeCap: 3,
    // 风味型：它有选择与主题，期望次数按「风味型」计（规格 §频率预算 §3），不参与覆盖下界。
    coverageFloor: false,
    topics: ['chess', 'books', 'singing', 'painting', 'fishing'].map((id) => ({ id })),
    // 已经有的爱好不再「找到」一次。
    topicAvailable: (input, topic) =>
      !input.actor.skills.some((skill) => skill.id === `interest:${topic}`),
    variants: [
      {
        // 第一段就发出「找到爱好」，第二段的选择接在它后面（叙事顺序）。
        id: 'found',
        apply(input) {
          nudgeParentBonds(input, { trust: 0.01 });
          // 入门材料的花费不进叙事（模板只说找到了爱好）。
          chargeLivingCostShare(input, 0.01);
          return { details: { hobby: topicOf(input) } };
        },
      },
    ],
    decision: {
      major: false,
      optionIds: ['pursue', 'casual'],
      settle(input) {
        const pursue = input.choice === 'pursue';
        nudgeStress(input, pursue ? 0.02 : -0.02);
        addSkill(input, `interest:${topicOf(input)}`, pursue ? 0.55 : 0.3);
      },
      options: () => [
        {
          id: 'pursue',
          eligible: true,
          scores: { knowledge: 0.8, wealth: -0.2, stability: -0.2 },
        },
        { id: 'casual', eligible: true, scores: { stability: 0.4, knowledge: -0.1 } },
      ],
    },
  },
  {
    id: 'learn-skill',
    ages: { from: 16, to: 55 },
    era: OPEN_ERA,
    annualProbability: 0.14,
    lifetimeCap: 5,
    coverageFloor: false,
    topics: [
      { id: 'bicycle-repair' },
      { id: 'sewing' },
      { id: 'woodwork' },
      { id: 'cooking' },
      // 算盘在 2000 年后不再是常见的新学手艺（D 级）。
      { id: 'abacus', era: { from: 1950, to: 2000 } },
    ],
    // 已经学成的手艺不再学一次；没坚持下来的可以再试。
    topicAvailable: (input, topic) =>
      !input.actor.skills.some((skill) => skill.id === `skill:${topic}` && skill.level >= 0.7),
    variants: [
      {
        id: 'finished',
        when: (input) => input.choice === 'finish',
        apply(input) {
          addSkill(input, `skill:${topicOf(input)}`, 0.7);
          nudgeStress(input, 0.03);
          const cost = chargeLivingCostShare(input, LEARN_SKILL_TUITION);
          return { details: { skill: topicOf(input), ...costDetails(input, cost) } };
        },
      },
      {
        id: 'gave-up',
        when: (input) => input.choice === 'give-up',
        apply(input) {
          addSkill(input, `skill:${topicOf(input)}`, 0.25);
          nudgeStress(input, -0.01);
          chargeLivingCostShare(input, 0.02);
          return { details: { skill: topicOf(input) } };
        },
      },
    ],
    decision: {
      major: false,
      optionIds: ['finish', 'give-up'],
      options: (input) => {
        const affordable = canAffordLivingCostShare(input, LEARN_SKILL_TUITION);
        return [
          {
            id: 'finish',
            eligible: affordable,
            ...(affordable ? {} : { ineligibleReason: 'unaffordable' }),
            scores: { knowledge: 0.9, wealth: -0.5, stability: -0.2 },
          },
          {
            id: 'give-up',
            eligible: true,
            scores: { wealth: 0.3, stability: 0.4, knowledge: -0.2 },
          },
        ];
      },
    },
  },
  {
    id: 'minor-mishap',
    ages: { from: 6, to: 70 },
    era: OPEN_ERA,
    annualProbability: 0.1,
    lifetimeCap: 7,
    coverageFloor: false,
    // 不新增慢性病、不改死亡率：只动钱、压力与家里人的关照。
    variants: (
      [
        ['fall', 0.005],
        ['lost-item', 0.01],
        ['burn', 0.005],
      ] as const
    ).map(([id, share]) =>
      spend(id, share, true, (input) => {
        nudgeStress(input, 0.06);
        nudgeParentBonds(input, { intimacy: 0.02 });
      }),
    ),
  },
  {
    id: 'write-letters',
    ages: { from: 16, to: 50 },
    // 1990 年代后电话、2000 年代后短信与电子邮件取代日常书信，保守地在 2005 年截止（D 级）。
    era: { from: 1950, to: 2005 },
    annualProbability: 0.15,
    lifetimeCap: 35,
    coverageFloor: true,
    variants: [
      spend('sent', 0.003, true, (input) => {
        nudgeStress(input, -0.02);
        nudgeTies(input, 0.03);
      }),
      calm('received', -0.03, { ties: 0.03 }),
    ],
  },
  {
    id: 'reunion',
    ages: { from: 30, to: 74 },
    // 同学会需要中等教育有一定普及；没有逐国依据，保守地从 1965 年起（D 级）。
    era: { from: 1965, to: null },
    annualProbability: 0.1,
    lifetimeCap: 4,
    coverageFloor: false,
    // 没上过学的人没有「同学」。
    eligible: (input) => input.actor.education.completed !== 'none',
    variants: [
      spend('met', 0.04, true, (input) => {
        nudgeStress(input, -0.05);
        nudgeTies(input, 0.08);
      }),
    ],
  },
];

function topicOf(input: PrototypeInput): string {
  if (input.topic === null) throw new Error('Life event topic is missing');
  return input.topic;
}

export function lifeEventCatalog(): readonly LifeEventPrototype[] {
  return LIFE_EVENT_CATALOG;
}
