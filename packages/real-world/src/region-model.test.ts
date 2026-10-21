import type { Indicator } from '@lifesim/content-schema';
import { describe, expect, it } from 'vitest';
import { createRealRegion, realDataRegistry } from './region-model.ts';

function lookup(indicator: Indicator, geographyId: string, year: number) {
  const result = realDataRegistry().lookup({ indicator, geographyId, year });
  if (result.status === 'missing') throw new Error(result.reason);
  return result;
}

describe('real RegionModel queries (M3-009)', () => {
  it('returns the WDI value and evidence for a covered education year', () => {
    const region = createRealRegion('JP', '1978-01-01');
    const value = region.queries.education.secondaryEnrollmentRate(2015, 'urban');
    const expected = lookup('education-enrollment-secondary', 'country:JP', 2015);
    expect(value?.value).toBe(expected.value);
    expect(value?.grade).toBe('B');
    expect(value?.quality).toBe('exact');
    expect(value?.sourceIds).toContain('worldbank-wdi:SE.SEC.ENRR');
    expect(region.tables.evidenceFor('education-enrollment-secondary').sourceIds).toContain(
      'worldbank-wdi:SE.SEC.ENRR',
    );
  });

  it('does not invent a value when the series starts after the requested year', () => {
    const region = createRealRegion('JP', '1978-01-01');
    expect(region.queries.education.secondaryEnrollmentRate(1978, 'urban')).toBeNull();
    expect(region.queries.health.outOfPocketShare(1990)).toBeNull();
  });

  it('uses the neighbor-year fallback and downgrades its evidence', () => {
    const region = createRealRegion('JP', '1978-01-01');
    const value = region.queries.education.secondaryEnrollmentRate(2012, 'urban');
    const expected = lookup('education-enrollment-secondary', 'country:JP', 2013);
    expect(value?.value).toBe(expected.value);
    expect(value?.quality).toBe('neighbor-year');
    expect(value?.grade).toBe('C');
    expect(value?.sourceYear).toBe(2013);
  });

  it('exposes CPI and labor participation from the registry', () => {
    const kr = createRealRegion('KR', '1997-01-01');
    const cpi = kr.queries.prices.cpi(1997);
    const expected = lookup('cpi-index', 'country:KR', 1997);
    expect(cpi?.value).toBe(expected.value);
    expect(cpi?.grade).toBe('B');

    const ru = createRealRegion('RU', '1990-01-01');
    const labor = ru.queries.labor.participationRate(1990);
    const expectedLabor = lookup('labor-force-participation', 'country:RU', 1990);
    expect(labor?.value).toBe(expectedLabor.value);
    expect(labor?.grade).toBe('B');
  });

  it('returns missing for a country/year without the indicator', () => {
    const kp = createRealRegion('KP', '1990-01-01');
    expect(kp.queries.prices.cpi(1990)).toBeNull();
    expect(kp.queries.health.outOfPocketShare(2000)).toBeNull();
  });

  it('converts nominal money with CPI and leaves it unchanged when CPI is missing', () => {
    const region = createRealRegion('JP', '1978-01-01');
    const currency = { code: 'JPY', version: 1 } as const;
    const cpi2020 = lookup('cpi-index', 'country:JP', 2020).value;
    const cpi2010 = lookup('cpi-index', 'country:JP', 2010).value;
    const converted = region.queries.prices.toRealMinor(1000, currency, 2020, 2010);
    expect(Math.abs(converted - Math.round((1000 * cpi2010) / cpi2020))).toBeLessThanOrEqual(1);

    const kp = createRealRegion('KP', '1990-01-01');
    expect(kp.queries.prices.toRealMinor(1000, { code: 'KPW', version: 1 }, 1990, 2010)).toBe(1000);
  });
});
