// 韩国（KR）国家包：地理与货币。统计序列在 M2-020 接入。
//
// 已知简化：朝鲜战争期间首尔曾两度被占领，M2 不作为政体变化处理（留给 M3 的历史事件）。
import { StatSeriesSchema } from '@lifesim/content-schema';
import births from '../../data/KR/wpp2024-births.json' with { type: 'json' };
import educationCompletion from '../../data/KR/wdi-education-completion.json' with { type: 'json' };
import educationEnrollment from '../../data/KR/wdi-education-enrollment.json' with { type: 'json' };
import employmentAgriculture from '../../data/KR/wdi-employment-agriculture.json' with { type: 'json' };
import laborParticipation from '../../data/KR/wdi-labor-participation.json' with { type: 'json' };
import cpi from '../../data/KR/wdi-cpi.json' with { type: 'json' };
import healthExpenditure from '../../data/KR/wdi-health-expenditure.json' with { type: 'json' };
import healthOutOfPocket from '../../data/KR/wdi-health-out-of-pocket.json' with { type: 'json' };
import qx from '../../data/KR/wpp2024-qx.json' with { type: 'json' };
import qxFemale from '../../data/KR/wpp2024-qx-female.json' with { type: 'json' };
import qxMale from '../../data/KR/wpp2024-qx-male.json' with { type: 'json' };
import srb from '../../data/KR/wpp2024-srb.json' with { type: 'json' };
import urbanShare from '../../data/KR/wdi-urban-share.json' with { type: 'json' };
import type { CountryPack } from '../schema.ts';

const KR_EVIDENCE = (year: number) => ({
  grade: 'A' as const,
  sourceIds: ['bok:currency-1953', 'bok:currency-1962'],
  modelVersion: 'kr-pack-0.1.0',
  geographyId: 'country:KR',
  yearRange: [year, year] as [number, number],
});

