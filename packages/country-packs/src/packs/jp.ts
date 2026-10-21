// 日本（JP）国家包：地理与货币。统计序列在 M2-020 接入。
//
// 已知简化（维护者已决定，见 M2-014）：
// - 1952-04-28 之前的盟军占领期不作为政体更替处理，整个覆盖期是同一政治实体。
// - 冲绳在 1972-05-15 之前由美国管理；M2 不单列冲绳，人口池地点按日本处理。
import { StatSeriesSchema } from '@lifesim/content-schema';
import births from '../../data/JP/wpp2024-births.json' with { type: 'json' };
import educationCompletion from '../../data/JP/wdi-education-completion.json' with { type: 'json' };
import educationEnrollment from '../../data/JP/wdi-education-enrollment.json' with { type: 'json' };
import employmentAgriculture from '../../data/JP/wdi-employment-agriculture.json' with { type: 'json' };
import laborParticipation from '../../data/JP/wdi-labor-participation.json' with { type: 'json' };
import cpi from '../../data/JP/wdi-cpi.json' with { type: 'json' };
import healthExpenditure from '../../data/JP/wdi-health-expenditure.json' with { type: 'json' };
import healthOutOfPocket from '../../data/JP/wdi-health-out-of-pocket.json' with { type: 'json' };
import qx from '../../data/JP/wpp2024-qx.json' with { type: 'json' };
import urbanShare from '../../data/JP/wdi-urban-share.json' with { type: 'json' };
import type { CountryPack } from '../schema.ts';

/** 日本国家包。 */
export const JP_PACK: CountryPack = {
  manifest: {
    packId: 'JP',
    role: 'birth',
    schemaVersion: '0.1.0',
    engineRange: '0.1.x',
    validFrom: '1950-01-01',
    dataVersion: '0.1.0',
    licenseManifestPath: 'README.md',
    modules: {},
  },
  geographyId: 'country:JP',
  names: { 'zh-Hans': '日本', en: 'Japan' },
  politicalEntities: [
    {
      id: 'polity:jp-japan',
      names: { 'zh-Hans': '日本', en: 'Japan' },
      validFrom: null,
      validTo: null,
      sourceIds: ['e-gov:local-autonomy-act', 'shugiin:denomination-2008'],
    },
  ],
  adminUnits: [
    {
      id: 'admin:jp-tokyo',
      names: { 'zh-Hans': '东京都', en: 'Tokyo Metropolis' },
      level: 'province',
      validFrom: null,
      validTo: null,
      sourceIds: ['tokyo-metro:assembly-history'],
    },
    {
      id: 'admin:jp-osaka',
      names: { 'zh-Hans': '大阪府', en: 'Osaka Prefecture' },
      level: 'province',
      validFrom: null,
      validTo: null,
      sourceIds: ['osaka-pref:statistical-yearbook'],
    },
    {
      id: 'admin:jp-unspecified',
      names: { 'zh-Hans': '日本其他地区', en: 'Other areas of Japan' },
      level: 'unspecified',
      validFrom: null,
      validTo: null,
      sourceIds: ['adr:0005'],
    },
  ],
  places: [
    {
      id: 'place:jp-tokyo',
      kind: 'city',
      settlement: 'urban',
      names: [
        {
          validFrom: null,
          validTo: null,
          names: { 'zh-Hans': '东京', en: 'Tokyo' },
        },
      ],
      sourceIds: ['tokyo-metro:assembly-history'],
    },
    {
      id: 'place:jp-osaka',
      kind: 'city',
      settlement: 'urban',
      names: [
        {
          validFrom: null,
          validTo: null,
          names: { 'zh-Hans': '大阪', en: 'Osaka' },
        },
      ],
      sourceIds: ['osaka-pref:statistical-yearbook'],
    },
    {
      id: 'place:jp-other-urban',
      kind: 'other-urban',
      settlement: 'urban',
      names: [
        {
          validFrom: null,
          validTo: null,
          names: { 'zh-Hans': '日本其他城镇地区', en: 'Other urban areas of Japan' },
        },
      ],
      sourceIds: ['adr:0005'],
    },
    {
      id: 'place:jp-other-rural',
      kind: 'other-rural',
      settlement: 'rural',
      names: [
        {
          validFrom: null,
          validTo: null,
          names: { 'zh-Hans': '日本其他农村地区', en: 'Other rural areas of Japan' },
        },
      ],
      sourceIds: ['adr:0005'],
    },
  ],
  placeAssignments: [
    {
      placeId: 'place:jp-tokyo',
      adminUnitId: 'admin:jp-tokyo',
      politicalEntityId: 'polity:jp-japan',
      validFrom: null,
      validTo: null,
      sourceIds: ['tokyo-metro:assembly-history'],
    },
    {
      placeId: 'place:jp-osaka',
      adminUnitId: 'admin:jp-osaka',
      politicalEntityId: 'polity:jp-japan',
      validFrom: null,
      validTo: null,
      sourceIds: ['osaka-pref:statistical-yearbook'],
    },
    {
      placeId: 'place:jp-other-urban',
      adminUnitId: 'admin:jp-unspecified',
      politicalEntityId: 'polity:jp-japan',
      validFrom: null,
      validTo: null,
      sourceIds: ['adr:0005'],
    },
    {
      placeId: 'place:jp-other-rural',
      adminUnitId: 'admin:jp-unspecified',
      politicalEntityId: 'polity:jp-japan',
      validFrom: null,
      validTo: null,
      sourceIds: ['adr:0005'],
    },
  ],
  currency: {
    code: 'JPY',
    initialVersion: 1,
    versionNames: { '1': { 'zh-Hans': '日元', en: 'Japanese yen' } },
  },
  anchors: [],
  breakpoints: [],
  series: [
    StatSeriesSchema.parse(births),
    StatSeriesSchema.parse(qx),
    StatSeriesSchema.parse(urbanShare),
    StatSeriesSchema.parse(educationEnrollment),
    StatSeriesSchema.parse(laborParticipation),
    StatSeriesSchema.parse(employmentAgriculture),
    StatSeriesSchema.parse(educationCompletion),
    StatSeriesSchema.parse(cpi),
    StatSeriesSchema.parse(healthOutOfPocket),
    StatSeriesSchema.parse(healthExpenditure),
  ],
};
