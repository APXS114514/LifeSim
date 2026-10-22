import type {
  CountryPackManifest,
  CurrencyVersion,
  EducationLevel,
  EvidenceMeta,
  HistoricalAnchor,
  Indicator,
  Locale,
} from '@lifesim/content-schema';
import { syntheticFamilyName, syntheticGivenName } from './names.ts';
import { expDet, lnDet } from '@lifesim/simulation-core';
import type {
  DataValue,
  EducationSystem,
  RegionModel,
  RegionQueries,
  RegionRules,
  RegionTable,
  RegionTables,
} from '@lifesim/systems';

/**
 * 合成地区「ZZ-SYN」（虚构）。
 *
 * **全部数值都是 D 类游戏设计假设（GDD §9.1），不对应任何真实国家或统计。**
 * 它只用于 M1：验证模拟内核与人生系统的因果链、确定性和性能。
 * 公式与取值理由见 docs/adr/0003-synthetic-world.md。不得进入公开构建，也不得被当作史实展示。
 */

export const SYNTHETIC_PACK_ID = 'ZZ-SYN';
const POLITY = 'polity:syn-republic';
const DATA_VERSION = 'synthetic-1';

function evidence(methodId: string, yearRange: [number, number] = [1950, 2200]): EvidenceMeta {
  return {
    grade: 'D',
    sourceIds: ['adr:0003'],
    modelVersion: DATA_VERSION,
    geographyId: POLITY,
    yearRange,
    methodId,
  };
}

const EVIDENCE: Record<RegionTable, EvidenceMeta> = {
  population: evidence('syn-linear-urbanization'),
  mortality: evidence('syn-gompertz-makeham'),
  illness: evidence('syn-linear-onset'),
  education: evidence('syn-linear-expansion'),
  labor: evidence('syn-flat-hazards'),
  prices: evidence('syn-exponential-index'),
  history: evidence('syn-anchor-list'),
};

const ANCHORS: HistoricalAnchor[] = [
  {
    id: 'anchor:syn-redenomination-1970',
    at: '1970-01-01',
    regionIds: [SYNTHETIC_PACK_ID],
    evidence: evidence('syn-anchor-list', [1970, 1970]),
    kind: 'redenomination',
    currencyCode: 'SYN',
    fromVersion: 1,
    toVersion: 2,
    divisor: 100,
  },
  ...(
    [
      ['anchor:syn-recession-1990', '1990-07-01', 'recession'],
      ['anchor:syn-recovery-1994', '1994-01-01', 'normal'],
      ['anchor:syn-recession-2009', '2009-01-01', 'recession'],
      ['anchor:syn-recovery-2011', '2011-01-01', 'normal'],
    ] as const
  ).map(([id, at, phase]): HistoricalAnchor => ({
    id,
    at,
    regionIds: [SYNTHETIC_PACK_ID],
    evidence: evidence('syn-anchor-list', [Number(at.slice(0, 4)), Number(at.slice(0, 4))]),
    kind: 'economy-phase',
    phase,
  })),
];

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));
const lerp = (from: number, to: number, t: number) => from + (to - from) * t;
/** 年份在 [from, to] 区间内的进度，0–1。 */
const progress = (year: number, from: number, to: number) =>
  clamp((year - from) / (to - from), 0, 1);
/** 以 1990 年为基准的复合增长，用确定性的 exp/ln 计算。 */
const growth = (year: number, rate: number) => expDet((year - 1990) * lnDet(1 + rate));

/** 1990 年新币（SYN-2）计价的年实际工资，主币单位。 */
const REAL_WAGE: Record<EducationLevel, number> = {
  none: 9_000,
  primary: 12_000,
  secondary: 16_000,
  tertiary: 26_000,
};
const REAL_LIVING_COST = { urban: 11_000, rural: 8_000 } as const;

/** 1970 年重定值前的旧币，100 元兑新币 1 元。 */
function unitsPerNewUnit(currency: CurrencyVersion): number {
  if (currency.code !== 'SYN') throw new Error(`Unexpected currency ${currency.code}`);
  if (currency.version === 1) return 100;
  if (currency.version === 2) return 1;
  throw new Error(`Unknown SYN version ${currency.version}`);
}

/** 主币金额 → 指定币制下的整数最小单位（分）。 */
function toMinor(newUnitAmount: number, currency: CurrencyVersion): number {
  return Math.round(newUnitAmount * unitsPerNewUnit(currency) * 100);
}

const nominal = (real: number, year: number, realGrowth: number) =>
  real * growth(year, realGrowth) * growth(year, 0.04);

