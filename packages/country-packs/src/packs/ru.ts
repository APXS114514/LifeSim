// 俄罗斯（RU，含苏联时期）国家包：地理、政体更替与货币。统计序列在 M2-020 接入。
//
// 领土与政体分开（GDD §5）：地点在 1991-12-26 前属于苏联，之后属于俄罗斯联邦；
// 地点本身不移动。列宁格勒在 1991-09-06 恢复历史名称圣彼得堡，地点 ID 不变。
// 1992—1993 年苏联卢布按 1:1 换成俄罗斯卢布，不是重定值，仍属币制版本 2。
import type { CountryPack } from '../schema.ts';

const RU_EVIDENCE = (year: number) => ({
  grade: 'A' as const,
  sourceIds: ['rg:ussr-dissolution-1991'],
  modelVersion: 'ru-pack-0.1.0',
  geographyId: 'country:RU',
  yearRange: [year, year] as [number, number],
});

/** 俄罗斯国家包。 */
export const RU_PACK: CountryPack = {
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
  names: { 'zh-Hans': '俄罗斯（含苏联时期）', en: 'Russia (incl. Soviet era)' },
  politicalEntities: [
    {
      id: 'polity:ussr',
      names: { 'zh-Hans': '苏联', en: 'Soviet Union' },
      validFrom: null,
      validTo: '1991-12-26',
      sourceIds: ['rg:ussr-dissolution-1991'],
    },
    {
      id: 'polity:ru-russian-federation',
      names: { 'zh-Hans': '俄罗斯联邦', en: 'Russian Federation' },
      validFrom: '1991-12-26',
      validTo: null,
      sourceIds: ['rg:ussr-dissolution-1991', 'kremlin:constitution'],
    },
  ],
  adminUnits: [
    {
      id: 'admin:ru-moscow',
      names: { 'zh-Hans': '莫斯科市', en: 'City of Moscow' },
      level: 'municipality',
      validFrom: null,
      validTo: null,
      sourceIds: ['kremlin:constitution'],
    },
    {
      id: 'admin:ru-saint-petersburg',
      names: {
        'zh-Hans': '圣彼得堡市（1991 年前为列宁格勒市）',
        en: 'City of Saint Petersburg (Leningrad before 1991)',
      },
      level: 'municipality',
      validFrom: null,
      validTo: null,
      sourceIds: ['kremlin:constitution', 'pnp:leningrad-rename-1991'],
    },
    {
      id: 'admin:ru-unspecified',
      names: { 'zh-Hans': '俄罗斯其他地区', en: 'Other areas of Russia' },
      level: 'unspecified',
      validFrom: null,
      validTo: null,
      sourceIds: ['adr:0005'],
    },
  ],
  places: [
    {
      id: 'place:ru-moscow',
      kind: 'city',
      settlement: 'urban',
      names: [{ validFrom: null, validTo: null, names: { 'zh-Hans': '莫斯科', en: 'Moscow' } }],
      sourceIds: ['kremlin:constitution'],
    },
    {
      id: 'place:ru-saint-petersburg',
      kind: 'city',
      settlement: 'urban',
      names: [
        {
          validFrom: null,
          validTo: '1991-09-06',
          names: { 'zh-Hans': '列宁格勒', en: 'Leningrad' },
        },
        {
          validFrom: '1991-09-06',
          validTo: null,
          names: { 'zh-Hans': '圣彼得堡', en: 'Saint Petersburg' },
        },
      ],
      sourceIds: ['pnp:leningrad-rename-1991'],
    },
    {
      id: 'place:ru-other-urban',
      kind: 'other-urban',
      settlement: 'urban',
      names: [
        {
          validFrom: null,
          validTo: null,
          names: { 'zh-Hans': '俄罗斯其他城镇地区', en: 'Other urban areas of Russia' },
        },
      ],
      sourceIds: ['adr:0005'],
    },
    {
      id: 'place:ru-other-rural',
      kind: 'other-rural',
      settlement: 'rural',
      names: [
        {
          validFrom: null,
          validTo: null,
          names: { 'zh-Hans': '俄罗斯其他农村地区', en: 'Other rural areas of Russia' },
        },
      ],
      sourceIds: ['adr:0005'],
    },
  ],
  placeAssignments: [
    {
      placeId: 'place:ru-moscow',
      adminUnitId: 'admin:ru-moscow',
      politicalEntityId: 'polity:ussr',
      validFrom: null,
      validTo: '1991-12-26',
      sourceIds: ['rg:ussr-dissolution-1991'],
    },
    {
      placeId: 'place:ru-moscow',
      adminUnitId: 'admin:ru-moscow',
      politicalEntityId: 'polity:ru-russian-federation',
      validFrom: '1991-12-26',
      validTo: null,
      sourceIds: ['rg:ussr-dissolution-1991'],
    },
    {
      placeId: 'place:ru-saint-petersburg',
      adminUnitId: 'admin:ru-saint-petersburg',
      politicalEntityId: 'polity:ussr',
      validFrom: null,
      validTo: '1991-12-26',
      sourceIds: ['rg:ussr-dissolution-1991'],
    },
    {
      placeId: 'place:ru-saint-petersburg',
      adminUnitId: 'admin:ru-saint-petersburg',
      politicalEntityId: 'polity:ru-russian-federation',
      validFrom: '1991-12-26',
      validTo: null,
      sourceIds: ['rg:ussr-dissolution-1991'],
    },
    {
      placeId: 'place:ru-other-urban',
      adminUnitId: 'admin:ru-unspecified',
      politicalEntityId: 'polity:ussr',
      validFrom: null,
      validTo: '1991-12-26',
      sourceIds: ['adr:0005'],
    },
    {
      placeId: 'place:ru-other-urban',
      adminUnitId: 'admin:ru-unspecified',
      politicalEntityId: 'polity:ru-russian-federation',
      validFrom: '1991-12-26',
      validTo: null,
      sourceIds: ['adr:0005'],
    },
    {
      placeId: 'place:ru-other-rural',
      adminUnitId: 'admin:ru-unspecified',
      politicalEntityId: 'polity:ussr',
      validFrom: null,
      validTo: '1991-12-26',
      sourceIds: ['adr:0005'],
    },
    {
      placeId: 'place:ru-other-rural',
      adminUnitId: 'admin:ru-unspecified',
      politicalEntityId: 'polity:ru-russian-federation',
      validFrom: '1991-12-26',
      validTo: null,
      sourceIds: ['adr:0005'],
    },
  ],
  currency: {
    code: 'RUB',
    initialVersion: 1,
    versionNames: {
      '1': { 'zh-Hans': '苏联卢布（1961 年以前）', en: 'Soviet ruble (before 1961)' },
      '2': { 'zh-Hans': '卢布（1961—1997）', en: 'Ruble (1961–1997)' },
      '3': { 'zh-Hans': '俄罗斯卢布', en: 'Russian ruble' },
    },
  },
  anchors: [
    {
      id: 'anchor:ru-redenomination-1961',
      at: '1961-01-01',
      regionIds: ['RU'],
      evidence: {
        grade: 'A',
        sourceIds: ['prlib:1961-reform'],
        modelVersion: 'ru-pack-0.1.0',
        geographyId: 'country:RU',
        yearRange: [1961, 1961],
      },
      kind: 'redenomination',
      currencyCode: 'RUB',
      fromVersion: 1,
      toVersion: 2,
      divisor: 10,
    },
    {
      id: 'anchor:ru-polity-change-1991',
      at: '1991-12-26',
      regionIds: ['RU'],
      evidence: RU_EVIDENCE(1991),
      kind: 'polity-change',
      fromEntityId: 'polity:ussr',
      toEntityId: 'polity:ru-russian-federation',
    },
    {
      id: 'anchor:ru-redenomination-1998',
      at: '1998-01-01',
      regionIds: ['RU'],
      evidence: {
        grade: 'A',
        sourceIds: ['ru-gov:1998-denomination'],
        modelVersion: 'ru-pack-0.1.0',
        geographyId: 'country:RU',
        yearRange: [1998, 1998],
      },
      kind: 'redenomination',
      currencyCode: 'RUB',
      fromVersion: 2,
      toVersion: 3,
      divisor: 1000,
    },
  ],
  breakpoints: [],
  series: [],
};
