import {
  AdminUnitSchema,
  CountryPackManifestSchema,
  EntityIdSchema,
  HistoricalAnchorSchema,
  LocalizedNameSchema,
  PlaceAssignmentSchema,
  PlaceSchema,
  PoliticalEntitySchema,
  SourceIdSchema,
  StatSeriesSchema,
} from '@lifesim/content-schema';
import { BreakpointSchema } from '@lifesim/data-registry';
import { z } from 'zod';

export const CurrencyDefinitionSchema = z.strictObject({
  code: z.string().regex(/^[A-Z]{3}$/),
  initialVersion: z.number().int().positive(),
  /** 每个币制版本的显示名，键为版本号字符串（"1"、"2"…）。 */
  versionNames: z.record(z.string().regex(/^[1-9]\d*$/), LocalizedNameSchema),
});

/** 个国家包覆盖期的起点；有效期一律是半开区间（M2-002）。 */
export const PACK_COVERAGE_START = '1950-01-01';

/**
 * 教育制度的一段（ADR-0007 2026-10-21 增补）：该年份区间内的学制、升学考试与学费规则。
 *
 * 它是**规则数据**，不是统计序列：不占用 `Indicator` 枚举，也不走 `DataRegistry` 的回退链。
 * 金额只作名义比例，不做 CPI 折算（折算归 M3-014 / Q14）。
 */
export const EducationSegmentSchema = z
  .strictObject({
    /** 生效年份（含）。 */
    validFrom: z.number().int().min(1950).max(2100),
    /** 失效年份（含）；null 表示一直到覆盖期末。 */
    validTo: z.number().int().min(1950).max(2100).nullable(),
    /** 入学年龄（小学一年级开始的周岁）。 */
    primaryStartAge: z.number().int().min(4).max(10),
    /** 各级修业年限（年）：小学、中学、高等。 */
    primaryYears: z.number().int().min(1).max(8),
    secondaryYears: z.number().int().min(1).max(8),
    tertiaryYears: z.number().int().min(2).max(8),
    /** 义务教育年限；0 表示该年没有义务教育。 */
    compulsoryYears: z.number().int().min(0).max(12),
    /** 升学考试：没有考试，或有考试与基础通过率（0—1）。 */
    entranceExam: z.discriminatedUnion('kind', [
      z.strictObject({ kind: z.literal('none') }),
      z.strictObject({ kind: z.literal('exam'), passBase: z.number().min(0).max(1) }),
    ]),
    /** 非义务教育阶段学费与杂费占当年生活费的比例；义务教育年限内按 0 计。 */
    feeShare: z.number().min(0).max(1),
    /** 有已登记教育法规来源为 C；没有来源的设计假设为 D。 */
    grade: z.enum(['C', 'D']),
    /** 至少一个来源；D 级设计假设指向对应 ADR。 */
    sourceIds: z.array(SourceIdSchema).min(1),
    /** D 级设计假设的缺口说明（校验要求 D 级必须写明）。 */
    note: z.string().min(1).optional(),
  })
  .refine((segment) => segment.validTo === null || segment.validTo >= segment.validFrom, {
    message: 'validTo must be null or not before validFrom',
    path: ['validTo'],
  });
export type EducationSegment = z.infer<typeof EducationSegmentSchema>;

export const CountryPackSchema = z.strictObject({
  manifest: CountryPackManifestSchema,
  geographyId: EntityIdSchema,
  names: LocalizedNameSchema,
  politicalEntities: z.array(PoliticalEntitySchema).min(1),
  adminUnits: z.array(AdminUnitSchema).min(1),
  places: z.array(PlaceSchema).min(1),
  placeAssignments: z.array(PlaceAssignmentSchema).min(1),
  currency: CurrencyDefinitionSchema,
  /** 教育制度分段（规则数据，按年份解析；ADR-0007 增补）。 */
  education: z.array(EducationSegmentSchema).min(1),
  anchors: z.array(HistoricalAnchorSchema),
  breakpoints: z.array(BreakpointSchema),
  series: z.array(StatSeriesSchema),
});
export type CurrencyDefinition = z.infer<typeof CurrencyDefinitionSchema>;
export type CountryPack = z.infer<typeof CountryPackSchema>;
