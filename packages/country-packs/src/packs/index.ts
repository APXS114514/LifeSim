import type { BirthRegionId } from '@lifesim/content-schema';
import type { CountryPack } from '../schema.ts';
import { CN_PACK } from './cn.ts';
import { JP_PACK } from './jp.ts';
import { KP_PACK } from './kp.ts';
import { KR_PACK } from './kr.ts';
import { RU_PACK } from './ru.ts';

/** 已加入的国家包；M2-014 至 M2-018 逐个加入，M2-020 起要求五个齐全。 */
export const PACKS: Partial<Record<BirthRegionId, CountryPack>> = {
  CN: CN_PACK,
  JP: JP_PACK,
  KP: KP_PACK,
  KR: KR_PACK,
  RU: RU_PACK,
};
