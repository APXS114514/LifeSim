import { describe, expect, it } from 'vitest';
import { adminUnitAt, currencyAt, politicalEntityAt } from '../resolve.ts';
import { validateCountryPack } from '../validate.ts';
import { CN_PACK } from './cn.ts';
import { PACKS } from './index.ts';

describe('CN pack', () => {
  it('passes the country-pack validation rules', () => {
    expect(validateCountryPack(CN_PACK)).toEqual([]);
    expect(PACKS.CN).toBe(CN_PACK);
  });

  it('moves Chongqing through its three administrative periods', () => {
    const dates = [
      ['1950-01-01', 'admin:cn-chongqing-1949'],
      ['1954-06-18', 'admin:cn-chongqing-1949'],
      ['1954-06-19', 'admin:cn-sichuan'],
      ['1997-06-17', 'admin:cn-sichuan'],
      ['1997-06-18', 'admin:cn-chongqing'],
      ['2026-12-31', 'admin:cn-chongqing'],
    ] as const;
    for (const [date, expected] of dates) {
      expect(adminUnitAt(CN_PACK, 'place:cn-chongqing', date).id).toBe(expected);
    }
  });

  it('keeps the place ID and political entity stable across Chongqing changes', () => {
    for (const date of ['1950-01-01', '1954-06-19', '1997-06-18', '2026-12-31']) {
      expect(politicalEntityAt(CN_PACK, 'place:cn-chongqing', date).id).toBe('polity:cn-prc');
    }
  });

  it('applies the 1955 renminbi redenomination at 10000:1', () => {
    expect(currencyAt(CN_PACK, '1955-02-28')).toEqual({ code: 'CNY', version: 1 });
    expect(currencyAt(CN_PACK, '1955-03-01')).toEqual({ code: 'CNY', version: 2 });
    const anchor = CN_PACK.anchors.find(
      (candidate) => candidate.id === 'anchor:cn-redenomination-1955',
    );
    expect(anchor?.kind === 'redenomination' ? anchor.divisor : 0).toBe(10000);
  });
});
