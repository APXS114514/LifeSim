import {
  CurrencyVersionSchema,
  ECONOMY_PHASES,
  EntityIdSchema,
  type CurrencyVersion,
  type EconomyPhase,
  type EducationLevel,
  type EvidenceMeta,
  type HistoricalAnchor,
  type Origin,
} from '@lifesim/content-schema';
import type { SimState } from '@lifesim/simulation-core';
import { z } from 'zod';

/**
 * 系统规则向地区数据要的全部东西。M1 由合成地区包实现；M2 起由国家包与 DataRegistry 实现。
 * 规则只通过这个接口取数，不在规则里硬编码任何地区的数值。
 *
 * 概率都是年度概率；金额都是给定币制版本下的整数最小单位。
 */
export interface RegionModel {
  readonly packId: string;
  readonly dataVersion: string;
  readonly polityId: string;
  /** 每张数据表的证据元信息；事实的 `evidenceIds` 引用这里的键。 */
  readonly evidence: Readonly<Record<RegionTable, EvidenceMeta>>;
  readonly anchors: readonly HistoricalAnchor[];
  /** 数据包覆盖期开始时的宏观状态；出生前已发生的锚点在此基础上折算。 */
  readonly initialMacro: { economyPhase: EconomyPhase; currency: CurrencyVersion };
  readonly rules: RegionRules;
  readonly effects: RegionEffects;

  placeId(settlement: Origin['settlement']): string;
  urbanBirthShare(year: number): number;
  familyResourcesWeights(
    year: number,
    settlement: Origin['settlement'],
  ): readonly (readonly [Origin['familyResources'], number])[];

  /** 生命表基线：该日历年、该年龄的年度死亡概率（已包含所有死因）。 */
  mortalityQ(year: number, age: number): number;
  illnessOnsetP(year: number, age: number): number;
  primaryEnrollmentP(year: number, settlement: Origin['settlement']): number;
  secondaryContinuationP(year: number, origin: Origin): number;
  universityAdmissionP(year: number, aptitude: number): number;
  hiringP(year: number, level: EducationLevel, phase: EconomyPhase): number;
  jobLossP(year: number, phase: EconomyPhase): number;

  annualWageMinor(year: number, level: EducationLevel, currency: CurrencyVersion): number;
  annualLivingCostMinor(
    year: number,
    settlement: Origin['settlement'],
    currency: CurrencyVersion,
  ): number;
  treatmentCostMinor(year: number, currency: CurrencyVersion): number;
}

export type RegionTable =
  'population' | 'mortality' | 'illness' | 'education' | 'labor' | 'prices' | 'history';

export interface RegionRules {
  primaryStartAge: number;
  primaryYears: number;
  secondaryYears: number;
  tertiaryYears: number;
  minimumWorkingAge: number;
  retirementAge: number;
  /** 养老金占同学历当年工资的比例。 */
  pensionRate: number;
  /** 慢性病治疗从哪一年起可以获得。 */
  treatmentAvailableFrom: number;
  /** 接受治疗后每年的持续费用，占一次性治疗费用的比例。 */
  treatmentAnnualCostShare: number;
}

/** 状态对概率的调整系数（风险乘数），与基线表一样带证据等级。 */
export interface RegionEffects {
  illnessHiringFactor: number;
  illnessJobLossFactor: number;
  povertyIllnessFactor: number;
  mortality: {
    untreatedIllness: number;
    treatedIllness: number;
    poverty: number;
    tertiaryEducation: number;
  };
}

/** `SimState.world` 的结构：由历史锚点改变的宏观状态。 */
export const MacroStateSchema = z.strictObject({
  regionId: z.string().min(1),
  economyPhase: z.enum(ECONOMY_PHASES),
  /** 让当前经济阶段生效的锚点事实；出生前就已生效时为 null。 */
  economyPhaseFactId: EntityIdSchema.nullable(),
  currency: CurrencyVersionSchema,
});
export type MacroState = z.infer<typeof MacroStateSchema>;

export function readMacro(state: SimState): MacroState {
  return MacroStateSchema.parse(state.world);
}

export function writeMacro(state: SimState, macro: MacroState): void {
  state.world = MacroStateSchema.parse(macro);
}

export function currencyLabel(currency: CurrencyVersion): string {
  return `${currency.code}-${currency.version}`;
}
