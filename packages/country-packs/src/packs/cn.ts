// 中国大陆（CN）国家包：地理与货币。统计序列在 M2-020 接入。
//
// 重庆：1954-06-19 撤销直辖、并入四川省（中央人民政府委员会第32次会议决定）；
// 1997-03-14 全国人大批准设立重庆直辖市，1997-06-18 正式挂牌。本包以 1997-06-18 作为
// 新行政单位的生效日；批准日记录在此，供维护者复核（M2-017 的待核实项）。
import { StatSeriesSchema } from '@lifesim/content-schema';
import births from '../../data/CN/wpp2024-births.json' with { type: 'json' };
import qx from '../../data/CN/wpp2024-qx.json' with { type: 'json' };
import urbanShare from '../../data/CN/wdi-urban-share.json' with { type: 'json' };
import type { CountryPack } from '../schema.ts';

/** 中国大陆国家包。 */
export const CN_PACK: CountryPack = {
  manifest: {
    packId: 'CN',
    role: 'birth',
    schemaVersion: '0.1.0',
    engineRange: '0.1.x',
    validFrom: '1950-01-01',
    dataVersion: '0.1.0',
    licenseManifestPath: 'README.md',
    modules: {},
  },
  geographyId: 'country:CN',
  names: { 'zh-Hans': '中国大陆', en: 'Mainland China' },
  politicalEntities: [
    {
      id: 'polity:cn-prc',
      names: { 'zh-Hans': '中华人民共和国', en: "People's Republic of China" },
      validFrom: '1949-10-01',
      validTo: null,
      sourceIds: ['cn-npc:founding'],
    },
  ],
  adminUnits: [
    {
      id: 'admin:cn-beijing',
      names: { 'zh-Hans': '北京市', en: 'Beijing Municipality' },
      level: 'municipality',
      validFrom: null,
      validTo: null,
      sourceIds: ['beijing-gov:municipality'],
    },
    {
      id: 'admin:cn-sichuan',
      names: { 'zh-Hans': '四川省', en: 'Sichuan Province' },
      level: 'province',
      validFrom: null,
      validTo: null,
      sourceIds: ['cn-gazetteer:sichuan'],
    },
    {
      id: 'admin:cn-chongqing-1949',
      names: {
        'zh-Hans': '重庆市（中央直辖，1954 年撤销）',
        en: 'Chongqing (directly governed, abolished 1954)',
      },
      level: 'municipality',
      validFrom: null,
      validTo: '1954-06-19',
      sourceIds: ['cn-gazetteer:sichuan'],
    },
    {
      id: 'admin:cn-chongqing',
      names: { 'zh-Hans': '重庆市', en: 'Chongqing Municipality' },
      level: 'municipality',
      validFrom: '1997-06-18',
      validTo: null,
      sourceIds: ['cnr:chongqing-1997'],
    },
    {
      id: 'admin:cn-unspecified',
      names: { 'zh-Hans': '中国大陆其他地区', en: 'Other areas of mainland China' },
      level: 'unspecified',
      validFrom: null,
      validTo: null,
      sourceIds: ['adr:0005'],
    },
  ],
  places: [
    {
      id: 'place:cn-beijing',
      kind: 'city',
      settlement: 'urban',
      names: [{ validFrom: null, validTo: null, names: { 'zh-Hans': '北京', en: 'Beijing' } }],
      sourceIds: ['beijing-gov:municipality'],
    },
    {
      id: 'place:cn-chongqing',
      kind: 'city',
      settlement: 'urban',
      names: [{ validFrom: null, validTo: null, names: { 'zh-Hans': '重庆', en: 'Chongqing' } }],
      sourceIds: ['cnr:chongqing-1997'],
    },
    {
      id: 'place:cn-other-urban',
      kind: 'other-urban',
      settlement: 'urban',
      names: [
        {
          validFrom: null,
          validTo: null,
          names: { 'zh-Hans': '中国大陆其他城镇地区', en: 'Other urban areas of mainland China' },
        },
      ],
      sourceIds: ['adr:0005'],
    },
    {
      id: 'place:cn-other-rural',
      kind: 'other-rural',
      settlement: 'rural',
      names: [
        {
          validFrom: null,
          validTo: null,
          names: { 'zh-Hans': '中国大陆其他农村地区', en: 'Other rural areas of mainland China' },
        },
      ],
      sourceIds: ['adr:0005'],
    },
  ],
  placeAssignments: [
    {
      placeId: 'place:cn-beijing',
      adminUnitId: 'admin:cn-beijing',
      politicalEntityId: 'polity:cn-prc',
      validFrom: null,
      validTo: null,
      sourceIds: ['beijing-gov:municipality'],
    },
    {
      placeId: 'place:cn-chongqing',
      adminUnitId: 'admin:cn-chongqing-1949',
      politicalEntityId: 'polity:cn-prc',
      validFrom: null,
      validTo: '1954-06-19',
      sourceIds: ['cn-gazetteer:sichuan'],
    },
    {
      placeId: 'place:cn-chongqing',
      adminUnitId: 'admin:cn-sichuan',
      politicalEntityId: 'polity:cn-prc',
      validFrom: '1954-06-19',
      validTo: '1997-06-18',
      sourceIds: ['cn-gazetteer:sichuan'],
    },
    {
      placeId: 'place:cn-chongqing',
      adminUnitId: 'admin:cn-chongqing',
      politicalEntityId: 'polity:cn-prc',
      validFrom: '1997-06-18',
      validTo: null,
      sourceIds: ['cnr:chongqing-1997'],
    },
    {
      placeId: 'place:cn-other-urban',
      adminUnitId: 'admin:cn-unspecified',
      politicalEntityId: 'polity:cn-prc',
      validFrom: null,
      validTo: null,
      sourceIds: ['adr:0005'],
    },
    {
      placeId: 'place:cn-other-rural',
      adminUnitId: 'admin:cn-unspecified',
      politicalEntityId: 'polity:cn-prc',
      validFrom: null,
      validTo: null,
      sourceIds: ['adr:0005'],
    },
  ],
  currency: {
    code: 'CNY',
    initialVersion: 1,
    versionNames: {
      '1': { 'zh-Hans': '旧人民币', en: 'Old renminbi' },
      '2': { 'zh-Hans': '人民币', en: 'Renminbi' },
    },
  },
  anchors: [
    {
      id: 'anchor:cn-redenomination-1955',
      at: '1955-03-01',
      regionIds: ['CN'],
      evidence: {
        grade: 'A',
        sourceIds: ['pbc:rmb-history'],
        modelVersion: 'cn-pack-0.1.0',
        geographyId: 'country:CN',
        yearRange: [1955, 1955],
      },
      kind: 'redenomination',
      currencyCode: 'CNY',
      fromVersion: 1,
      toVersion: 2,
      divisor: 10000,
    },
  ],
  breakpoints: [],
  series: [
    StatSeriesSchema.parse(births),
    StatSeriesSchema.parse(qx),
    StatSeriesSchema.parse(urbanShare),
  ],
};
