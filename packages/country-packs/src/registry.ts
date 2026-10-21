import type { BirthRegionId } from '@lifesim/content-schema';
import { DataRegistry } from '@lifesim/data-registry';
import { PACKS } from './packs/index.ts';
import type { CountryPack } from './schema.ts';

/** 用全部国家包建立数据查询入口；地点的上级是所属国家（ADR-0005 §4 第 3 步）。 */
export function createPackRegistry(
  packs: Readonly<Record<BirthRegionId, CountryPack>> = PACKS,
): DataRegistry {
  const series = Object.values(packs).flatMap((pack) => pack.series);
  const breakpoints = Object.values(packs).flatMap((pack) => pack.breakpoints);
  const parents: Record<string, string> = {};
  for (const pack of Object.values(packs)) {
    for (const place of pack.places) parents[place.id] = pack.geographyId;
  }
  return new DataRegistry(series, { breakpoints, parents });
}
