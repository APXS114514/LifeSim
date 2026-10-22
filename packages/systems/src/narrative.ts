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
        // M3-042：通用人生事件原型（D 级设计假设，文案原创）。
        'early-childhood': {
          'at-home': '在家的日子：吃饭、睡觉，家里人多照看着。',
          errand: '跟着家里人出门办事，走了很远的路。',
          'sick-day': '发了一场小病，家里人轮流照看。',
        },
        'first-words': { spoke: '开口说出了第一个词。' },
        'first-steps': { walked: '迈出了第一步。' },
        'family-time': {
          meal: '一家人一起吃饭。',
          holiday: '逢年过节，一家人聚在一起。',
          radio: '一家人围着收音机听节目。',
          chore: '跟着家里人做家务。',
        },
        'neighborhood-play': {
          yard: '和邻居家的孩子一起玩。',
          field: '在田边地头和邻家的孩子一起跑。',
          street: '在巷子里和邻家的孩子一起玩。',
        },
        'first-playmate': { met: '交到了第一个朋友，常常一起玩。' },
        'school-days': {
          class: '上课、写作业，学校里的日子过得规律。',
          exam: '期末考了一回，成绩还过得去。',
          'sports-day': '参加了学校的运动会。',
          'self-study': '没有上学，跟着家里人认了几个字。',
          'left-school': '已经离开学校，跟着家里人学着做事。',
        },
        'teen-life': {
          confide: '有心事的时候，和相熟的同学聊了很久。',
          sports: '下课后打球、跑步，身体结实起来。',
          reading: '借到一本旧书，翻来覆去看了好几遍。',
        },
        'daily-routine': {
          commute: '每天按点出门、按点回家，日子被工作填满。',
          classes: '在课堂与自习之间来回，一年过得很快。',
          seeking: '一直在找活干，能挣钱的事都问过一遍。',
          'at-home': '留在家里操持日常，日子过得紧。',
          'sick-leave': '身体不太爽利，请了长假在家养着。',
        },
        'household-affairs': {
          repairs: '家里修修补补，花了一笔钱：{{costMinor}}（{{currency}}）。',
          'neighbor-help': '邻里之间互相搭把手。',
          budget: '把一年的收支算了又算，日子得精打细算。',
        },
        'rest-and-recover': {
          rest: '把节奏放慢，好好歇了一阵。',
          holiday: '出去走了一趟，花了 {{costMinor}}（{{currency}}）。',
        },
        'friend-contact': {
          visit: '老朋友来串门，聊了一下午。',
          meal: '和朋友在外面吃了一顿饭，花了 {{costMinor}}（{{currency}}）。',
        },
        'retired-days': {
          walks: '退休后每天出门散步，路线固定。',
          garden: '在院子里种了些花草菜蔬，天天照看。',
          chess: '常和同龄人下棋，输赢都不在意。',
        },
        'old-age-reflection': {
          memories: '翻起旧事，想起了很多年前的日子。',
          photo: '看旧照片，一张一张认过去。',
        },
        'great-age-days': {
          'slow-days': '日子过得很慢，多半时间坐着晒太阳。',
          'family-visits': '家里人常来看望，屋里热闹了一阵。',
        },
        'hobby-found': {
          found: '找到一件愿意长期做下去的爱好：{{hobby}}。',
          choice: {
            pursue: '决定把闲暇时间投进这项爱好。',
            casual: '只是偶尔玩玩，不当正事。',
          },
        },
        'learn-skill': {
          finished: '花时间学会了一项手艺：{{skill}}，花了 {{costMinor}}（{{currency}}）。',
          'gave-up': '试着学了{{skill}}，后来没能坚持。',
          choice: {
            finish: '决定把它学完。',
            'give-up': '决定不再学下去。',
          },
        },
        'minor-mishap': {
          fall: '摔了一跤，好在只是皮外伤，花了 {{costMinor}}（{{currency}}）。',
          'lost-item': '丢了一件随身的东西，花了 {{costMinor}}（{{currency}}）补上。',
          burn: '做饭时烫了手，花了 {{costMinor}}（{{currency}}）买药。',
        },
        'write-letters': {
          sent: '给远方的亲友写了一封信，花了 {{costMinor}}（{{currency}}）邮资。',
          received: '收到一封远方来的信，读了好几遍。',
        },
        reunion: {
          met: '多年没见的同学约着聚了一次，花了 {{costMinor}}（{{currency}}）。',
        },
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
      npc: {
        hired: '{{role}}找到了工作（按{{level}}学历定薪）。',
        'job-search-failed': '{{role}}这一年没有找到工作（{{phase}}）。',
        'job-lost': '{{role}}失去了工作（{{phase}}）。',
        retired: '{{role}}退休，按{{level}}学历领取养老金。',
        'illness-onset': '{{role}}患上了慢性病。',
        death: '{{role}}在 {{age}} 岁去世（{{cause}}）。',
        'polity-change': '{{role}}的政治归属随政体更替改为{{to}}。',
        redenominated:
          '{{role}}的存款随币制改革换算：{{beforeMinor}}（{{fromCurrency}}）→ {{afterMinor}}（{{toCurrency}}）。',
        'estate-redenominated':
          '已故{{role}}的存款随币制改革换算：{{beforeMinor}}（{{fromCurrency}}）→ {{afterMinor}}（{{toCurrency}}）。',
      },
      choice: {
        'yearly-focus': {
          balanced: '这一年以均衡为重点（{{decidedBy}}；效果为设计假设）。',
          study: '这一年以学习为重点（{{decidedBy}}；效果为设计假设）。',
          work: '这一年以工作为重点（{{decidedBy}}；效果为设计假设）。',
          health: '这一年以健康为重点（{{decidedBy}}；效果为设计假设）。',
          family: '这一年以家庭与人际为重点（{{decidedBy}}；效果为设计假设）。',
          leisure: '这一年以休闲为重点（{{decidedBy}}；效果为设计假设）。',
        },
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
      decidedBy: { player: '本人选择', preset: '按预设', principles: '按人生原则' },
      role: { mother: '母亲', father: '父亲', relative: '亲属' },
      education: { none: '未受教育', primary: '小学', secondary: '中学', tertiary: '大学' },
      otherPlace: { 'other-urban': '其他城镇地区', 'other-rural': '其他农村地区' },
      // M3-042：爱好与技能的显示文字（D 级设计假设）。
      hobby: { chess: '下棋', books: '读书', singing: '唱歌', painting: '画画', fishing: '钓鱼' },
      skill: {
        'bicycle-repair': '修自行车',
        sewing: '缝纫',
        woodwork: '木工',
        cooking: '做饭',
        abacus: '打算盘',
      },
    },
  },
  en: {
    templates: {
      life: {
        birth: 'Born into a {{settlement}} family of {{familyResources}} means in {{place}}.',
        death: 'Died at {{age}} ({{cause}}).',
        // M3-042：通用人生事件原型（D 级设计假设，文案原创）。
        'early-childhood': {
          'at-home': 'Days at home: meals, naps, and family keeping watch.',
          errand: 'Went out on errands with family and walked a long way.',
          'sick-day': 'A short illness; family took turns keeping watch.',
        },
        'first-words': { spoke: 'Said the first word.' },
        'first-steps': { walked: 'Took the first steps.' },
        'family-time': {
          meal: 'Ate a meal together with family.',
          holiday: 'The family gathered for a holiday.',
          radio: 'The family gathered around the radio.',
          chore: 'Helped with chores around the home.',
        },
        'neighborhood-play': {
          yard: 'Played with the children from next door.',
          field: 'Ran with neighbouring children along the fields.',
          street: 'Played in the lane with neighbouring children.',
        },
        'first-playmate': { met: 'Made a first friend and played together often.' },
        'school-days': {
          class: 'Classes and homework: school days settled into a routine.',
          exam: 'Sat the end-of-term exams; the results were passable.',
          'sports-day': 'Took part in the school sports day.',
          'self-study': 'Did not attend school; learned a little reading at home.',
          'left-school': 'Out of school now; learned to help with the work at home.',
        },
        'teen-life': {
          confide: 'Talked for a long time with a classmate about what was on the mind.',
          sports: 'Played ball and ran after class; grew stronger.',
          reading: 'Borrowed an old book and read it over and over.',
        },
        'daily-routine': {
          commute: 'Left and came home on schedule; work filled the days.',
          classes: 'Between lectures and study, the year passed quickly.',
          seeking: 'Kept looking for work and asked about every opening.',
          'at-home': 'Stayed at home keeping the household going; money was tight.',
          'sick-leave': 'Unwell, and took a long leave at home.',
        },
        'household-affairs': {
          repairs: 'Repairs around the home cost {{costMinor}} ({{currency}}).',
          'neighbor-help': 'Neighbours lent each other a hand.',
          budget: "Went over the year's budget again and again.",
        },
        'rest-and-recover': {
          rest: 'Slowed down and rested for a while.',
          holiday: 'Took a trip; it cost {{costMinor}} ({{currency}}).',
        },
        'friend-contact': {
          visit: 'An old friend came by and stayed talking all afternoon.',
          meal: 'Ate out with a friend; it cost {{costMinor}} ({{currency}}).',
        },
        'retired-days': {
          walks: 'After retirement, a daily walk along a fixed route.',
          garden: 'Grew flowers and vegetables in the yard and tended them daily.',
          chess: 'Played chess often with people of the same age, win or lose.',
        },
        'old-age-reflection': {
          memories: 'Looked back and remembered days from long ago.',
          photo: 'Went through old photographs one by one.',
        },
        'great-age-days': {
          'slow-days': 'Days passed slowly, mostly sitting in the sun.',
          'family-visits': 'Family visited often; the house was lively for a while.',
        },
        'hobby-found': {
          found: 'Found a hobby worth keeping up: {{hobby}}.',
          choice: {
            pursue: 'Decided to put spare time into the hobby.',
            casual: 'Kept it as an occasional pastime.',
          },
        },
        'learn-skill': {
          finished:
            'Took the time to learn a skill — {{skill}} — at a cost of {{costMinor}} ({{currency}}).',
          'gave-up': 'Tried to learn {{skill}} but did not keep it up.',
          choice: {
            finish: 'Decided to see the course through.',
            'give-up': 'Decided to stop learning it.',
          },
        },
        'minor-mishap': {
          fall: 'Took a fall; only bruises, and {{costMinor}} ({{currency}}) to treat.',
          'lost-item':
            'Lost something carried every day; {{costMinor}} ({{currency}}) to replace it.',
          burn: 'Burned a hand while cooking; {{costMinor}} ({{currency}}) for medicine.',
        },
        'write-letters': {
          sent: 'Wrote a letter to relatives far away; postage was {{costMinor}} ({{currency}}).',
          received: 'A letter arrived from far away and was read several times.',
        },
        reunion: {
          met: 'Classmates who had not met for years got together; it cost {{costMinor}} ({{currency}}).',
        },
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
      npc: {
        hired: 'The {{role}} found a job (paid at the {{level}} level).',
        'job-search-failed': 'The {{role}} could not find a job this year ({{phase}}).',
        'job-lost': 'The {{role}} lost the job ({{phase}}).',
        retired: 'The {{role}} retired with a pension at the {{level}} level.',
        'illness-onset': 'The {{role}} developed a chronic illness.',
        death: 'The {{role}} died at {{age}} ({{cause}}).',
        'polity-change': 'Political allegiance of the {{role}} changed to {{to}}.',
        redenominated:
          'Savings of the {{role}} were converted in the redenomination: {{beforeMinor}} ({{fromCurrency}}) → {{afterMinor}} ({{toCurrency}}).',
        'estate-redenominated':
          'Savings of the late {{role}} were converted in the redenomination: {{beforeMinor}} ({{fromCurrency}}) → {{afterMinor}} ({{toCurrency}}).',
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
        'yearly-focus': {
          balanced: 'Focused on balance this year ({{decidedBy}}; effects are design assumptions).',
          study: 'Focused on study this year ({{decidedBy}}; effects are design assumptions).',
          work: 'Focused on work this year ({{decidedBy}}; effects are design assumptions).',
          health: 'Focused on health this year ({{decidedBy}}; effects are design assumptions).',
          family:
            'Focused on family and relationships this year ({{decidedBy}}; effects are design assumptions).',
          leisure: 'Focused on leisure this year ({{decidedBy}}; effects are design assumptions).',
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
      decidedBy: {
        player: "player's choice",
        preset: 'by preset',
        principles: 'by life principles',
      },
      role: { mother: 'mother', father: 'father', relative: 'relative' },
      education: {
        none: 'no schooling',
        primary: 'primary',
        secondary: 'secondary',
        tertiary: 'university',
      },
      otherPlace: { 'other-urban': 'other urban areas', 'other-rural': 'other rural areas' },
      // M3-042：爱好与技能的显示文字（D 级设计假设）。
      hobby: {
        chess: 'chess',
        books: 'reading',
        singing: 'singing',
        painting: 'painting',
        fishing: 'fishing',
      },
      skill: {
        'bicycle-repair': 'bicycle repair',
        sewing: 'sewing',
        woodwork: 'woodwork',
        cooking: 'cooking',
        abacus: 'the abacus',
      },
    },
  },
} satisfies Record<Locale, unknown>;
