import { z } from 'zod';
import { SourceIdSchema } from './evidence.ts';
import { EntityIdSchema, ISODateSchema, type ISODate } from './primitives.ts';

export const LocalizedNameSchema = z.strictObject({
  'zh-Hans': z.string().min(1),
  en: z.string().min(1),
});
export type LocalizedName = z.infer<typeof LocalizedNameSchema>;

export interface Validity {
  validFrom: ISODate | null;
  validTo: ISODate | null;
}

const validity = { validFrom: ISODateSchema.nullable(), validTo: ISODateSchema.nullable() };

/** validFrom ≤ date < validTo（null 表示不设限）。 */
export function isValidOn(record: Validity, date: ISODate): boolean {
  if (record.validFrom !== null && record.validFrom > date) return false;
  if (record.validTo !== null && date >= record.validTo) return false;
  return true;
}

/** 当天唯一有效的记录；没有返回 null；多于一条抛 Error（数据重叠）。 */
export function resolveOn<T extends Validity>(records: readonly T[], date: ISODate): T | null {
  const matches = records.filter((record) => isValidOn(record, date));
  if (matches.length === 0) return null;
  if (matches.length > 1) {
    throw new Error(`Overlapping validity records on ${date}`);
  }
  return matches[0] as T;
}

/** 有效期相互重叠的记录下标对 [i, j]（i < j），按 i、j 升序。 */
export function findOverlaps(records: readonly Validity[]): [number, number][] {
  const overlaps: [number, number][] = [];
  for (let i = 0; i < records.length; i += 1) {
    for (let j = i + 1; j < records.length; j += 1) {
      const left = records[i] as Validity;
      const right = records[j] as Validity;
      const leftEndsAfterRightStarts =
        left.validTo === null || right.validFrom === null || right.validFrom < left.validTo;
      const rightEndsAfterLeftStarts =
        right.validTo === null || left.validFrom === null || left.validFrom < right.validTo;
      if (leftEndsAfterRightStarts && rightEndsAfterLeftStarts) overlaps.push([i, j]);
    }
  }
  return overlaps;
}

/** [from, to) 内没有任何记录覆盖的区间，按时间升序；to 为 null 表示一直到无穷。 */
export function findGaps(
  records: readonly Validity[],
  from: ISODate,
  to: ISODate | null,
): { from: ISODate; to: ISODate | null }[] {
  const clipped: { start: ISODate; end: ISODate | null }[] = [];
  for (const record of records) {
    const start = record.validFrom !== null && record.validFrom > from ? record.validFrom : from;
    let end = record.validTo;
    if (to !== null && (end === null || end > to)) end = to;
    if (end !== null && start >= end) continue;
    clipped.push({ start, end });
  }
  clipped.sort((a, b) => (a.start === b.start ? 0 : a.start < b.start ? -1 : 1));

  const gaps: { from: ISODate; to: ISODate | null }[] = [];
  let cursor: ISODate | null = from;
  for (const interval of clipped) {
    if (cursor === null) break;
    if (interval.start > cursor) gaps.push({ from: cursor, to: interval.start });
    if (interval.end === null) cursor = null;
    else if (interval.end > cursor) cursor = interval.end;
  }
  if (cursor !== null) {
    if (to === null) gaps.push({ from: cursor, to: null });
    else if (cursor < to) gaps.push({ from: cursor, to });
  }
  return gaps;
}

function addValidityIssues(ctx: z.RefinementCtx, value: Validity): void {
  if (value.validFrom !== null && value.validTo !== null && value.validFrom >= value.validTo) {
    ctx.addIssue({
      code: 'custom',
      message: 'validFrom must be earlier than validTo (half-open interval)',
      path: ['validTo'],
    });
  }
}

export const PoliticalEntitySchema = z
  .strictObject({
    id: EntityIdSchema,
    names: LocalizedNameSchema,
    ...validity,
    sourceIds: z.array(SourceIdSchema).min(1),
  })
  .superRefine((value, ctx) => {
    addValidityIssues(ctx, value);
  });
export type PoliticalEntity = z.infer<typeof PoliticalEntitySchema>;

export const ADMIN_LEVELS = ['country', 'province', 'municipality', 'unspecified'] as const;
export const AdminUnitSchema = z
  .strictObject({
    id: EntityIdSchema,
    names: LocalizedNameSchema,
    level: z.enum(ADMIN_LEVELS),
    ...validity,
    sourceIds: z.array(SourceIdSchema).min(1),
  })
  .superRefine((value, ctx) => {
    addValidityIssues(ctx, value);
  });
export type AdminUnit = z.infer<typeof AdminUnitSchema>;

export const PLACE_KINDS = ['city', 'other-urban', 'other-rural'] as const;
export const PlaceNameSchema = z
  .strictObject({ ...validity, names: LocalizedNameSchema })
  .superRefine((value, ctx) => {
    addValidityIssues(ctx, value);
  });
export type PlaceName = z.infer<typeof PlaceNameSchema>;

export const PlaceSchema = z
  .strictObject({
    id: EntityIdSchema,
    kind: z.enum(PLACE_KINDS),
    settlement: z.enum(['urban', 'rural']),
    names: z.array(PlaceNameSchema).min(1),
    sourceIds: z.array(SourceIdSchema).min(1),
  })
  .superRefine((place, ctx) => {
    if (place.kind === 'other-rural') {
      if (place.settlement !== 'rural') {
        ctx.addIssue({
          code: 'custom',
          message: 'other-rural places must have settlement "rural"',
          path: ['settlement'],
        });
      }
    } else if (place.settlement !== 'urban') {
      ctx.addIssue({
        code: 'custom',
        message: 'city and other-urban places must have settlement "urban"',
        path: ['settlement'],
      });
    }

    for (const [left, right] of findOverlaps(place.names)) {
      ctx.addIssue({
        code: 'custom',
        message: `name periods ${left} and ${right} overlap`,
        path: ['names', right],
      });
    }
  });
export type Place = z.infer<typeof PlaceSchema>;

export const PlaceAssignmentSchema = z
  .strictObject({
    placeId: EntityIdSchema,
    adminUnitId: EntityIdSchema,
    politicalEntityId: EntityIdSchema,
    ...validity,
    sourceIds: z.array(SourceIdSchema).min(1),
  })
  .superRefine((value, ctx) => {
    addValidityIssues(ctx, value);
  });
export type PlaceAssignment = z.infer<typeof PlaceAssignmentSchema>;
