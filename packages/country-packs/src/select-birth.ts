import type { BirthRegionId } from '@lifesim/content-schema';
import type { DataRegistry } from '@lifesim/data-registry';
import { PACKS } from './packs/index.ts';
import { createPackRegistry } from './registry.ts';
import type { CountryPack } from './schema.ts';
import { selectBirthFromPacks, type BirthRequest } from './select-birth-core.ts';
export type { BirthRequest, BirthContext } from './select-birth-core.ts';

let cachedDefaultRegistry: DataRegistry | undefined;

/** Preserve the synchronous Node/CLI API and its full-pack default. */
export function selectBirth(
  request: BirthRequest,
  packs: Readonly<Partial<Record<BirthRegionId, CountryPack>>> = PACKS,
  registry?: DataRegistry,
) {
  if (!registry && packs === PACKS) cachedDefaultRegistry ??= createPackRegistry(PACKS);
  return selectBirthFromPacks(
    request,
    packs,
    registry ?? (packs === PACKS ? cachedDefaultRegistry : undefined),
  );
}