/** 韩国国家包。 */
export const KR_PACK: CountryPack = {
  manifest: {
    packId: 'KR',
    role: 'birth',
    schemaVersion: '0.1.0',
    engineRange: '0.1.x',
    validFrom: '1950-01-01',
    dataVersion: '0.1.0',
    licenseManifestPath: 'README.md',
    modules: {},
  },
  geographyId: 'country:KR',
  names: { 'zh-Hans': '韩国', en: 'South Korea' },
  politicalEntities: [
    {
      id: 'polity:kr-rok',
      names: { 'zh-Hans': '大韩民国', en: 'Republic of Korea' },
      validFrom: '1948-08-15',
      validTo: null,
      sourceIds: ['kr-history:rok-1948', 'kr-law:local-autonomy'],
    },
  ],
  adminUnits: [
    {
      id: 'admin:kr-seoul',
      names: { 'zh-Hans': '首尔特别市', en: 'Seoul Special City' },
      level: 'province',
      validFrom: null,
      validTo: null,
      sourceIds: ['kr-law:local-autonomy'],
    },
    {
      id: 'admin:kr-gyeongnam',
      names: { 'zh-Hans': '庆尚南道', en: 'South Gyeongsang Province' },
      level: 'province',
      validFrom: null,
      validTo: null,
      sourceIds: ['kr-law:local-autonomy'],
    },
    {
      id: 'admin:kr-busan',
      names: { 'zh-Hans': '釜山', en: 'Busan' },
      level: 'municipality',
      validFrom: '1963-01-01',
      validTo: null,
      sourceIds: ['kr-archives:busan-1963', 'kr-law:local-autonomy'],
    },
    {
      id: 'admin:kr-unspecified',
      names: { 'zh-Hans': '韩国其他地区', en: 'Other areas of the Republic of Korea' },
      level: 'unspecified',
      validFrom: null,
      validTo: null,
      sourceIds: ['adr:0005'],
    },
  ],
  places: [
    {
      id: 'place:kr-seoul',
      kind: 'city',
      settlement: 'urban',
      names: [{ validFrom: null, validTo: null, names: { 'zh-Hans': '首尔', en: 'Seoul' } }],
      sourceIds: ['kr-law:local-autonomy'],
    },
    {
      id: 'place:kr-busan',
      kind: 'city',
      settlement: 'urban',
      names: [{ validFrom: null, validTo: null, names: { 'zh-Hans': '釜山', en: 'Busan' } }],
      sourceIds: ['kr-archives:busan-1963'],
    },
    {
      id: 'place:kr-other-urban',
      kind: 'other-urban',
      settlement: 'urban',
      names: [
        {
          validFrom: null,
          validTo: null,
          names: {
            'zh-Hans': '韩国其他城镇地区',
            en: 'Other urban areas of the Republic of Korea',
          },
        },
      ],
      sourceIds: ['adr:0005'],
    },
    {
      id: 'place:kr-other-rural',
      kind: 'other-rural',
      settlement: 'rural',
      names: [
        {
          validFrom: null,
          validTo: null,
          names: {
            'zh-Hans': '韩国其他农村地区',
            en: 'Other rural areas of the Republic of Korea',
          },
        },
      ],
      sourceIds: ['adr:0005'],
    },
  ],
  placeAssignments: [
    {
      placeId: 'place:kr-seoul',
      adminUnitId: 'admin:kr-seoul',
      politicalEntityId: 'polity:kr-rok',
      validFrom: null,
      validTo: null,
      sourceIds: ['kr-law:local-autonomy'],
    },
    {
      placeId: 'place:kr-busan',
      adminUnitId: 'admin:kr-gyeongnam',
      politicalEntityId: 'polity:kr-rok',
      validFrom: null,
      validTo: '1963-01-01',
      sourceIds: ['kr-archives:busan-1963'],
    },
    {
      placeId: 'place:kr-busan',
      adminUnitId: 'admin:kr-busan',
      politicalEntityId: 'polity:kr-rok',
      validFrom: '1963-01-01',
      validTo: null,
      sourceIds: ['kr-archives:busan-1963'],
    },
    {
      placeId: 'place:kr-other-urban',
      adminUnitId: 'admin:kr-unspecified',
      politicalEntityId: 'polity:kr-rok',
      validFrom: null,
      validTo: null,
      sourceIds: ['adr:0005'],
    },
    {
      placeId: 'place:kr-other-rural',
      adminUnitId: 'admin:kr-unspecified',
      politicalEntityId: 'polity:kr-rok',
      validFrom: null,
      validTo: null,
      sourceIds: ['adr:0005'],
    },
  ],
  currency: {
    code: 'KRW',
    initialVersion: 1,
    versionNames: {
      '1': { 'zh-Hans': '圆（1953 年以前）', en: 'Won (before 1953)' },
      '2': { 'zh-Hans': '圜', en: 'Hwan' },
      '3': { 'zh-Hans': '韩元', en: 'Won' },
    },
  },
  anchors: [
    {
      id: 'anchor:kr-redenomination-1953',
      at: '1953-02-15',
      regionIds: ['KR'],
      evidence: KR_EVIDENCE(1953),
      kind: 'redenomination',
      currencyCode: 'KRW',
      fromVersion: 1,
      toVersion: 2,
      divisor: 100,
    },
    {
      id: 'anchor:kr-redenomination-1962',
      at: '1962-06-10',
      regionIds: ['KR'],
      evidence: KR_EVIDENCE(1962),
      kind: 'redenomination',
      currencyCode: 'KRW',
      fromVersion: 2,
      toVersion: 3,
      divisor: 10,
    },
    {
      id: 'anchor:kr-recession-1998',
      at: '1998-01-01',
      regionIds: ['KR'],
      evidence: {
        grade: 'B',
        sourceIds: ['worldbank-wdi:NY.GDP.MKTP.KD.ZG'],
        modelVersion: 'kr-pack-0.1.0',
        geographyId: 'country:KR',
        yearRange: [1998, 1998],
      },
      kind: 'economy-phase',
      phase: 'recession',
    },
    {
      id: 'anchor:kr-recovery-1999',
      at: '1999-01-01',
      regionIds: ['KR'],
      evidence: {
        grade: 'B',
        sourceIds: ['worldbank-wdi:NY.GDP.MKTP.KD.ZG'],
        modelVersion: 'kr-pack-0.1.0',
        geographyId: 'country:KR',
        yearRange: [1999, 1999],
      },
      kind: 'economy-phase',
      phase: 'normal',
    },
  ],
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
    StatSeriesSchema.parse(qxFemale),
    StatSeriesSchema.parse(qxMale),
    StatSeriesSchema.parse(srb),
  ],
};