const TABLE_FOR: Record<Indicator, RegionTable> = {
  births: 'population',
  'life-table-qx': 'mortality',
  'urban-share': 'population',
  'education-enrollment-secondary': 'education',
  'education-completion-upper-secondary': 'education',
  'labor-force-participation': 'labor',
  'employment-agriculture-share': 'labor',
  'cpi-index': 'prices',
  'health-out-of-pocket-share': 'illness',
  'health-expenditure-per-capita': 'illness',
  'sex-ratio-at-birth': 'population',
};

/** 合成地区的 D 级查询值；全部是设计假设，不是统计。 */
function syntheticValue(indicator: Indicator, year: number): DataValue | null {
  const value =
    indicator === 'education-enrollment-secondary'
      ? 70
      : indicator === 'education-completion-upper-secondary'
        ? 0.5
        : indicator === 'labor-force-participation'
          ? 0.65
          : indicator === 'employment-agriculture-share'
            ? 0.35
            : indicator === 'cpi-index'
              ? 100
              : indicator === 'health-out-of-pocket-share'
                ? 0.3
                : indicator === 'health-expenditure-per-capita'
                  ? 500
                  : null;
  if (value === null) return null;
  return {
    value,
    grade: 'D',
    quality: 'assumption',
    sourceIds: ['adr:0003'],
    sourceYear: year,
    projected: false,
  };
}

const SYNTHETIC_TABLES: RegionTables = {
  value: (indicator, year) => syntheticValue(indicator, year),
  ageValue: (indicator, year) =>
    indicator === 'life-table-qx' ? syntheticValue(indicator, year) : null,
  evidenceFor: (indicator) => EVIDENCE[TABLE_FOR[indicator]],
};

/**
 * 合成地区的学制基线（D 级设计假设，ADR-0003）。`systemAt` 与 `rules` 引用同一组常数，
 * 保证「按年查询学制」与旧的学制常数**完全等价**：合成人生与黄金指纹不因 M3-012 的接口变化而改变。
 */
const SYNTHETIC_RULES: RegionRules = {
  primaryStartAge: 6,
  primaryYears: 6,
  secondaryYears: 6,
  tertiaryYears: 4,
  minimumWorkingAge: 15,
  retirementAge: 60,
  pensionRate: 0.5,
  treatmentAvailableFrom: 1965,
  treatmentAnnualCostShare: 0.2,
};

/** 合成地区的 D 级学制：没有义务教育与升学考试，也不收学费（与旧行为等价）。 */
const SYNTHETIC_EDUCATION: EducationSystem = {
  primaryStartAge: SYNTHETIC_RULES.primaryStartAge,
  primaryYears: SYNTHETIC_RULES.primaryYears,
  secondaryYears: SYNTHETIC_RULES.secondaryYears,
  tertiaryYears: SYNTHETIC_RULES.tertiaryYears,
  compulsoryYears: 0,
  entranceExam: { kind: 'none' },
  feeShare: 0,
  grade: 'D',
  sourceIds: ['adr:0003'],
};

const SYNTHETIC_QUERIES: RegionQueries = {
  education: {
    secondaryEnrollmentRate: (year) => syntheticValue('education-enrollment-secondary', year),
    upperSecondaryCompletionRate: (year) =>
      syntheticValue('education-completion-upper-secondary', year),
    systemAt: () => SYNTHETIC_EDUCATION,
  },
  labor: {
    participationRate: (year) => syntheticValue('labor-force-participation', year),
    agricultureShare: (year) => syntheticValue('employment-agriculture-share', year),
  },
  prices: {
    cpi: (year) => syntheticValue('cpi-index', year),
    toRealMinor: (nominalMinor) => nominalMinor,
  },
  health: {
    outOfPocketShare: (year) => syntheticValue('health-out-of-pocket-share', year),
    expenditurePerCapitaUsd: (year) => syntheticValue('health-expenditure-per-capita', year),
  },
};

