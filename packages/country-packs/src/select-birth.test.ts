import type { BirthRegionId } from '@lifesim/content-schema';
import { BIRTH_REGION_IDS } from '@lifesim/content-schema';
import { describe, expect, it } from 'vitest';
import type { CountryPack } from './schema.ts';
import { createPackRegistry } from './registry.ts';
import { selectBirth } from './select-birth.ts';

/** 测试夹具，数值虚构：五个地区、固定的出生数权重与 0.6 的城镇比例。 */
function fixturePack(packId: BirthRegionId, births: number, urban = 0.6): CountryPack {
  const years = Array.from({ length: 77 }, (_, index) => 1950 + index);
  const evidence = (geographyId: string) => ({
    grade: 'D' as const,
    sourceIds: ['adr:0005'],
    modelVersion: 'fixture',
    geographyId,
    yearRange: [1950, 2026] as [number, number],
  });
  const sourceIds = ['adr:0005'];
  return {
    manifest: {
      packId,
      role: 'birth',
      schemaVersion: '0.1.0',
      engineRange: '0.1.x',
      validFrom: '1950-01-01',
      dataVersion: '0.1.0',
      licenseManifestPath: 'README.md',
      modules: {},
    },
    geographyId: `country:${packId}`,
    names: { 'zh-Hans': `测试${packId}`, en: `Test ${packId}` },
    politicalEntities: [
      {
        id: `polity:test-${packId}`,
        names: { 'zh-Hans': `测试政体${packId}`, en: `Test Polity ${packId}` },
        validFrom: null,
        validTo: null,
        sourceIds,
      },
    ],
    adminUnits: [
      {
        id: `admin:test-${packId}`,
        names: { 'zh-Hans': `测试地区${packId}`, en: `Test Admin ${packId}` },
        level: 'unspecified',
        validFrom: null,
        validTo: null,
        sourceIds,
      },
    ],
    places: [
      {
        id: `place:test-${packId}-urban`,
        kind: 'other-urban',
        settlement: 'urban',
        names: [
          { validFrom: null, validTo: null, names: { 'zh-Hans': '测试城镇', en: 'Test Urban' } },
        ],
        sourceIds,
      },
      {
        id: `place:test-${packId}-rural`,
        kind: 'other-rural',
        settlement: 'rural',
        names: [
          { validFrom: null, validTo: null, names: { 'zh-Hans': '测试农村', en: 'Test Rural' } },
        ],
        sourceIds,
      },
    ],
    placeAssignments: [
      {
        placeId: `place:test-${packId}-urban`,
        adminUnitId: `admin:test-${packId}`,
        politicalEntityId: `polity:test-${packId}`,
        validFrom: null,
        validTo: null,
        sourceIds,
      },
      {
        placeId: `place:test-${packId}-rural`,
        adminUnitId: `admin:test-${packId}`,
        politicalEntityId: `polity:test-${packId}`,
        validFrom: null,
        validTo: null,
        sourceIds,
      },
    ],
    currency: {
      code: 'TST',
      initialVersion: 1,
      versionNames: { '1': { 'zh-Hans': '测试币', en: 'Test currency' } },
    },
    anchors: [],
    breakpoints: [],
    series: [
      {
        id: `test/${packId}/births`,
        indicator: 'births',
        geographyId: `country:${packId}`,
        unit: 'thousand-persons',
        ageBasis: 'none',
        sex: 'both',
        evidence: evidence(`country:${packId}`),
        points: years.map((year) => ({ year, age: null, value: births, projected: false })),
      },
      {
        id: `test/${packId}/urban-share`,
        indicator: 'urban-share',
        geographyId: `country:${packId}`,
        unit: 'share',
        ageBasis: 'none',
        sex: 'both',
        evidence: evidence(`country:${packId}`),
        points: years.map((year) => ({ year, age: null, value: urban, projected: false })),
      },
    ],
  };
}

const weights: Record<BirthRegionId, number> = { CN: 50, JP: 20, KP: 10, KR: 15, RU: 5 };
const fixturePacks = Object.fromEntries(
  BIRTH_REGION_IDS.map((id) => [id, fixturePack(id, weights[id])]),
) as Record<BirthRegionId, CountryPack>;
const fixtureRegistry = createPackRegistry(fixturePacks);

