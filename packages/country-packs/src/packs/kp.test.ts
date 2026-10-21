import { describe, expect, it } from 'vitest';
import { currencyAt, politicalEntityAt } from '../resolve.ts';
import { validateCountryPack } from '../validate.ts';
import { KP_PACK } from './kp.ts';
import { PACKS } from './index.ts';

describe('KP pack', () => {
  it('passes the country-pack validation rules', () => {
    expect(validateCountryPack(KP_PACK)).toEqual([]);
    expect(PACKS.KP).toBe(KP_PACK);
  });

  it('applies both redenominations on their dates', () => {
    expect(currencyAt(KP_PACK, '1959-02-12')).toEqual({ code: 'KPW', version: 1 });
    expect(currencyAt(KP_PACK, '1959-02-13')).toEqual({ code: 'KPW', version: 2 });
    expect(currencyAt(KP_PACK, '2009-11-29')).toEqual({ code: 'KPW', version: 2 });
    expect(currencyAt(KP_PACK, '2009-11-30')).toEqual({ code: 'KPW', version: 3 });
    expect(currencyAt(KP_PACK, '2026-12-31')).toEqual({ code: 'KPW', version: 3 });
  });

  it('keeps Pyongyang in the DPRK on 1950-01-01', () => {
    expect(politicalEntityAt(KP_PACK, 'place:kp-pyongyang', '1950-01-01').id).toBe(
      'polity:kp-dprk',
    );
  });
});
