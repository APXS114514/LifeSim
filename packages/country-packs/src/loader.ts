import { BIRTH_REGION_IDS, type BirthRegionId } from '@lifesim/content-schema';
import type { CountryPack } from './schema.ts';

export type LoadedPacks = Partial<Record<BirthRegionId, CountryPack>>;
export type PackProgress = (completed: number, total: number) => void;
type ImportPack = (id: BirthRegionId) => Promise<CountryPack>;

/** Import failures are not cached: reconnecting and retrying must remain possible. */
export function createPackLoader(importPack: ImportPack) {
  const packs: LoadedPacks = {};
  const pending = new Map<BirthRegionId, Promise<CountryPack>>();
  function loadPack(id: BirthRegionId): Promise<CountryPack> {
    const loaded = packs[id];
    if (loaded) return Promise.resolve(loaded);
    const current = pending.get(id);
    if (current) return current;
    const promise = Promise.resolve()
      .then(() => importPack(id))
      .then((pack) => {
        if (pack.manifest.packId !== id)
          throw new Error(`Expected pack ${id}, received ${pack.manifest.packId}`);
        packs[id] = pack;
        return pack;
      })
      .finally(() => {
        pending.delete(id);
      });
    pending.set(id, promise);
    return promise;
  }
  async function loadRequiredPacks(
    region: BirthRegionId | 'random',
    progress?: PackProgress,
  ): Promise<void> {
    const ids = region === 'random' ? BIRTH_REGION_IDS : [region];
    let completed = 0;
    progress?.(completed, ids.length);
    await Promise.all(
      ids.map(async (id) => {
        await loadPack(id);
        progress?.(++completed, ids.length);
      }),
    );
  }
  return { packs, loadPack, loadRequiredPacks };
}

const importers = {
  CN: () => import('./packs/cn.ts').then((module) => module.CN_PACK),
  JP: () => import('./packs/jp.ts').then((module) => module.JP_PACK),
  KP: () => import('./packs/kp.ts').then((module) => module.KP_PACK),
  KR: () => import('./packs/kr.ts').then((module) => module.KR_PACK),
  RU: () => import('./packs/ru.ts').then((module) => module.RU_PACK),
};
const loader = createPackLoader((id) => importers[id]());
export const loadedPacks = loader.packs;
export const loadPack = loader.loadPack;
export const loadRequiredPacks = loader.loadRequiredPacks;
