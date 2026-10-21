import type { BirthRegionId } from '@lifesim/content-schema';
import type { CountryPack } from '../schema.ts';
import { JP_PACK } from './jp.ts';

/** 已加入的国家包；M2-014 至 M2-018 逐个加入，M2-020 起要求五个齐全。 */
export const PACKS: Partial<Record<BirthRegionId, CountryPack>> = { JP: JP_PACK };
