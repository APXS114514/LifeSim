// 朝鲜（KP）国家包：地理与货币。统计序列在 M2-020 接入。
//
// 资料局限（GDD §16）：朝鲜的货币改革细节主要来自韩国官方教育机构与国际媒体的整理，
// 非朝鲜官方来源；2009 年改革的兑换上限、价格调整等细节在 M2 不建模。
import type { CountryPack } from '../schema.ts';
import { KP_EDUCATION } from './kp.education.ts';

const KP_EVIDENCE_1959 = {
  grade: 'B' as const,
  sourceIds: ['kr-history:nk-currency-1959', 'uniedu:nk-currency-reform'],
  modelVersion: 'kp-pack-0.1.0',
  geographyId: 'country:KP',
  yearRange: [1959, 1959] as [number, number],
};

const KP_EVIDENCE_2009 = {
  grade: 'B' as const,
  sourceIds: ['uniedu:nk-currency-reform'],
  modelVersion: 'kp-pack-0.1.0',
  geographyId: 'country:KP',
  yearRange: [2009, 2009] as [number, number],
};

/** 朝鲜国家包。 */
export const KP_METADATA: Omit<CountryPack, 'series'> = {
  manifest: {
    packId: 'KP',
    role: 'birth',
    schemaVersion: '0.1.0',
    engineRange: '0.1.x',
    validFrom: '1950-01-01',
    dataVersion: '0.2.0',
    licenseManifestPath: 'README.md',
    modules: {},
  },
  geographyId: 'country:KP',
  names: { 'zh-Hans': '朝鲜', en: 'North Korea' },
  politicalEntities: [
    {
      id: 'polity:kp-dprk',
      names: { 'zh-Hans': '朝鲜民主主义人民共和国', en: "Democratic People's Republic of Korea" },
      validFrom: '1948-09-09',
      validTo: null,
      sourceIds: ['kr-history:dprk-1948'],
    },
  ],
  adminUnits: [
    {
      id: 'admin:kp-pyongyang',
      names: { 'zh-Hans': '平壤', en: 'Pyongyang' },
      level: 'municipality',
      validFrom: null,
      validTo: null,
      sourceIds: ['kr-history:dprk-1948'],
    },
    {
      id: 'admin:kp-unspecified',
      names: { 'zh-Hans': '朝鲜其他地区', en: 'Other areas of the DPRK' },
      level: 'unspecified',
      validFrom: null,
      validTo: null,
      sourceIds: ['adr:0005'],
    },
  ],
  places: [
    {
      id: 'place:kp-pyongyang',
      kind: 'city',
      settlement: 'urban',
      names: [{ validFrom: null, validTo: null, names: { 'zh-Hans': '平壤', en: 'Pyongyang' } }],
      sourceIds: ['kr-history:dprk-1948'],
    },
    {
      id: 'place:kp-other-urban',
      kind: 'other-urban',
      settlement: 'urban',
      names: [
        {
          validFrom: null,
          validTo: null,
          names: { 'zh-Hans': '朝鲜其他城镇地区', en: 'Other urban areas of the DPRK' },
        },
      ],
      sourceIds: ['adr:0005'],
    },
    {
      id: 'place:kp-other-rural',
      kind: 'other-rural',
      settlement: 'rural',
      names: [
        {
          validFrom: null,
          validTo: null,
          names: { 'zh-Hans': '朝鲜其他农村地区', en: 'Other rural areas of the DPRK' },
        },
      ],
      sourceIds: ['adr:0005'],
    },
  ],
  placeAssignments: [
    {
      placeId: 'place:kp-pyongyang',
      adminUnitId: 'admin:kp-pyongyang',
      politicalEntityId: 'polity:kp-dprk',
      validFrom: null,
      validTo: null,
      sourceIds: ['kr-history:dprk-1948'],
    },
    {
      placeId: 'place:kp-other-urban',
      adminUnitId: 'admin:kp-unspecified',
      politicalEntityId: 'polity:kp-dprk',
      validFrom: null,
      validTo: null,
      sourceIds: ['adr:0005'],
    },
    {
      placeId: 'place:kp-other-rural',
      adminUnitId: 'admin:kp-unspecified',
      politicalEntityId: 'polity:kp-dprk',
      validFrom: null,
      validTo: null,
      sourceIds: ['adr:0005'],
    },
  ],
  currency: {
    code: 'KPW',
    initialVersion: 1,
    versionNames: {
      '1': { 'zh-Hans': '朝鲜圆（1959 年以前）', en: 'North Korean won (before 1959)' },
      '2': { 'zh-Hans': '朝鲜圆（1959—2009）', en: 'North Korean won (1959–2009)' },
      '3': { 'zh-Hans': '朝鲜圆', en: 'North Korean won' },
    },
  },
  education: KP_EDUCATION,
  anchors: [
    {
      id: 'anchor:kp-redenomination-1959',
      at: '1959-02-13',
      regionIds: ['KP'],
      evidence: KP_EVIDENCE_1959,
      kind: 'redenomination',
      currencyCode: 'KPW',
      fromVersion: 1,
      toVersion: 2,
      divisor: 100,
    },
    {
      id: 'anchor:kp-redenomination-2009',
      at: '2009-11-30',
      regionIds: ['KP'],
      evidence: KP_EVIDENCE_2009,
      kind: 'redenomination',
      currencyCode: 'KPW',
      fromVersion: 2,
      toVersion: 3,
      divisor: 100,
    },
  ],
  breakpoints: [],
};
