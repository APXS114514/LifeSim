import {
  BIRTH_REGION_IDS,
  redenominateMinor,
  scaleMinor,
  type BirthRegionId,
  type CurrencyVersion,
  type EducationLevel,
  type EvidenceMeta,
  type HistoricalAnchor,
  type Indicator,
  type ISODate,
  type LifePrinciples,
  type Origin,
} from '@lifesim/content-schema';
import {
  PACKS,
  createPackRegistry,
  politicalEntityAt,
  poolPlace,
  selectBirth,
  type BirthContext,
  type CountryPack,
} from '@lifesim/country-packs';
import type { DataRegistry } from '@lifesim/data-registry';
import {
  createLifeSimulation,
  type DataQuality,
  type DataValue,
  type RegionEffects,
  type RegionModel,
  type RegionQueries,
  type RegionRules,
  type RegionTables,
} from '@lifesim/systems';
import type { Simulation } from '@lifesim/simulation-core';

/** 可玩切片的规则基线（ADR-0006）。M3 接入真实数据后替换。 */
export const REAL_RULES: RegionRules = {
  primaryStartAge: 7,
  primaryYears: 6,
  secondaryYears: 3,
  tertiaryYears: 4,
  minimumWorkingAge: 16,
  retirementAge: 60,
  pensionRate: 0.75,
  treatmentAvailableFrom: 1980,
  treatmentAnnualCostShare: 0.2,
};

/** 可玩切片的 D 级风险乘数（ADR-0006）。 */
export const REAL_EFFECTS: RegionEffects = {
  illnessHiringFactor: 0.6,
  illnessJobLossFactor: 1.6,
  povertyIllnessFactor: 1.4,
  mortality: {
    untreatedIllness: 1.8,
    treatedIllness: 1.15,
    poverty: 1.25,
    tertiaryEducation: 0.8,
  },
};

const WAGE_BASE_MINOR: Record<BirthRegionId, number> = {
  CN: 1_000_000_000,
  JP: 250_000,
  KR: 5_000_000_000,
  KP: 10_000_000_000,
  RU: 10_000_000_000,
};

const WAGE_LEVEL_FACTOR: Record<EducationLevel, number> = {
  none: 0.45,
  primary: 0.6,
  secondary: 1,
  tertiary: 1.6,
};

const SECONDARY_BY_RESOURCES: Record<Origin['familyResources'], number> = {
  low: 0.45,
  middle: 0.75,
  high: 0.95,
};

const HIRING_BY_LEVEL: Record<EducationLevel, number> = {
  none: 0.55,
  primary: 0.65,
  secondary: 0.8,
  tertiary: 0.92,
};

const WAGE_INDEX: number[] = [1];
for (let index = 1; index <= 250; index += 1) {
  WAGE_INDEX.push((WAGE_INDEX[index - 1] ?? 1) * 1.04);
}

function growthIndex(year: number): number {
  const offset = Math.max(0, Math.min(250, year - 1950));
  return WAGE_INDEX[offset] ?? 1;
}

let cachedRegistry: DataRegistry | undefined;
let cachedPacks: CountryPack[] = [];

/** 全部国家包的查询入口；首次调用时建索引（约 7.7 万个点）。 */
export function realDataRegistry(): DataRegistry {
  const packs = Object.values(PACKS);
  if (
    !cachedRegistry ||
    packs.length !== cachedPacks.length ||
    packs.some((pack, index) => pack !== cachedPacks[index])
  ) {
    cachedRegistry = createPackRegistry();
    cachedPacks = packs;
  }
  return cachedRegistry;
}

function dEvidence(geographyId: string, methodId: string): EvidenceMeta {
  return {
    grade: 'D',
    sourceIds: ['adr:0006'],
    modelVersion: 'm3-lite-0.1',
    geographyId,
    yearRange: [1950, 2100],
    methodId,
  };
}

function tableEvidence(pack: CountryPack): Record<keyof RegionModel['evidence'], EvidenceMeta> {
  const geographyId = pack.geographyId;
  const population: EvidenceMeta = {
    grade: 'B',
    sourceIds: ['un-wpp:2024', 'worldbank-wdi:SP.URB.TOTL.IN.ZS'],
    modelVersion: 'm3-lite-0.1',
    geographyId,
    yearRange: [1950, 2100],
    methodId: 'wpp2024-births-and-wdi-urban-share',
  };
  const mortality: EvidenceMeta = {
    grade: 'B',
    sourceIds: ['un-wpp:2024'],
    modelVersion: 'm3-lite-0.1',
    geographyId,
    yearRange: [1950, 2100],
    methodId: 'wpp2024-life-table-both',
  };
  return {
    population,
    mortality,
    illness: dEvidence(geographyId, 'm3-lite-illness-baseline'),
    education: dEvidence(geographyId, 'm3-lite-education-baseline'),
    labor: dEvidence(geographyId, 'm3-lite-labor-baseline'),
    prices: dEvidence(geographyId, 'm3-lite-prices-baseline'),
    history: dEvidence(geographyId, 'm3-lite-anchor-baseline'),
  };
}

