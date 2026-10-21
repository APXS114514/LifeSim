import { BIRTH_REGION_IDS } from '@lifesim/content-schema';
import { describe, expect, it } from 'vitest';
import { PACKS } from './packs/index.ts';

describe('economy-phase anchors', () => {
  it('keeps every pack’s anchors sorted, unique and scoped to its own region', () => {
    for (const packId of BIRTH_REGION_IDS) {
      const pack = PACKS[packId];
      const times = pack.anchors.map((anchor) => anchor.at);
      expect(times, packId).toEqual([...times].sort());
      expect(new Set(times).size, packId).toBe(times.length);
      expect(new Set(pack.anchors.map((anchor) => anchor.id)).size).toBe(pack.anchors.length);
      for (const anchor of pack.anchors) {
        expect(anchor.regionIds, anchor.id).toEqual([packId]);
      }
    }
  });

  it('pairs every recession with a later recovery and a valid source', () => {
    for (const packId of BIRTH_REGION_IDS) {
      const economy = PACKS[packId].anchors.filter((anchor) => anchor.kind === 'economy-phase');
      let inRecession = false;
      for (const anchor of economy) {
        if (anchor.kind !== 'economy-phase') continue;
        if (anchor.phase === 'recession') {
          expect(inRecession, `${anchor.id} starts inside a recession`).toBe(false);
          inRecession = true;
        } else {
          expect(inRecession, `${anchor.id} recovery without recession`).toBe(true);
          inRecession = false;
        }
        expect(anchor.id).toMatch(
          new RegExp(`^anchor:${packId.toLowerCase()}-(recession|recovery)-\\d{4}$`),
        );
        expect(anchor.evidence.sourceIds.length).toBeGreaterThan(0);
        expect(anchor.evidence.geographyId).toBe(`country:${packId}`);
        expect(anchor.evidence.yearRange[0]).toBeLessThanOrEqual(Number(anchor.at.slice(0, 4)));
        expect(anchor.evidence.yearRange[1]).toBeGreaterThanOrEqual(Number(anchor.at.slice(0, 4)));
      }
      expect(inRecession, `${packId} ends inside a recession`).toBe(false);
    }
  });

  it('documents the deliberate North Korea gap (Q10)', () => {
    const economy = PACKS.KP.anchors.filter((anchor) => anchor.kind === 'economy-phase');
    expect(economy).toEqual([]);
  });
});
