import type { EvidenceMeta } from '@lifesim/content-schema';
import type { EducationSystem, RegionModel, RegionRules } from '../region.ts';

/** 夹具的学制常数：`systemAt` 与 `rules` 同源，保证夹具行为与旧常数等价。 */
const FIXTURE_RULES: RegionRules = {
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

/** 夹具的 D 级学制（虚构）：无义务教育、无升学考试、不收学费。 */
const FIXTURE_EDUCATION: EducationSystem = {
  primaryStartAge: FIXTURE_RULES.primaryStartAge,
  primaryYears: FIXTURE_RULES.primaryYears,
  secondaryYears: FIXTURE_RULES.secondaryYears,
  tertiaryYears: FIXTURE_RULES.tertiaryYears,
  compulsoryYears: 0,
  entranceExam: { kind: 'none' },
  feeShare: 0,
  grade: 'D',
  sourceIds: ['fixture:m3-011'],
};

const METADATA: EvidenceMeta = {
  grade: 'D',
  sourceIds: ['fixture:m3-011'],
  modelVersion: 'fixture-1',
  geographyId: 'polity:fixture',
  yearRange: [1950, 2200],
  methodId: 'fixture',
};

/**
 * 测试夹具（虚构数据，不是任何国家的数据）：一个最小的地区模型，
 * 只负责让 NPC 生命周期在本包内可测（不依赖 @lifesim/synthetic-world 的依赖方向）。
 * 数值是随意取的单调曲线，仅用于产生发病、失业、退休与死亡。
 */
export const FIXTURE_REGION: RegionModel = {
  packId: 'ZZ-FIX',
  sexRatioAtBirth: () => 100,
  names: { scheme: 'zh', select: () => null, patronymic: () => null },
  dataVersion: 'fixture-1',
  polityId: 'polity:fixture',
  evidence: {
    population: METADATA,
    mortality: METADATA,
    illness: METADATA,
    education: METADATA,
    labor: METADATA,
    prices: METADATA,
    history: METADATA,
  },
  anchors: [],
  initialMacro: { economyPhase: 'normal', currency: { code: 'FIX', version: 1 } },
  rules: FIXTURE_RULES,
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
  tables: {
    value: () => null,
    ageValue: () => null,
    evidenceFor: () => METADATA,
  },
  queries: {
    education: {
      secondaryEnrollmentRate: () => null,
      upperSecondaryCompletionRate: () => null,
      systemAt: () => FIXTURE_EDUCATION,
    },
    labor: { participationRate: () => null, agricultureShare: () => null },
    prices: { cpi: () => null, toRealMinor: (nominalMinor) => nominalMinor },
    health: { outOfPocketShare: () => null, expenditurePerCapitaUsd: () => null },
  },
  placeId: (settlement) => `place:fixture-${settlement}`,
  urbanBirthShare: () => 0.5,
  familyResourcesWeights: () => [['middle', 1]],
  mortalityQ: (_year, age) => {
    if (age >= 95) return 1;
    if (age >= 85) return 0.3;
    if (age >= 75) return 0.12;
    if (age >= 60) return 0.04;
    if (age >= 40) return 0.01;
    return 0.002;
  },
  illnessOnsetP: (_year, age) => (age < 30 ? 0 : 0.02),
  primaryEnrollmentP: () => 0.9,
  secondaryContinuationP: () => 0.6,
  universityAdmissionP: () => 0.3,
  hiringP: () => 0.7,
  jobLossP: () => 0.05,
  annualWageMinor: () => 100_000,
  annualLivingCostMinor: () => 50_000,
  treatmentCostMinor: () => 10_000,
};