export interface RealRegionOptions {
  /** 出生地；省略时用该国的其他城镇人口池。 */
  placeId?: string;
  /** 出生时的政治实体；省略时按出生日期解析。 */
  polityId?: string;
}

/**
 * 把国家包适配成现有 rules 能消费的 RegionModel。
 *
 * 政体更替锚点从 M3-001 起进入人物模拟：地点不动，政治实体与国籍随锚点变化；
 * 币制与经济锚点仍由 history.ts 处理。
 */
export function createRealRegion(
  packId: BirthRegionId,
  birthDate: ISODate,
  options: RealRegionOptions = {},
): RegionModel {
  const pack = PACKS[packId];
  if (!pack) throw new Error('Unknown country pack ' + packId);
  const data = realDataRegistry();
  const urbanPlace = poolPlace(pack, 'urban').id;
  const ruralPlace = poolPlace(pack, 'rural').id;
  const birthPlaceId = options.placeId ?? urbanPlace;
  const polityId = options.polityId ?? politicalEntityAt(pack, birthPlaceId, birthDate).id;

  // 全部锚点都进入模拟：polity-change 由 history.ts 作用到在世角色，但不改变居住地。
  const anchors: readonly HistoricalAnchor[] = pack.anchors;
  const redenominations = anchors
    .filter((anchor) => anchor.kind === 'redenomination')
    .sort((left, right) => (left.at < right.at ? -1 : left.at > right.at ? 1 : 0));

  const indicatorTable: Record<Indicator, keyof RegionModel['evidence']> = {
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

  const qualityFor = (method: string): DataQuality => {
    if (method === 'exact') return 'exact';
    if (method === 'fallback-neighbor-year') return 'neighbor-year';
    if (method === 'fallback-parent-geography') return 'parent-geography';
    if (method === 'hold-first-observed') return 'assumption';
    return 'derived';
  };

  const lookupValue = (indicator: Indicator, year: number, age?: number): DataValue | null => {
    if (indicator === 'life-table-qx' && age === undefined) return null;
    const result = data.lookup(
      age === undefined
        ? { indicator, geographyId: pack.geographyId, year }
        : { indicator, geographyId: pack.geographyId, year, age },
    );
    if (result.status === 'missing') return null;
    return {
      value: result.value,
      grade: result.evidence.grade,
      quality: qualityFor(result.method),
      sourceIds: result.evidence.sourceIds,
      sourceYear: result.sourceYear,
      projected: result.projected,
    };
  };

  const tables: RegionTables = {
    value: (indicator, year) => lookupValue(indicator, year),
    ageValue: (indicator, year, age) => lookupValue(indicator, year, age),
    evidenceFor(indicator) {
      const sample = tables.value(indicator, 2020) ?? tables.value(indicator, 2000);
      if (sample !== null) {
        return {
          grade: sample.grade,
          sourceIds: [...sample.sourceIds],
          modelVersion: pack.manifest.dataVersion,
          geographyId: pack.geographyId,
          yearRange: [sample.sourceYear, sample.sourceYear],
          methodId: sample.quality,
        };
      }
      return tableEvidence(pack)[indicatorTable[indicator]];
    },
  };

  const queries: RegionQueries = {
    education: {
      secondaryEnrollmentRate: (year) => tables.value('education-enrollment-secondary', year),
      upperSecondaryCompletionRate: (year) =>
        tables.value('education-completion-upper-secondary', year),
    },
    labor: {
      participationRate: (year) => tables.value('labor-force-participation', year),
      agricultureShare: (year) => tables.value('employment-agriculture-share', year),
    },
    prices: {
      cpi: (year) => tables.value('cpi-index', year),
      toRealMinor(nominalMinor, _currency, year, baseYear) {
        const current = tables.value('cpi-index', year);
        const base = tables.value('cpi-index', baseYear);
        // CPI 缺失时不假装折算：返回名义值，调用方负责标注“未折算”。
        if (current === null || base === null || current.value <= 0 || base.value <= 0) {
          return nominalMinor;
        }
        const baseScaled = BigInt(Math.round(base.value * 1000));
        const currentScaled = BigInt(Math.round(current.value * 1000));
        const numerator = BigInt(nominalMinor) * baseScaled;
        const rounded =
          numerator >= 0n
            ? (numerator + currentScaled / 2n) / currentScaled
            : (numerator - currentScaled / 2n) / currentScaled;
        return Number(rounded);
      },
    },
    health: {
      outOfPocketShare: (year) => tables.value('health-out-of-pocket-share', year),
      expenditurePerCapitaUsd: (year) => tables.value('health-expenditure-per-capita', year),
    },
  };

  const annualWageMinor = (
    year: number,
    level: EducationLevel,
    currency: CurrencyVersion,
  ): number => {
    let amount = scaleMinor(WAGE_BASE_MINOR[packId], growthIndex(year) * WAGE_LEVEL_FACTOR[level]);
    for (const anchor of redenominations) {
      if (anchor.kind !== 'redenomination') continue;
      if (anchor.toVersion <= currency.version) {
        amount = redenominateMinor(amount, anchor.divisor);
      }
    }
    return amount;
  };

  return {
    packId,
    dataVersion: pack.manifest.dataVersion,
    polityId,
    evidence: tableEvidence(pack),
    anchors,
    initialMacro: {
      economyPhase: 'normal',
      currency: { code: pack.currency.code, version: pack.currency.initialVersion },
    },
    rules: REAL_RULES,
    effects: REAL_EFFECTS,
    tables,
    queries,
    placeId(settlement) {
      return settlement === 'urban' ? urbanPlace : ruralPlace;
    },
    urbanBirthShare(year) {
      const result = data.lookup({
        indicator: 'urban-share',
        geographyId: pack.geographyId,
        year,
      });
      if (result.status === 'missing') {
        throw new Error('No urban-share for ' + packId + ' in ' + year + ': ' + result.reason);
      }
      return result.value;
    },
    familyResourcesWeights() {
      return [
        ['low', 0.25],
        ['middle', 0.55],
        ['high', 0.2],
      ] as const;
    },
    mortalityQ(year, age) {
      if (!Number.isInteger(age) || age < 0) throw new RangeError('Invalid age ' + age);
      if (age >= 100) return 1;
      const result = data.lookup(
        {
          indicator: 'life-table-qx',
          geographyId: pack.geographyId,
          year,
          age,
        },
        { allowScenario: true },
      );
      if (result.status === 'missing') {
        throw new Error(
          'No mortality qx for ' + packId + ' in ' + year + ' age ' + age + ': ' + result.reason,
        );
      }
      return result.value;
    },
    illnessOnsetP(_year, age) {
      if (age < 35) return 0.0005;
      return Math.min(0.08, 0.002 + 0.001 * (age - 35));
    },
    primaryEnrollmentP(_year, settlement) {
      return settlement === 'urban' ? 0.97 : 0.9;
    },
    secondaryContinuationP(_year, origin) {
      const base = SECONDARY_BY_RESOURCES[origin.familyResources];
      return Math.max(0.05, Math.min(0.98, base - (origin.settlement === 'rural' ? 0.1 : 0)));
    },
    universityAdmissionP(_year, aptitude) {
      return Math.min(0.9, 0.1 + 0.6 * aptitude);
    },
    hiringP(_year, level, phase) {
      return HIRING_BY_LEVEL[level] * (phase === 'recession' ? 0.5 : 1);
    },
    jobLossP(_year, phase) {
      return phase === 'recession' ? 0.12 : 0.03;
    },
    annualWageMinor,
    annualLivingCostMinor(year, settlement, currency) {
      return scaleMinor(
        annualWageMinor(year, 'secondary', currency),
        settlement === 'urban' ? 0.4 : 0.28,
      );
    },
    treatmentCostMinor(year, currency) {
      return scaleMinor(annualWageMinor(year, 'secondary', currency), 0.15);
    },
  };
}

export interface RealLifeRequest {
  seed: string;
  region: BirthRegionId | 'random';
  year: number | 'random';
  birthDate?: ISODate;
  principles?: LifePrinciples;
  decisions?: Readonly<Record<string, string>>;
}

export interface RealLifeSession {
  request: RealLifeRequest;
  birth: BirthContext;
  pack: CountryPack;
  region: RegionModel;
  simulation: Simulation;
}

/** 选出生并创建真实的 M3-lite 人生；调用方只负责推进与渲染。 */
export function createRealLifeSimulation(request: RealLifeRequest): RealLifeSession {
  const birth = selectBirth(
    {
      seed: request.seed,
      region: request.region,
      year: request.year,
      ...(request.birthDate === undefined ? {} : { birthDate: request.birthDate }),
    },
    PACKS,
    realDataRegistry(),
  );
  const pack = PACKS[birth.packId];
  if (!pack) throw new Error('Unknown country pack ' + birth.packId);
  const region = createRealRegion(birth.packId, birth.birthDate, {
    placeId: birth.placeId,
    polityId: birth.politicalEntityId,
  });
  const simulation = createLifeSimulation({
    seed: request.seed,
    region,
    birthDate: birth.birthDate,
    settlement: birth.settlement,
    ...(request.principles === undefined ? {} : { principles: request.principles }),
    ...(request.decisions === undefined ? {} : { decisions: request.decisions }),
  });
  return { request, birth, pack, region, simulation };
}

export function isRealRegionId(value: string): value is BirthRegionId {
  return (BIRTH_REGION_IDS as readonly string[]).includes(value);
}
