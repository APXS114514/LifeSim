import { describe, expect, it } from 'vitest';
import { adminUnitAt, currencyAt } from '../resolve.ts';
import { validateCountryPack } from '../validate.ts';
import { KR_PACK } from './kr.ts';
import { PACKS } from './index.ts';

describe('KR pack', () => {
  it('passes the country-pack validation rules', () => {
    expect(validateCountryPack(KR_PACK)).toEqual([]);
    expect(PACKS.KR).toBe(KR_PACK);
  });

  it('moves Busan from Gyeongsangnam-do to its own municipality on 1963-01-01', () => {
    expect(adminUnitAt(KR_PACK, 'place:kr-busan', '1962-12-31').id).toBe('admin:kr-gyeongnam');
    expect(adminUnitAt(KR_PACK, 'place:kr-busan', '1963-01-01').id).toBe('admin:kr-busan');
  });

  it('applies both currency redenominations on their dates', () => {
    expect(currencyAt(KR_PACK, '1953-02-14')).toEqual({ code: 'KRW', version: 1 });
    expect(currencyAt(KR_PACK, '1953-02-15')).toEqual({ code: 'KRW', version: 2 });
    expect(currencyAt(KR_PACK, '1962-06-09')).toEqual({ code: 'KRW', version: 2 });
    expect(currencyAt(KR_PACK, '1962-06-10')).toEqual({ code: 'KRW', version: 3 });
    expect(currencyAt(KR_PACK, '2026-12-31')).toEqual({ code: 'KRW', version: 3 });
  });

  it('records the two redenomination divisors', () => {
    const anchors = KR_PACK.anchors.filter((anchor) => anchor.kind === 'redenomination');
    expect(
      anchors.map((anchor) => (anchor.kind === 'redenomination' ? anchor.divisor : 0)),
    ).toEqual([100, 10]);
  });
});
