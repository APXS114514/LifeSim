import type { BirthRegionId } from '@lifesim/content-schema';
import type { CountryPack } from './schema.ts';
import { CN_METADATA } from './packs/cn.meta.ts';
import { JP_METADATA } from './packs/jp.meta.ts';
import { KP_METADATA } from './packs/kp.meta.ts';
import { KR_METADATA } from './packs/kr.meta.ts';
import { RU_METADATA } from './packs/ru.meta.ts';

/** Small audited geography/history metadata; no statistical series or dynamic imports. */
export const PACK_METADATA: Record<BirthRegionId, Omit<CountryPack, 'series'>> = {
  CN: CN_METADATA,
  JP: JP_METADATA,
  KP: KP_METADATA,
  KR: KR_METADATA,
  RU: RU_METADATA,
};
