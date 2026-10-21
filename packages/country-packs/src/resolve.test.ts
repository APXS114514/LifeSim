import { describe, expect, it } from 'vitest';
import {
  adminUnitAt,
  assignmentAt,
  currencyAt,
  placeNameAt,
  politicalEntityAt,
  poolPlace,
} from './resolve.ts';
import type { CountryPack } from './schema.ts';

/** 测试夹具，非真实历史：所有名称以「测试」/Test 开头。 */
function fixturePack(): CountryPack {
  const sourceIds = ['adr:0005'];
  const evidence = (year: number) => ({
    grade: 'D' as const,
    sourceIds,
    modelVersion: 'fixture',
    geographyId: 'country:RU',
    yearRange: [year, year] as [number, number],
  });
  return {
    manifest: {
      packId: 'RU',
      role: 'birth',
      schemaVersion: '0.1.0',
      engineRange: '0.1.x',
      validFrom: '1950-01-01',
      dataVersion: '0.1.0',
      licenseManifestPath: 'README.md',
      modules: {},
    },
    geographyId: 'country:RU',
    names: { 'zh-Hans': '测试地区', en: 'Test Region' },
    politicalEntities: [
      {
        id: 'polity:test-old',
        names: { 'zh-Hans': '测试旧政体', en: 'Test Old Polity' },
        validFrom: null,
        validTo: '2000-01-01',
        sourceIds,
      },
      {
        id: 'polity:test-new',
        names: { 'zh-Hans': '测试新政体', en: 'Test New Polity' },
        validFrom: '2000-01-01',
        validTo: null,
        sourceIds,
      },
    ],
    adminUnits: [
      {
        id: 'admin:test-a',
        names: { 'zh-Hans': '测试行政区甲', en: 'Test Admin A' },
        level: 'province',
        validFrom: null,
        validTo: null,
        sourceIds,
      },
      {
        id: 'admin:test-b',
        names: { 'zh-Hans': '测试行政区乙', en: 'Test Admin B' },
        level: 'province',
        validFrom: null,
        validTo: null,
        sourceIds,
      },
      {
        id: 'admin:test-unspecified',
        names: { 'zh-Hans': '测试其他地区', en: 'Test Other Areas' },
        level: 'unspecified',
        validFrom: null,
        validTo: null,
        sourceIds,
      },
    ],
    places: [
      {
        id: 'place:test-city',
        kind: 'city',
        settlement: 'urban',
        sourceIds,
        names: [
          {
            validFrom: null,
            validTo: '1990-06-01',
            names: { 'zh-Hans': '测试旧城', en: 'Test Old City' },
          },
          {
            validFrom: '1990-06-01',
            validTo: null,
            names: { 'zh-Hans': '测试新城', en: 'Test New City' },
          },
        ],
      },
      {
        id: 'place:test-other-urban',
        kind: 'other-urban',
        settlement: 'urban',
        sourceIds,
        names: [
          {
            validFrom: null,
            validTo: null,
            names: { 'zh-Hans': '测试其他城镇', en: 'Test Other Urban' },
          },
        ],
      },
      {
        id: 'place:test-other-rural',
        kind: 'other-rural',
        settlement: 'rural',
        sourceIds,
        names: [
          {
            validFrom: null,
            validTo: null,
            names: { 'zh-Hans': '测试其他农村', en: 'Test Other Rural' },
          },
        ],
      },
    ],
    placeAssignments: [
      {
        placeId: 'place:test-city',
        adminUnitId: 'admin:test-a',
        politicalEntityId: 'polity:test-old',
        validFrom: null,
        validTo: '1980-01-01',
        sourceIds,
      },
      {
        placeId: 'place:test-city',
        adminUnitId: 'admin:test-b',
        politicalEntityId: 'polity:test-old',
        validFrom: '1980-01-01',
        validTo: '2000-01-01',
        sourceIds,
      },
      {
        placeId: 'place:test-city',
        adminUnitId: 'admin:test-b',
        politicalEntityId: 'polity:test-new',
        validFrom: '2000-01-01',
        validTo: null,
        sourceIds,
      },
      {
        placeId: 'place:test-other-urban',
        adminUnitId: 'admin:test-unspecified',
        politicalEntityId: 'polity:test-old',
        validFrom: null,
        validTo: '2000-01-01',
        sourceIds,
      },
      {
        placeId: 'place:test-other-urban',
        adminUnitId: 'admin:test-unspecified',
        politicalEntityId: 'polity:test-new',
        validFrom: '2000-01-01',
        validTo: null,
        sourceIds,
      },
      {
        placeId: 'place:test-other-rural',
        adminUnitId: 'admin:test-unspecified',
        politicalEntityId: 'polity:test-old',
        validFrom: null,
        validTo: '2000-01-01',
        sourceIds,
      },
      {
        placeId: 'place:test-other-rural',
        adminUnitId: 'admin:test-unspecified',
        politicalEntityId: 'polity:test-new',
        validFrom: '2000-01-01',
        validTo: null,
        sourceIds,
      },
    ],
    currency: {
      code: 'TST',
      initialVersion: 1,
      versionNames: {
        '1': { 'zh-Hans': '测试币一', en: 'Test currency one' },
        '2': { 'zh-Hans': '测试币二', en: 'Test currency two' },
        '3': { 'zh-Hans': '测试币三', en: 'Test currency three' },
      },
    },
    anchors: [
      {
        id: 'anchor:test-redenomination-1970',
        at: '1970-01-01',
        regionIds: ['RU'],
        evidence: evidence(1970),
        kind: 'redenomination',
        currencyCode: 'TST',
        fromVersion: 1,
        toVersion: 2,
        divisor: 100,
      },
      {
        id: 'anchor:test-redenomination-1980',
        at: '1980-01-01',
        regionIds: ['RU'],
        evidence: evidence(1980),
        kind: 'redenomination',
        currencyCode: 'TST',
        fromVersion: 2,
        toVersion: 3,
        divisor: 10,
      },
      {
        id: 'anchor:test-polity-change-2000',
        at: '2000-01-01',
        regionIds: ['RU'],
        evidence: evidence(2000),
        kind: 'polity-change',
        fromEntityId: 'polity:test-old',
        toEntityId: 'polity:test-new',
      },
    ],
    breakpoints: [
      {
        id: 'bp-test',
        geographyIds: ['country:RU'],
        date: '1990-01-01',
        indicators: ['births'],
        reason: 'test breakpoint',
        sourceIds,
      },
    ],
    series: [],
  };
}

