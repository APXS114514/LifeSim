import { z } from 'zod';
import { EvidenceMetaSchema } from './evidence.ts';
import { EntityIdSchema } from './primitives.ts';

/** 统计指标（M2 三项 + M3 教育与劳动力、价格与卫生；ADR-0005 §3、M3-003）。新增指标需要架构审查。 */
export const INDICATORS = [
  'births',
  'life-table-qx',
  'urban-share',
  'education-enrollment-secondary',
  'education-completion-upper-secondary',
  'labor-force-participation',
  'employment-agriculture-share',
  'cpi-index',
  'health-out-of-pocket-share',
  'health-expenditure-per-capita',
] as const;
export const IndicatorSchema = z.enum(INDICATORS);
export type Indicator = z.infer<typeof IndicatorSchema>;

export const SERIES_UNITS = [
  'thousand-persons',
  'probability',
  'share',
  'percent',
  'index',
  'usd-per-capita',
] as const;
export type SeriesUnit = (typeof SERIES_UNITS)[number];
export const AGE_BASES = ['none', 'single-year'] as const;
export type AgeBasis = (typeof AGE_BASES)[number];

/** 每个指标固定的单位与年龄口径。 */
export const INDICATOR_SPEC: Record<Indicator, { unit: SeriesUnit; ageBasis: AgeBasis }> = {
  births: { unit: 'thousand-persons', ageBasis: 'none' },
  'life-table-qx': { unit: 'probability', ageBasis: 'single-year' },
  'urban-share': { unit: 'share', ageBasis: 'none' },
  'education-enrollment-secondary': { unit: 'percent', ageBasis: 'none' },
  'education-completion-upper-secondary': { unit: 'share', ageBasis: 'none' },
  'labor-force-participation': { unit: 'share', ageBasis: 'none' },
  'employment-agriculture-share': { unit: 'share', ageBasis: 'none' },
  'cpi-index': { unit: 'index', ageBasis: 'none' },
  'health-out-of-pocket-share': { unit: 'share', ageBasis: 'none' },
  'health-expenditure-per-capita': { unit: 'usd-per-capita', ageBasis: 'none' },
};

const pointBase = {
  year: z.number().int().min(1900).max(2300),
  /** 单岁年龄；ageBasis 为 'none' 时必须为 null。 */
  age: z.number().int().min(0).max(120).nullable(),
  /** 是否为预测值。 */
  projected: z.boolean(),
};

export const SeriesPointSchema = z.union([
  z.strictObject({ ...pointBase, value: z.number() }),
  z.strictObject({ ...pointBase, value: z.null(), missingReason: z.string().min(1) }),
]);
export type SeriesPoint = z.infer<typeof SeriesPointSchema>;

/** 例如 `wpp2024/CN/births`：来源/地区包/指标。 */
export const SeriesIdSchema = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*\/[A-Z]{2}(?:-[A-Z0-9]+)?\/[a-z0-9]+(?:-[a-z0-9]+)*$/);

export const StatSeriesSchema = z
  .strictObject({
    id: SeriesIdSchema,
    indicator: IndicatorSchema,
    geographyId: EntityIdSchema,
    unit: z.enum(SERIES_UNITS),
    ageBasis: z.enum(AGE_BASES),
    sex: z.literal('both'),
    evidence: EvidenceMetaSchema,
    points: z.array(SeriesPointSchema).min(1),
  })
  .superRefine((series, ctx) => {
    const spec = INDICATOR_SPEC[series.indicator];

    if (series.unit !== spec.unit) {
      ctx.addIssue({
        code: 'custom',
        message: `${series.indicator} series must use unit "${spec.unit}"`,
        path: ['unit'],
      });
    }

    if (series.ageBasis !== spec.ageBasis) {
      ctx.addIssue({
        code: 'custom',
        message: `${series.indicator} series must use ageBasis "${spec.ageBasis}"`,
        path: ['ageBasis'],
      });
    }

    if (series.geographyId !== series.evidence.geographyId) {
      ctx.addIssue({
        code: 'custom',
        message: 'geographyId must equal evidence.geographyId',
        path: ['geographyId'],
      });
    }

    const seen = new Set<string>();
    let previous: SeriesPoint | undefined;

    series.points.forEach((point, index) => {
      if (series.ageBasis === 'none') {
        if (point.age !== null) {
          ctx.addIssue({
            code: 'custom',
            message: 'age must be null when ageBasis is "none"',
            path: ['points', index, 'age'],
          });
        }
      } else if (point.age === null) {
        ctx.addIssue({
          code: 'custom',
          message: 'age is required when ageBasis is "single-year"',
          path: ['points', index, 'age'],
        });
      }

      const key = `${point.year}:${point.age === null ? 'null' : String(point.age)}`;
      if (seen.has(key)) {
        ctx.addIssue({
          code: 'custom',
          message: `duplicate point for year ${point.year} and age ${String(point.age)}`,
          path: ['points', index],
        });
      }
      seen.add(key);

      if (previous !== undefined) {
        const outOfOrder =
          point.year < previous.year ||
          (point.year === previous.year &&
            (previous.age === null || point.age === null || point.age <= previous.age));
        if (outOfOrder) {
          ctx.addIssue({
            code: 'custom',
            message: 'points must be ordered by year and then by age',
            path: ['points', index],
          });
        }
      }
      previous = point;

      const [rangeStart, rangeEnd] = series.evidence.yearRange;
      if (point.year < rangeStart || point.year > rangeEnd) {
        ctx.addIssue({
          code: 'custom',
          message: `year ${point.year} is outside evidence.yearRange`,
          path: ['points', index, 'year'],
        });
      }

      if (point.value !== null) {
        const value = point.value;
        const outOfRange =
          (spec.unit === 'thousand-persons' || spec.unit === 'usd-per-capita') && value < 0
            ? true
            : (spec.unit === 'probability' || spec.unit === 'share') && (value < 0 || value > 1)
              ? true
              : spec.unit === 'percent' && (value < 0 || value > 100)
                ? true
                : spec.unit === 'index' && value <= 0;
        if (outOfRange) {
          ctx.addIssue({
            code: 'custom',
            message:
              spec.unit === 'percent'
                ? 'percent values must be within [0, 100]'
                : spec.unit === 'index'
                  ? 'index values must be greater than zero'
                  : spec.unit === 'usd-per-capita' || spec.unit === 'thousand-persons'
                    ? 'values must be non-negative'
                    : 'probability and share values must be within [0, 1]',
            path: ['points', index, 'value'],
          });
        }
      }
    });
  });
export type StatSeries = z.infer<typeof StatSeriesSchema>;
