import type { Locale } from '@lifesim/content-schema';

/**
 * 人生事实的双语叙事模板（GDD §10）。键是事实的 `templateId`，占位符来自事实的 `details`。
 * `enums` 是枚举值的显示文字，渲染时按「参数名.值」查找。
 * 地区专有的名称（地名、币种）由地区包另外提供，与这里合并后使用。
 *
 * 结构与 `@lifesim/narrative` 的 MessageTree 一致；两种语言的键与占位符必须完全对应（有测试）。
 */
export const LIFE_NARRATIVE = {
  'zh-Hans': {
    templates: {
      life: {
        birth: '出生在{{place}}的一个{{settlement}}家庭，家境{{familyResources}}。',
        death: '{{age}} 岁去世（{{cause}}）。',
      },
      history: {
        redenomination: '全国实行货币重定值，旧币 {{divisor}} 元兑换新币 1 元。',
        recession: '经济陷入衰退。',
        recovery: '经济走出衰退。',
        'polity-change': '政治实体更替：{{from}} → {{to}}。',
      },
      identity: {
        'polity-change': '政治归属随政体更替改为{{to}}；居住地没有改变。',
      },
      family: {
        parent: '{{role}}当时 {{ageAtBirth}} 岁，教育程度：{{education}}。',
      },
      education: {
        'primary-started': '开始上小学。',
        'not-enrolled': '没有上学。',
        'primary-completed': '小学毕业。',
        'secondary-started': '升入中学。',
        'left-school': '小学毕业后没有继续上学。',
        'secondary-completed': '中学毕业。',
        admitted: '考上了大学。',
        'admission-failed': '没有考上大学。',
        'tertiary-completed': '大学毕业。',
      },
      career: {
        hired: '找到了工作（按{{level}}学历定薪）。',
        'job-search-failed': '这一年没有找到工作（{{phase}}）。',
        'job-lost': '失去了工作（{{phase}}）。',
        retired: '退休，按{{level}}学历领取养老金。',
      },
      finance: {
        settlement:
          '年度收支：收入 {{incomeMinor}}，支出 {{costMinor}}，余额 {{balanceMinor}}（{{currency}}）。',
        redenominated:
          '存款随币制改革换算：{{beforeMinor}}（{{fromCurrency}}）→ {{afterMinor}}（{{toCurrency}}）。',
      },
      health: {
        'illness-onset': '患上了慢性病。',
        'treatment-started': '开始接受治疗，花费 {{costMinor}}（{{currency}}）。',
        'treatment-declined': '没有接受治疗。',
      },
      choice: {
        'after-secondary': {
          'apply-university': '中学毕业后决定报考大学（{{decidedBy}}）。',
          'start-work': '中学毕业后决定直接工作（{{decidedBy}}）。',
        },
        treatment: {
          treat: '决定接受治疗（{{decidedBy}}）。',
          forgo: '决定不接受治疗（{{decidedBy}}）。',
        },
      },
    },
    enums: {
      settlement: { urban: '城市', rural: '农村' },
      familyResources: { low: '贫寒', middle: '一般', high: '殷实' },
      level: { none: '无学历', primary: '小学', secondary: '中学', tertiary: '大学' },
      cause: { illness: '慢性病', other: '其他原因' },
      phase: { normal: '经济正常', recession: '经济衰退中' },
      decidedBy: { player: '本人选择', principles: '按人生原则' },
      role: { mother: '母亲', father: '父亲' },
      education: { none: '未受教育', primary: '小学', secondary: '中学', tertiary: '大学' },
      otherPlace: { 'other-urban': '其他城镇地区', 'other-rural': '其他农村地区' },
    },
  },
  en: {
    templates: {
      life: {
        birth: 'Born into a {{settlement}} family of {{familyResources}} means in {{place}}.',
        death: 'Died at {{age}} ({{cause}}).',
      },
      history: {
        redenomination:
          'Nationwide currency redenomination: {{divisor}} old units became 1 new unit.',
        recession: 'The economy fell into recession.',
        recovery: 'The economy recovered from recession.',
        'polity-change': 'The political entity changed: {{from}} → {{to}}.',
      },
      identity: {
        'polity-change':
          'Political allegiance changed to {{to}}; the place of residence did not change.',
      },
      family: {
        parent: 'Your {{role}} was {{ageAtBirth}} then; education: {{education}}.',
      },
      education: {
        'primary-started': 'Started primary school.',
        'not-enrolled': 'Never started school.',
        'primary-completed': 'Finished primary school.',
        'secondary-started': 'Went on to secondary school.',
        'left-school': 'Left school after primary.',
        'secondary-completed': 'Finished secondary school.',
        admitted: 'Was admitted to university.',
        'admission-failed': 'Was not admitted to university.',
        'tertiary-completed': 'Graduated from university.',
      },
      career: {
        hired: 'Found a job (paid at the {{level}} level).',
        'job-search-failed': 'Could not find a job this year ({{phase}}).',
        'job-lost': 'Lost the job ({{phase}}).',
        retired: 'Retired with a pension at the {{level}} level.',
      },
      finance: {
        settlement:
          "Year's finances: income {{incomeMinor}}, spending {{costMinor}}, balance {{balanceMinor}} ({{currency}}).",
        redenominated:
          'Savings converted in the redenomination: {{beforeMinor}} ({{fromCurrency}}) → {{afterMinor}} ({{toCurrency}}).',
      },
      health: {
        'illness-onset': 'Developed a chronic illness.',
        'treatment-started': 'Began treatment, costing {{costMinor}} ({{currency}}).',
        'treatment-declined': 'Went without treatment.',
      },
      choice: {
        'after-secondary': {
          'apply-university':
            'After secondary school, chose to apply to university ({{decidedBy}}).',
          'start-work': 'After secondary school, chose to start working ({{decidedBy}}).',
        },
        treatment: {
          treat: 'Chose to seek treatment ({{decidedBy}}).',
          forgo: 'Chose not to seek treatment ({{decidedBy}}).',
        },
      },
    },
    enums: {
      settlement: { urban: 'urban', rural: 'rural' },
      familyResources: { low: 'modest', middle: 'moderate', high: 'comfortable' },
      level: {
        none: 'no-schooling',
        primary: 'primary',
        secondary: 'secondary',
        tertiary: 'university',
      },
      cause: { illness: 'chronic illness', other: 'other causes' },
      phase: { normal: 'normal economy', recession: 'during a recession' },
      decidedBy: { player: "player's choice", principles: 'by life principles' },
      role: { mother: 'mother', father: 'father' },
      education: {
        none: 'no schooling',
        primary: 'primary',
        secondary: 'secondary',
        tertiary: 'university',
      },
      otherPlace: { 'other-urban': 'other urban areas', 'other-rural': 'other rural areas' },
    },
  },
} satisfies Record<Locale, unknown>;