describe('selectBirth with fixtures', () => {
  it('is deterministic for the same request', () => {
    const request = { seed: 'same', region: 'random' as const, year: 2000 as const };
    expect(selectBirth(request, fixturePacks, fixtureRegistry)).toEqual(
      selectBirth(request, fixturePacks, fixtureRegistry),
    );
  });

  it('draws regions according to their birth weights', () => {
    const counts: Record<string, number> = {};
    const total = 20_000;
    for (let index = 0; index < total; index += 1) {
      const context = selectBirth(
        { seed: `region-${index}`, region: 'random', year: 2000 },
        fixturePacks,
        fixtureRegistry,
      );
      counts[context.packId] = (counts[context.packId] ?? 0) + 1;
    }
    for (const id of BIRTH_REGION_IDS) {
      expect(Math.abs((counts[id] ?? 0) / total - weights[id] / 100)).toBeLessThan(0.01);
    }
  });

  it('draws every year between 1950 and 2026', () => {
    const counts = new Map<number, number>();
    const total = 20_000;
    for (let index = 0; index < total; index += 1) {
      const context = selectBirth(
        { seed: `year-${index}`, region: 'CN', year: 'random' },
        fixturePacks,
        fixtureRegistry,
      );
      const year = Number(context.birthDate.slice(0, 4));
      counts.set(year, (counts.get(year) ?? 0) + 1);
    }
    expect(counts.size).toBe(77);
    const values = [...counts.values()];
    expect(Math.max(...values) / Math.min(...values)).toBeLessThan(1.5);
  });

  it('draws the settlement according to urban share', () => {
    let urban = 0;
    const total = 20_000;
    for (let index = 0; index < total; index += 1) {
      const context = selectBirth(
        { seed: `urban-${index}`, region: 'CN', year: 2000 },
        fixturePacks,
        fixtureRegistry,
      );
      if (context.settlement === 'urban') urban += 1;
    }
    expect(Math.abs(urban / total - 0.6)).toBeLessThan(0.01);
  });

  it('keeps the date and settlement aligned whether the region is drawn or specified', () => {
    for (let index = 0; index < 200; index += 1) {
      const seed = `align-${index}`;
      const drawn = selectBirth(
        { seed, region: 'random', year: 2000 },
        fixturePacks,
        fixtureRegistry,
      );
      const specified = selectBirth(
        { seed, region: drawn.packId, year: 2000 },
        fixturePacks,
        fixtureRegistry,
      );
      expect(specified.birthDate).toBe(drawn.birthDate);
      expect(specified.settlement).toBe(drawn.settlement);
    }
  });

  it('fails a random region when any region lacks the birth count, but not a specified one', () => {
    const partial = Object.fromEntries(
      BIRTH_REGION_IDS.map((id) => [
        id,
        id === 'CN'
          ? {
              ...fixturePacks[id],
              series: fixturePacks[id].series.map((series) =>
                series.indicator === 'births'
                  ? {
                      ...series,
                      // 去掉 1998—2002，避免相邻年份回退（±2 年）把缺口补上。
                      points: series.points.filter(
                        (point) => point.year < 1998 || point.year > 2002,
                      ),
                    }
                  : series,
              ),
            }
          : fixturePacks[id],
      ]),
    ) as Record<BirthRegionId, CountryPack>;
    const partialRegistry = createPackRegistry(partial);
    expect(() =>
      selectBirth({ seed: 'missing', region: 'random', year: 2000 }, partial, partialRegistry),
    ).toThrow(/CN/);
    expect(
      selectBirth({ seed: 'missing', region: 'JP', year: 2000 }, partial, partialRegistry).packId,
    ).toBe('JP');
  });

  it('rejects out-of-range years and a birthDate in another year', () => {
    expect(() =>
      selectBirth({ seed: 's', region: 'CN', year: 1949 }, fixturePacks, fixtureRegistry),
    ).toThrow(RangeError);
    expect(() =>
      selectBirth({ seed: 's', region: 'CN', year: 2027 }, fixturePacks, fixtureRegistry),
    ).toThrow(RangeError);
    expect(() =>
      selectBirth(
        { seed: 's', region: 'CN', year: 2000, birthDate: '1999-12-31' },
        fixturePacks,
        fixtureRegistry,
      ),
    ).toThrow(RangeError);
  });
});

describe('selectBirth with the real packs', () => {
  it('resolves the USSR/Russia boundary and keeps the same place', () => {
    const before = selectBirth({ seed: 's', region: 'RU', year: 1991, birthDate: '1991-12-25' });
    const after = selectBirth({ seed: 's', region: 'RU', year: 1991, birthDate: '1991-12-26' });
    expect(before.politicalEntityId).toBe('polity:ussr');
    expect(after.politicalEntityId).toBe('polity:ru-russian-federation');
    expect(before.placeId).toBe(after.placeId);
  });

  it('resolves the Korean currency boundary', () => {
    expect(
      selectBirth({ seed: 's', region: 'KR', year: 1962, birthDate: '1962-06-09' }).currency,
    ).toEqual({ code: 'KRW', version: 2 });
    expect(
      selectBirth({ seed: 's', region: 'KR', year: 1962, birthDate: '1962-06-10' }).currency,
    ).toEqual({ code: 'KRW', version: 3 });
  });
});
