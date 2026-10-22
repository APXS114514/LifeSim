import type { Indicator } from '@lifesim/content-schema';
import type { EducationSegment } from '@lifesim/country-packs';
import { describe, expect, it } from 'vitest';
import {
  createRealRegion,
  educationSegmentAt,
  educationSystemAt,
  realDataRegistry,
} from './region-model.ts';

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

describe('education system by year (M3-012a)', () => {
  /** 测试夹具：两个分段中间留一个缺口，用来验证「借最近分段并降为 D」。 */
  function segment(
    validFrom: number,
    validTo: number | null,
    primaryYears: number,
  ): EducationSegment {
    return {
      validFrom,
      validTo,
      primaryStartAge: 7,
      primaryYears,
      secondaryYears: 3,
      tertiaryYears: 4,
      compulsoryYears: 0,
      entranceExam: { kind: 'none' },
      feeShare: 0,
      grade: 'C',
      sourceIds: ['e-gov:test-fixture'],
      note: '测试夹具（虚构）',
    };
  }

  it('reads the school system from the country pack, not the M3-lite constants', () => {
    const jp = createRealRegion('JP', '1950-01-01');
    const system = jp.queries.education.systemAt(1955);
    expect(system.primaryStartAge).toBe(6);
    expect(system.primaryYears).toBe(6);
    expect(system.compulsoryYears).toBe(9);
    expect(system.grade).toBe('D');
    expect(system.sourceIds).toContain('adr:0007');
  });

  it('resolves different eras for the same country', () => {
    const cn = createRealRegion('CN', '1960-01-01');
    expect(cn.queries.education.systemAt(1965).entranceExam.kind).toBe('exam');
    expect(cn.queries.education.systemAt(1976).entranceExam).toEqual({ kind: 'none' });
    expect(cn.queries.education.systemAt(1977).entranceExam.kind).toBe('exam');
    expect(cn.queries.education.systemAt(1985).compulsoryYears).toBe(0);
    expect(cn.queries.education.systemAt(1986).compulsoryYears).toBe(9);
  });

  it('is deterministic for the same country and year', () => {
    const ru = createRealRegion('RU', '1990-01-01');
    expect(ru.queries.education.systemAt(1970)).toEqual(ru.queries.education.systemAt(1970));
  });

  it('borrows the nearest segment and downgrades the evidence when a year is uncovered', () => {
    const segments = [segment(1950, 1959, 6), segment(1969, 1979, 7)];
    const hit = educationSegmentAt(segments, 1970);
    expect(hit.exact).toBe(true);
    expect(hit.segment.primaryYears).toBe(7);

    expect(educationSegmentAt(segments, 1979).exact).toBe(true);
    const borrowed = educationSystemAt(segments, 1980);
    expect(borrowed.grade).toBe('D');
    expect(borrowed.primaryYears).toBe(7);
    expect(borrowed.sourceIds).toEqual(['e-gov:test-fixture']);

    const before = educationSystemAt(segments, 1940);
    expect(before.grade).toBe('D');
    expect(before.primaryYears).toBe(6);
  });

  it('picks the earlier segment when two segments are equally far away', () => {
    const segments = [segment(1950, 1959, 6), segment(1969, 1979, 7)];
    const tie = educationSegmentAt(segments, 1964);
    expect(tie.exact).toBe(false);
    expect(tie.segment.validFrom).toBe(1950);
  });

  it('rejects an empty segment list instead of inventing a system', () => {
    expect(() => educationSegmentAt([], 2000)).toThrow(/empty/i);
  });
});
