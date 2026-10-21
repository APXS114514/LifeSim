/** Browser entry deliberately never imports the eager Node/CLI entry. */
import type { BirthRegionId } from '@lifesim/content-schema';
import type { DataRegistry } from '@lifesim/data-registry';
import { loadedPacks } from './loader.ts';
import { createRegistryForPacks } from './registry-core.ts';
import { selectBirthFromPacks, type BirthRequest } from './select-birth-core.ts';
import type { CountryPack } from './schema.ts';
export * from './schema.ts';
export * from './validate.ts';
export * from './resolve.ts';
export * from './names.ts';
export * from './loader.ts';
export type { BirthRequest, BirthContext } from './select-birth-core.ts';
export { loadedPacks as PACKS } from './loader.ts';

export function createPackRegistry(
  packs: Readonly<Partial<Record<BirthRegionId, CountryPack>>> = loadedPacks,
) {
  return createRegistryForPacks(packs);
}
export function selectBirth(
  request: BirthRequest,
  packs: Readonly<Partial<Record<BirthRegionId, CountryPack>>> = loadedPacks,
  registry?: DataRegistry,
) {
  return selectBirthFromPacks(request, packs, registry);
}
export { PACK_METADATA } from './metadata.ts';
