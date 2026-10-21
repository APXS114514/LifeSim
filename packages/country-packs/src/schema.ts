import {
  AdminUnitSchema,
  CountryPackManifestSchema,
  HistoricalAnchorSchema,
  LocalizedNameSchema,
  PlaceAssignmentSchema,
  PlaceSchema,
  PoliticalEntitySchema,
  StatSeriesSchema,
  EntityIdSchema,
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

export const CountryPackSchema = z.strictObject({
  manifest: CountryPackManifestSchema,
  geographyId: EntityIdSchema,
  names: LocalizedNameSchema,
  politicalEntities: z.array(PoliticalEntitySchema).min(1),
  adminUnits: z.array(AdminUnitSchema).min(1),
  places: z.array(PlaceSchema).min(1),
  placeAssignments: z.array(PlaceAssignmentSchema).min(1),
  currency: CurrencyDefinitionSchema,
  anchors: z.array(HistoricalAnchorSchema),
  breakpoints: z.array(BreakpointSchema),
  series: z.array(StatSeriesSchema),
});
export type CurrencyDefinition = z.infer<typeof CurrencyDefinitionSchema>;
export type CountryPack = z.infer<typeof CountryPackSchema>;
