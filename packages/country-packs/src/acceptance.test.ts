import { BIRTH_REGION_IDS, type BirthRegionId, type ISODate } from '@lifesim/content-schema';
import { addDays, yearOf } from '@lifesim/simulation-core';
import { describe, expect, it } from 'vitest';
import { PACKS } from './packs/index.ts';
import { adminUnitAt, assignmentAt, currencyAt, politicalEntityAt, poolPlace } from './resolve.ts';
import { selectBirth, type BirthContext } from './select-birth.ts';

function packOf(packId: BirthRegionId) {
  return PACKS[packId];
}

function birthOn(packId: BirthRegionId, seed: string, birthDate: ISODate): BirthContext {
  return selectBirth({
    seed,
    region: packId,
    year: yearOf(birthDate),
    birthDate,
  });
}

describe('M2-022：五地 1950—2026 逐年实例化', () => {
  it.each(BIRTH_REGION_IDS)('instantiates every birth year in %s', (packId) => {
    const pack = packOf(packId);
    for (let year = 1950; year <= 2026; year += 1) {
      const context = selectBirth({
        seed: `accept-${packId}-${year}`,
        region: packId,
        year,
      });
      expect(context.birthDate.slice(0, 4)).toBe(String(year));
      expect([poolPlace(pack, 'urban').id, poolPlace(pack, 'rural').id]).toContain(context.placeId);
      expect(context.adminUnitId).toBe(
        assignmentAt(pack, context.placeId, context.birthDate).adminUnitId,
      );
      expect(context.politicalEntityId).toBe(
        politicalEntityAt(pack, context.placeId, context.birthDate).id,
      );
      expect(context.currency).toEqual(currencyAt(pack, context.birthDate));
    }
  });

  it('draws a random region for every year with positive weights', () => {
    for (let year = 1950; year <= 2026; year += 1) {
      const context = selectBirth({
        seed: `accept-random-${year}`,
        region: 'random',
        year,
      });
      expect(context.provenance.regionWeights).not.toBeNull();
      const weights = context.provenance.regionWeights;
      if (!weights) throw new Error('expected region weights');
      expect(Object.keys(weights).sort()).toEqual([...BIRTH_REGION_IDS].sort());
      for (const id of BIRTH_REGION_IDS) {
        expect(weights[id]).toBeGreaterThan(0);
      }
    }
  });
});

describe('M2-022：政体与名称边界', () => {
  it('moves political entities on every polity-change anchor without moving the place', () => {
    for (const packId of BIRTH_REGION_IDS) {
      const pack = packOf(packId);
      for (const anchor of pack.anchors) {
        if (anchor.kind !== 'polity-change') continue;
        const before = birthOn(packId, `accept-polity-${packId}`, addDays(anchor.at, -1));
        const after = birthOn(packId, `accept-polity-${packId}`, anchor.at);
        expect(before.politicalEntityId).toBe(anchor.fromEntityId);
        expect(after.politicalEntityId).toBe(anchor.toEntityId);
        expect(before.placeId).toBe(after.placeId);
        expect(before.adminUnitId).toBe(after.adminUnitId);
      }
    }
  });
});

describe('M2-022：币制与行政边界', () => {
  it('applies every redenomination on the anchor date', () => {
    for (const packId of BIRTH_REGION_IDS) {
      const pack = packOf(packId);
      for (const anchor of pack.anchors) {
        if (anchor.kind !== 'redenomination') continue;
        const before = birthOn(packId, `accept-currency-${packId}`, addDays(anchor.at, -1));
        const after = birthOn(packId, `accept-currency-${packId}`, anchor.at);
        expect(before.currency.version).toBe(anchor.fromVersion);
        expect(after.currency.version).toBe(anchor.toVersion);
      }
    }
  });

  it('changes the admin unit or political entity on every multi-segment assignment boundary', () => {
    for (const packId of BIRTH_REGION_IDS) {
      const pack = packOf(packId);
      for (const place of pack.places) {
        const assignments = pack.placeAssignments
          .filter((assignment) => assignment.placeId === place.id)
          .sort((left, right) => {
            const leftStart = left.validFrom ?? '0000-01-01';
            const rightStart = right.validFrom ?? '0000-01-01';
            return leftStart < rightStart ? -1 : leftStart > rightStart ? 1 : 0;
          });
        if (assignments.length < 2) continue;
        for (let index = 1; index < assignments.length; index += 1) {
          const boundary = assignments[index]?.validFrom;
          if (!boundary) continue;
          const before = assignmentAt(pack, place.id, addDays(boundary, -1));
          const after = assignmentAt(pack, place.id, boundary);
          expect(
            before.adminUnitId !== after.adminUnitId ||
              before.politicalEntityId !== after.politicalEntityId,
          ).toBe(true);
        }
      }
    }
  });
});

describe('M2-022：城镇比例的来源标记与没有静默的 0', () => {
  it('marks the 1950 urban-share fallback as C or D and the first observation as exact', () => {
    for (const packId of BIRTH_REGION_IDS) {
      const early = selectBirth({ seed: `accept-early-${packId}`, region: packId, year: 1950 });
      if (early.provenance.urbanShare.method !== 'exact') {
        expect(['C', 'D']).toContain(early.provenance.urbanShare.grade);
      }
      const first = selectBirth({ seed: `accept-first-${packId}`, region: packId, year: 1960 });
      expect(first.provenance.urbanShare.method).toBe('exact');
    }
  });

  it('never reports a zero in provenance numbers', () => {
    for (const packId of BIRTH_REGION_IDS) {
      for (const year of [1950, 1960, 1990, 2026]) {
        const context = selectBirth({
          seed: `accept-zero-${packId}-${year}`,
          region: packId,
          year,
        });
        expect(context.provenance.urbanShare.value).toBeGreaterThan(0);
        expect(context.provenance.urbanShare.sourceYear).toBeGreaterThan(0);
        if (context.provenance.regionWeights) {
          for (const weight of Object.values(context.provenance.regionWeights)) {
            expect(weight).toBeGreaterThan(0);
          }
        }
      }
    }
  });

  it('resolves every pool place through the public resolvers', () => {
    for (const packId of BIRTH_REGION_IDS) {
      const pack = packOf(packId);
      for (const settlement of ['urban', 'rural'] as const) {
        const place = poolPlace(pack, settlement);
        expect(adminUnitAt(pack, place.id, '2000-01-01').id).toBeTruthy();
      }
    }
  });
});
