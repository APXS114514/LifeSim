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
import { KR_METADATA } from './kr.meta.ts';

export const KR_PACK: CountryPack = {
  ...KR_METADATA,
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
