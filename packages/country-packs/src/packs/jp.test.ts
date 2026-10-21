import { describe, expect, it } from 'vitest';
import { currencyAt, politicalEntityAt, poolPlace } from '../resolve.ts';
import { validateCountryPack } from '../validate.ts';
import { JP_PACK } from './jp.ts';
import { PACKS } from './index.ts';

describe('JP pack', () => {
  it('passes the country-pack validation rules', () => {
    expect(validateCountryPack(JP_PACK)).toEqual([]);
  });

  it('keeps the same political entity across the coverage period', () => {
    expect(politicalEntityAt(JP_PACK, 'place:jp-tokyo', '1950-01-01').id).toBe('polity:jp-japan');
    expect(politicalEntityAt(JP_PACK, 'place:jp-tokyo', '2026-12-31').id).toBe('polity:jp-japan');
  });

  it('has no currency redenomination in the coverage period', () => {
    expect(currencyAt(JP_PACK, '1950-01-01')).toEqual({ code: 'JPY', version: 1 });
    expect(currencyAt(JP_PACK, '2026-12-31')).toEqual({ code: 'JPY', version: 1 });
  });

  it('exposes the rural population pool', () => {
    expect(poolPlace(JP_PACK, 'rural').id).toBe('place:jp-other-rural');
  });

  it('is registered in PACKS', () => {
    expect(PACKS.JP).toBe(JP_PACK);
  });

  it('has non-empty zh-Hans and English names for every entity and place', () => {
    for (const record of [...JP_PACK.politicalEntities, ...JP_PACK.adminUnits]) {
      expect(record.names['zh-Hans'].length).toBeGreaterThan(0);
      expect(record.names.en.length).toBeGreaterThan(0);
    }
    for (const place of JP_PACK.places) {
      for (const period of place.names) {
        expect(period.names['zh-Hans'].length).toBeGreaterThan(0);
        expect(period.names.en.length).toBeGreaterThan(0);
      }
    }
  });
});
