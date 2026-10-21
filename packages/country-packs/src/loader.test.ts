import { describe, expect, it, vi } from 'vitest';
import { BIRTH_REGION_IDS } from '@lifesim/content-schema';
import { createPackLoader } from './loader.ts';
import { PACKS } from './packs/index.ts';
import { PACK_METADATA } from './metadata.ts';
import { createRegistryForPacks } from './registry-core.ts';
import { selectBirthFromPacks } from './select-birth-core.ts';
import { selectBirth } from './select-birth.ts';

describe('country pack loading', () => {
  it('shares the complete geography metadata without statistics', () => {
    for (const id of BIRTH_REGION_IDS) {
      const { series: _series, ...metadata } = PACKS[id];
      expect(PACK_METADATA[id]).toEqual(metadata);
      expect(PACK_METADATA[id]).not.toHaveProperty('series');
    }
  });
  it('loads only the selected country and shares concurrent imports', async () => {
    const importer = vi.fn((id) => Promise.resolve(PACKS[id as keyof typeof PACKS]));
    const loader = createPackLoader(importer);
    const [first, second] = await Promise.all([loader.loadPack('JP'), loader.loadPack('JP')]);
    expect(first).toBe(PACKS.JP);
    expect(second).toBe(first);
    expect(importer.mock.calls).toEqual([['JP']]);
    expect(Object.keys(loader.packs)).toEqual(['JP']);
    expect(await loader.loadPack('JP')).toBe(first);
    expect(importer).toHaveBeenCalledTimes(1);
  });

  it('does not substitute a country on failure and permits a fresh retry', async () => {
    const importer = vi
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue(PACKS.JP);
    const loader = createPackLoader(importer);
    await expect(loader.loadPack('JP')).rejects.toThrow('offline');
    expect(Object.keys(loader.packs)).toEqual([]);
    expect(await loader.loadPack('JP')).toBe(PACKS.JP);
    expect(importer).toHaveBeenCalledTimes(2);
  });

  it('loads all countries with progress only for random selection', async () => {
    const loader = createPackLoader((id) => Promise.resolve(PACKS[id]));
    const progress: number[] = [];
    await loader.loadRequiredPacks('random', (done, total) => {
      expect(total).toBe(5);
      progress.push(done);
    });
    expect(progress).toEqual([0, 1, 2, 3, 4, 5]);
    expect(Object.keys(loader.packs).sort()).toEqual([...BIRTH_REGION_IDS].sort());
  });

  it('returns missing for unloaded countries without changing loaded values', () => {
    const partial = createRegistryForPacks({ JP: PACKS.JP });
    const lookup = { indicator: 'births' as const, geographyId: 'country:JP', year: 1978 };
    expect(partial.lookup(lookup)).toEqual(createRegistryForPacks(PACKS).lookup(lookup));
    expect(partial.lookup({ ...lookup, geographyId: 'country:CN' })).toMatchObject({
      status: 'missing',
    });
  });

  it.each([
    ['JP', 1978],
    ['CN', 1960],
    ['RU', 1980],
  ] as const)('preserves birth selection for %s %s', async (region, year) => {
    const loader = createPackLoader((id) => Promise.resolve(PACKS[id]));
    await loader.loadRequiredPacks(region);
    const request = { seed: 'lazy-packs-compatibility', region, year };
    expect(selectBirthFromPacks(request, loader.packs)).toEqual(selectBirth(request));
  });
});
