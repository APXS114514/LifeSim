import { z } from 'zod';
import { EntityIdSchema, ISODateSchema } from './primitives';

/**
 * 证据等级（GDD §9.1）：A 原始/官方统计，B 权威机构模型估计或预测，
 * C 本游戏明示方法的间接估计，D 为可玩性引入的设计假设。等级不是置信概率。
 */
export const EvidenceGradeSchema = z.enum(['A', 'B', 'C', 'D']);
export type EvidenceGrade = z.infer<typeof EvidenceGradeSchema>;

/** 来源 ID，指向 `data/SOURCES.md` 登记的条目；D 类假设指向对应 ADR。 */
export const SourceIdSchema = z.string().regex(/^[a-z0-9][a-z0-9._-]*:[A-Za-z0-9._-]+$/, {
  message: 'Source IDs look like "un-wpp:2024" or "adr:0003"',
});

export const UncertaintySchema = z
  .strictObject({
    lower: z.number(),
    upper: z.number(),
    /** 区间覆盖概率，例如 0.95；缺省表示来源未给出。 */
    coverage: z.number().gt(0).lte(1).optional(),
  })
  .refine((u) => u.lower <= u.upper, { message: 'Uncertainty lower bound exceeds upper bound' });

export const EvidenceMetaSchema = z.strictObject({
  grade: EvidenceGradeSchema,
  /** 至少一个来源；D 类也必须说明假设记录在哪里。 */
  sourceIds: z.array(SourceIdSchema).min(1),
  modelVersion: z.string().min(1),
  geographyId: EntityIdSchema,
  yearRange: z.tuple([z.number().int(), z.number().int()]).refine(([from, to]) => from <= to, {
    message: 'yearRange must be [from, to] with from <= to',
  }),
  methodId: z.string().min(1).optional(),
  uncertainty: UncertaintySchema.optional(),
});
export type EvidenceMeta = z.infer<typeof EvidenceMetaSchema>;

/**
 * 一个统计值。缺失必须显式为 `null` 并说明原因，不能默默写成 0（GDD §9.2）。
 */
export const DataPointSchema = z.union([
  z.strictObject({
    value: z.number(),
    evidence: EvidenceMetaSchema,
  }),
  z.strictObject({
    value: z.null(),
    missingReason: z.string().min(1),
    evidence: EvidenceMetaSchema.optional(),
  }),
]);
export type DataPoint = z.infer<typeof DataPointSchema>;

/**
 * `data/SOURCES.md` 中一条来源的结构化形式（GDD §9.4）。
 * 许可状态与数据质量是独立元信息：A 级数据也可能不可再分发。
 */
export const SourceRecordSchema = z
  .strictObject({
    id: SourceIdSchema,
    title: z.string().min(1),
    publisher: z.string().min(1),
    url: z.url().optional(),
    version: z.string().min(1).optional(),
    /** SPDX 标识符（如 `CC-BY-4.0`）；条款不明时用 `NOASSERTION`。 */
    license: z.string().min(1),
    redistribution: z.enum(['allowed', 'restricted', 'unknown']),
    /** 最近一次人工核验许可条款的日期。 */
    verifiedAt: ISODateSchema.optional(),
    notes: z.string().optional(),
  })
  .refine((source) => source.redistribution !== 'allowed' || source.verifiedAt !== undefined, {
    message: 'A source marked redistribution "allowed" must record verifiedAt',
    path: ['verifiedAt'],
  });
export type SourceRecord = z.infer<typeof SourceRecordSchema>;

/** 只有核验过可再分发的来源，其派生数据才能进入公开构建。 */
export function isPublishableSource(source: SourceRecord): boolean {
  return source.redistribution === 'allowed';
}
