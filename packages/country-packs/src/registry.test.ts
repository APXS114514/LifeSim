import { BIRTH_REGION_IDS } from '@lifesim/content-schema';
import { canonicalJson, fingerprint } from '@lifesim/simulation-core';
import { describe, expect, it } from 'vitest';
import { DATA_FINGERPRINTS } from './data-golden.ts';
import { PACKS } from './packs/index.ts';
import { createPackRegistry } from './registry.ts';
import { validateCountryPack } from './validate.ts';

const registry = createPackRegistry();

describe('country pack series', () => {
  it('validates every pack and attaches the M2 and M3 education indicators', () => {
    for (const packId of BIRTH_REGION_IDS) {
      const pack = PACKS[packId];
      expect(validateCountryPack(pack)).toEqual([]);
      const expected = ['births', 'life-table-qx', 'urban-share', 'education-enrollment-secondary'];
      if (packId !== 'KP') expected.push('education-completion-upper-secondary');
      expect(pack.series.map((series) => series.indicator)).toEqual(expected);
    }
  });

  it('locks every series with the 24 data fingerprints', () => {
    const actual: Record<string, string> = {};
    for (const pack of Object.values(PACKS)) {
      for (const series of pack.series) {
        actual[series.id] = fingerprint(canonicalJson(series));
      }
    }
    expect(Object.keys(DATA_FINGERPRINTS)).toHaveLength(24);
    expect(actual).toEqual(DATA_FINGERPRINTS);
  });
});

describe('createPackRegistry', () => {
  it('finds births in 1950 and the projected 2026 value for all five regions', () => {
    for (const packId of BIRTH_REGION_IDS) {
      const early = registry.lookup({
        indicator: 'births',
        geographyId: `country:${packId}`,
        year: 1950,
      });
      expect(early).toMatchObject({ status: 'found', method: 'exact', projected: false });
      const late = registry.lookup({
        indicator: 'births',
        geographyId: `country:${packId}`,
        year: 2026,
      });
      expect(late).toMatchObject({ status: 'found', method: 'exact', projected: true });
    }
  });

  it('finds qx at age 0 and age 100 in 2000', () => {
    for (const packId of BIRTH_REGION_IDS) {
      const zero = registry.lookup({
        indicator: 'life-table-qx',
        geographyId: `country:${packId}`,
        year: 2000,
        age: 0,
      });
      expect(zero.status).toBe('found');
      const hundred = registry.lookup({
        indicator: 'life-table-qx',
        geographyId: `country:${packId}`,
        year: 2000,
        age: 100,
      });
      expect(hundred).toMatchObject({ status: 'found', value: 1 });
    }
  });

  it('finds urban-share exactly at the first observed year', () => {
    for (const packId of BIRTH_REGION_IDS) {
      const found = registry.lookup({
        indicator: 'urban-share',
        geographyId: `country:${packId}`,
        year: 1960,
      });
      expect(found).toMatchObject({ status: 'found', method: 'exact' });
    }
  });

  it('uses hold-first-observed in 1955 and neighbor-year in 1958', () => {
    for (const packId of BIRTH_REGION_IDS) {
      expect(
        registry.lookup({ indicator: 'urban-share', geographyId: `country:${packId}`, year: 1955 }),
      ).toMatchObject({
        method: 'hold-first-observed',
        sourceYear: 1960,
        evidence: { grade: 'D' },
      });
      expect(
        registry.lookup({ indicator: 'urban-share', geographyId: `country:${packId}`, year: 1958 }),
      ).toMatchObject({
        method: 'fallback-neighbor-year',
        sourceYear: 1960,
        evidence: { grade: 'C' },
      });
    }
  });

  it('falls back from a place to its country', () => {
    const place = registry.lookup({
      indicator: 'births',
      geographyId: 'place:ru-moscow',
      year: 1990,
    });
    const country = registry.lookup({
      indicator: 'births',
      geographyId: 'country:RU',
      year: 1990,
    });
    expect(place).toMatchObject({
      method: 'fallback-parent-geography',
      sourceGeographyId: 'country:RU',
    });
    if (place.status === 'found' && country.status === 'found') {
      expect(place.value).toBe(country.value);
    } else {
      throw new Error('expected both lookups to be found');
    }
  });

  it('never returns zero for a missing birth count across 1950—2026', () => {
    for (const packId of BIRTH_REGION_IDS) {
      for (let year = 1950; year <= 2026; year += 1) {
        const result = registry.lookup({
          indicator: 'births',
          geographyId: `country:${packId}`,
          year,
        });
        expect(result.status).toBe('found');
        if (result.status === 'found') expect(result.value).toBeGreaterThan(0);
      }
    }
  });
});