const pack = fixturePack();

describe('date-aware resolution', () => {
  it('switches the political entity on the polity-change date', () => {
    expect(politicalEntityAt(pack, 'place:test-city', '1999-12-31').id).toBe('polity:test-old');
    expect(politicalEntityAt(pack, 'place:test-city', '2000-01-01').id).toBe('polity:test-new');
    expect(politicalEntityAt(pack, 'place:test-city', '2000-01-02').id).toBe('polity:test-new');
  });

  it('switches the place name on the rename date', () => {
    expect(placeNameAt(pack, 'place:test-city', '1990-05-31').en).toBe('Test Old City');
    expect(placeNameAt(pack, 'place:test-city', '1990-06-01').en).toBe('Test New City');
    expect(assignmentAt(pack, 'place:test-city', '1990-06-01').placeId).toBe('place:test-city');
  });

  it('switches the admin unit on the reassignment date', () => {
    expect(adminUnitAt(pack, 'place:test-city', '1979-12-31').id).toBe('admin:test-a');
    expect(adminUnitAt(pack, 'place:test-city', '1980-01-01').id).toBe('admin:test-b');
  });

  it('applies currency versions on the redenomination date', () => {
    expect(currencyAt(pack, '1969-12-31')).toEqual({ code: 'TST', version: 1 });
    expect(currencyAt(pack, '1970-01-01')).toEqual({ code: 'TST', version: 2 });
    expect(currencyAt(pack, '1979-12-31')).toEqual({ code: 'TST', version: 2 });
    expect(currencyAt(pack, '1980-01-01')).toEqual({ code: 'TST', version: 3 });
  });

  it('rejects dates before the coverage start and unknown places', () => {
    expect(() => politicalEntityAt(pack, 'place:test-city', '1949-12-31')).toThrow(RangeError);
    expect(() => currencyAt(pack, '1949-12-31')).toThrow(RangeError);
    expect(() => assignmentAt(pack, 'place:test-missing', '2000-01-01')).toThrow(
      /place:test-missing/,
    );
  });

  it('returns the two population-pool places', () => {
    expect(poolPlace(pack, 'urban').id).toBe('place:test-other-urban');
    expect(poolPlace(pack, 'rural').id).toBe('place:test-other-rural');
  });
});
