import { z } from 'zod';
import { ISODateSchema, RelativePathSchema, SemverSchema } from './primitives';

/** 国家包除 manifest 外的模块（GDD §5）。 */
export const COUNTRY_PACK_MODULES = [
  'geography',
  'population',
  'economy',
  'education',
  'health',
  'familyLaw',
  'politicalHistory',
  'events',
  'narratives',
  'sources',
] as const;
export type CountryPackModule = (typeof COUNTRY_PACK_MODULES)[number];

const optionalModulePath = RelativePathSchema.optional();

export const CountryPackManifestSchema = z.strictObject({
  /** 两位大写代码，可带后缀，如 `CN`、`RU`、`US-DEST`。显示名另行映射（GDD §11.3）。 */
  packId: z.string().regex(/^[A-Z]{2}(?:-[A-Z0-9]{1,8})?$/, {
    message: 'Pack IDs look like "CN" or "US-DEST"',
  }),
  /** `birth` 可作为出生地；`destination-only` 是只支持迁入的轻量地区包（GDD §3.1）。 */
  role: z.enum(['birth', 'destination-only']),
  schemaVersion: SemverSchema,
  /** 兼容的引擎版本范围（semver range 字符串，M2 接入真正的范围求值）。 */
  engineRange: z.string().min(1),
  validFrom: ISODateSchema,
  dataVersion: z.string().min(1),
  licenseManifestPath: RelativePathSchema,
  modules: z.strictObject({
    geography: optionalModulePath,
    population: optionalModulePath,
    economy: optionalModulePath,
    education: optionalModulePath,
    health: optionalModulePath,
    familyLaw: optionalModulePath,
    politicalHistory: optionalModulePath,
    events: optionalModulePath,
    narratives: optionalModulePath,
    sources: optionalModulePath,
  }),
});
export type CountryPackManifest = z.infer<typeof CountryPackManifestSchema>;
