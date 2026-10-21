import { describe, expect, it } from 'vitest';
import type { CountryPack } from './schema.ts';
import { validateCountryPack } from './validate.ts';

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

function clone(): CountryPack {
  const json: unknown = JSON.parse(JSON.stringify(fixturePack()));
  return json as CountryPack;
}

describe('validateCountryPack', () => {
  it('accepts the fixture', () => {
    expect(validateCountryPack(fixturePack())).toEqual([]);
  });

  it.each([
    [
      'rule 1 manifest',
      () => {
        const pack = clone();
        pack.manifest.packId = 'ZZ';
        return pack;
      },
      'ZZ',
    ],
    [
      'rule 2 duplicate ids',
      () => {
        const pack = clone();
        const place = pack.places.find((candidate) => candidate.id === 'place:test-other-urban');
        if (place) place.id = 'admin:test-a';
        return pack;
      },
      'admin:test-a',
    ],
    [
      'rule 3 pool places',
      () => {
        const pack = clone();
        pack.places.push({ ...pack.places[1]!, id: 'place:test-extra-urban' });
        return pack;
      },
      'other-urban',
    ],
    [
      'rule 4 unknown place',
      () => {
        const pack = clone();
        const assignment = pack.placeAssignments[0];
        if (assignment) assignment.placeId = 'place:test-missing';
        return pack;
      },
      'place:test-missing',
    ],
    [
      'rule 5 assignment gap',
      () => {
        const pack = clone();
        pack.placeAssignments = pack.placeAssignments.filter(
          (assignment) =>
            !(assignment.placeId === 'place:test-city' && assignment.validFrom === '1980-01-01'),
        );
        return pack;
      },
      'place:test-city',
    ],
    [
      'rule 6 admin coverage',
      () => {
        const pack = clone();
        const admin = pack.adminUnits.find((candidate) => candidate.id === 'admin:test-b');
        if (admin) admin.validTo = '1990-01-01';
        return pack;
      },
      'admin:test-b',
    ],
    [
      'rule 7 name gap',
      () => {
        const pack = clone();
        const city = pack.places.find((candidate) => candidate.id === 'place:test-city');
        if (city && city.names[1]) city.names[1].validFrom = '1991-01-01';
        return pack;
      },
      'place:test-city',
    ],
    [
      'rule 8 anchor region',
      () => {
        const pack = clone();
        pack.anchors.push({
          id: 'anchor:test-economy',
          at: '1960-01-01',
          regionIds: ['CN'],
          evidence: {
            grade: 'D',
            sourceIds: ['adr:0005'],
            modelVersion: 'fixture',
            geographyId: 'country:RU',
            yearRange: [1960, 1960],
          },
          kind: 'economy-phase',
          phase: 'recession',
        });
        return pack;
      },
      'anchor:test-economy',
    ],
    [
      'rule 9 currency chain',
      () => {
        const pack = clone();
        const anchor = pack.anchors.find(
          (candidate) => candidate.id === 'anchor:test-redenomination-1980',
        );
        if (anchor && anchor.kind === 'redenomination') anchor.fromVersion = 1;
        return pack;
      },
      'anchor:test-redenomination-1980',
    ],
    [
      'rule 10 polity dates',
      () => {
        const pack = clone();
        const entity = pack.politicalEntities.find(
          (candidate) => candidate.id === 'polity:test-new',
        );
        if (entity) entity.validFrom = '1999-01-01';
        return pack;
      },
      'anchor:test-polity-change-2000',
    ],
    [
      'rule 11 missing polity anchor',
      () => {
        const pack = clone();
        pack.anchors = pack.anchors.filter(
          (anchor) => anchor.id !== 'anchor:test-polity-change-2000',
        );
        return pack;
      },
      'polity:test-old',
    ],
    [
      'rule 12 breakpoint geography',
      () => {
        const pack = clone();
        const breakpoint = pack.breakpoints[0];
        if (breakpoint) breakpoint.geographyIds = ['place:test-unknown'];
        return pack;
      },
      'bp-test',
    ],
    [
      'rule 13 series id',
      () => {
        const pack = clone();
        pack.series.push({
          id: 'wpp2024/CN/births',
          indicator: 'births',
          geographyId: 'country:RU',
          unit: 'thousand-persons',
          ageBasis: 'none',
          sex: 'both',
          evidence: {
            grade: 'B',
            sourceIds: ['un-wpp:2024'],
            modelVersion: 'fixture',
            geographyId: 'country:RU',
            yearRange: [1950, 1950],
          },
          points: [{ year: 1950, age: null, value: 1, projected: false }],
        });
        return pack;
      },
      'wpp2024/CN/births',
    ],
  ])('rejects a violation of %s', (_label, mutate, expected) => {
    const problems = validateCountryPack(mutate());
    expect(problems.length).toBeGreaterThan(0);
    expect(problems.some((problem) => problem.includes(expected))).toBe(true);
  });
});
