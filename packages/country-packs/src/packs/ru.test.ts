import { describe, expect, it } from 'vitest';
import { adminUnitAt, currencyAt, placeNameAt, politicalEntityAt } from '../resolve.ts';
import { validateCountryPack } from '../validate.ts';
import { PACKS } from './index.ts';
import { RU_PACK } from './ru.ts';

describe('RU pack', () => {
  it('passes the country-pack validation rules', () => {
    expect(validateCountryPack(RU_PACK)).toEqual([]);
    expect(PACKS.RU).toBe(RU_PACK);
  });

  it('maps the USSR to the Russian Federation on 1991-12-26 without moving residents', () => {
    expect(politicalEntityAt(RU_PACK, 'place:ru-moscow', '1991-12-25').id).toBe('polity:ussr');
    expect(politicalEntityAt(RU_PACK, 'place:ru-moscow', '1991-12-26').id).toBe(
      'polity:ru-russian-federation',
    );
    expect(adminUnitAt(RU_PACK, 'place:ru-moscow', '1991-12-25').id).toBe('admin:ru-moscow');
    expect(adminUnitAt(RU_PACK, 'place:ru-moscow', '1991-12-26').id).toBe('admin:ru-moscow');
  });

  it('renames Leningrad to Saint Petersburg on 1991-09-06 while keeping the place ID', () => {
    expect(placeNameAt(RU_PACK, 'place:ru-saint-petersburg', '1991-09-05').en).toBe('Leningrad');
    expect(placeNameAt(RU_PACK, 'place:ru-saint-petersburg', '1991-09-06').en).toBe(
      'Saint Petersburg',
    );
  });

  it('applies both currency redenominations on their dates', () => {
    expect(currencyAt(RU_PACK, '1960-12-31')).toEqual({ code: 'RUB', version: 1 });
    expect(currencyAt(RU_PACK, '1961-01-01')).toEqual({ code: 'RUB', version: 2 });
    expect(currencyAt(RU_PACK, '1997-12-31')).toEqual({ code: 'RUB', version: 2 });
    expect(currencyAt(RU_PACK, '1998-01-01')).toEqual({ code: 'RUB', version: 3 });
  });

  it('aligns the polity-change anchor with both entities validity dates', () => {
    const anchor = RU_PACK.anchors.find(
      (candidate) => candidate.id === 'anchor:ru-polity-change-1991',
    );
    if (!anchor || anchor.kind !== 'polity-change') throw new Error('missing polity anchor');
    const from = RU_PACK.politicalEntities.find((entity) => entity.id === anchor.fromEntityId);
    const to = RU_PACK.politicalEntities.find((entity) => entity.id === anchor.toEntityId);
    expect(from?.validTo).toBe(anchor.at);
    expect(to?.validFrom).toBe(anchor.at);
  });
});
