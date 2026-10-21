import type { BirthRegionId } from '@lifesim/content-schema';
import { PACKS } from './packs/index.ts';
import type { CountryPack } from './schema.ts';
import { createRegistryForPacks } from './registry-core.ts';

/** Synchronous Node/CLI entry; browser initialization uses only loaded packs. */
export function createPackRegistry(
  packs: Readonly<Partial<Record<BirthRegionId, CountryPack>>> = PACKS,
) {
  return createRegistryForPacks(packs);
}