export const syntheticRegion: RegionModel = {
  packId: SYNTHETIC_PACK_ID,
  dataVersion: DATA_VERSION,
  polityId: POLITY,
  evidence: EVIDENCE,
  anchors: ANCHORS,
  initialMacro: { economyPhase: 'normal', currency: { code: 'SYN', version: 1 } },
  tables: SYNTHETIC_TABLES,
  queries: SYNTHETIC_QUERIES,
  sexRatioAtBirth: () => 100, // D 级合成基线，独立于真实地区。
  names: {
    scheme: 'zh', // 仅借用姓在前的排序；音节与表引用均标明 synthetic。
    select(part, request, random) {
      const text =
        part === 'family' ? syntheticFamilyName(random) : syntheticGivenName(request.sex, random);
      return { table: `synthetic-${part}`, id: text.toLowerCase() };
    },
    patronymic: () => null,
  },
  rules: SYNTHETIC_RULES,
  effects: {
    illnessHiringFactor: 0.6,
    illnessJobLossFactor: 2,
    povertyIllnessFactor: 1.5,
    mortality: {
      untreatedIllness: 2.5,
      treatedIllness: 1.4,
      poverty: 1.3,
      tertiaryEducation: 0.85,
    },
  },

  placeId: (settlement) => (settlement === 'urban' ? 'place:syn-harbor' : 'place:syn-uplands'),

  urbanBirthShare: (year) => lerp(0.25, 0.75, progress(year, 1950, 2020)),

  familyResourcesWeights(year, settlement) {
    const t = progress(year, 1950, 2020);
    return settlement === 'urban'
      ? [
          ['low', lerp(0.4, 0.2, t)],
          ['middle', 0.45],
          ['high', lerp(0.15, 0.35, t)],
        ]
      : [
          ['low', lerp(0.6, 0.35, t)],
          ['middle', 0.32],
          ['high', lerp(0.08, 0.2, t)],
        ];
  },

  mortalityQ(year, age) {
    if (age >= 110) return 1;
    const t = progress(year, 1950, 2020);
    const later = progress(year, 2020, 2100); // 2020 年后继续缓慢改善
    if (age === 0) return lerp(0.08, 0.004, t) * (1 - 0.5 * later);
    if (age < 5) return lerp(0.008, 0.0004, t) * (1 - 0.5 * later);
    const makeham = lerp(0.0006, 0.0002, t);
    const gompertz = 0.00004 * expDet(-0.6 * t - 0.3 * later) * expDet(0.095 * age);
    return clamp(1 - expDet(-(makeham + gompertz)), 0, 1);
  },

  illnessOnsetP: (_year, age) => (age < 30 ? 0 : Math.min(0.06, 0.002 + 0.0006 * (age - 30))),

  primaryEnrollmentP: (year, settlement) =>
    settlement === 'urban'
      ? lerp(0.75, 0.99, progress(year, 1950, 1975))
      : lerp(0.45, 0.97, progress(year, 1950, 1990)),

  secondaryContinuationP(year, origin) {
    const base = lerp(0.3, 0.9, progress(year, 1955, 2000));
    const resources = { low: 0.7, middle: 1, high: 1.2 }[origin.familyResources];
    const rural = origin.settlement === 'rural' ? 0.85 : 1;
    return clamp(base * resources * rural, 0, 0.98);
  },

  universityAdmissionP(year, aptitude) {
    const capacity = lerp(0.05, 0.5, progress(year, 1965, 2010));
    return clamp(capacity * (0.5 + 1.5 * aptitude), 0, 0.95);
  },

  hiringP(_year, level, phase) {
    const base = { none: 0.55, primary: 0.65, secondary: 0.8, tertiary: 0.9 }[level];
    return base * (phase === 'recession' ? 0.5 : 1);
  },

  jobLossP: (_year, phase) => 0.04 * (phase === 'recession' ? 3 : 1),

  annualWageMinor: (year, level, currency) =>
    toMinor(nominal(REAL_WAGE[level], year, 0.02), currency),

  annualLivingCostMinor: (year, settlement, currency) =>
    toMinor(nominal(REAL_LIVING_COST[settlement], year, 0.015), currency),

  treatmentCostMinor: (year, currency) =>
    toMinor(0.5 * nominal(REAL_LIVING_COST.urban, year, 0.015), currency),
};

/** 合成数据包的清单，结构与真实国家包相同（GDD §5），用于验证清单 schema。 */
export const syntheticManifest: CountryPackManifest = {
  packId: SYNTHETIC_PACK_ID,
  role: 'birth',
  schemaVersion: '0.1.0',
  engineRange: '0.1.x',
  validFrom: '1950-01-01',
  dataVersion: DATA_VERSION,
  licenseManifestPath: 'README.md',
  modules: {},
};

/** 合成地区专有的显示名称，与系统层的叙事模板合并使用。 */
export const SYNTHETIC_LABELS = {
  'zh-Hans': {
    enums: {
      place: { 'place:syn-harbor': '港城（虚构）', 'place:syn-uplands': '高地乡（虚构）' },
      currency: { 'SYN-1': '合成币旧币', 'SYN-2': '合成币新币' },
      fromCurrency: { 'SYN-1': '合成币旧币', 'SYN-2': '合成币新币' },
      toCurrency: { 'SYN-1': '合成币旧币', 'SYN-2': '合成币新币' },
    },
  },
  en: {
    enums: {
      place: {
        'place:syn-harbor': 'Harbor City (fictional)',
        'place:syn-uplands': 'the Uplands (fictional)',
      },
      currency: { 'SYN-1': 'old SYN', 'SYN-2': 'new SYN' },
      fromCurrency: { 'SYN-1': 'old SYN', 'SYN-2': 'new SYN' },
      toCurrency: { 'SYN-1': 'old SYN', 'SYN-2': 'new SYN' },
    },
  },
} satisfies Record<Locale, unknown>;
