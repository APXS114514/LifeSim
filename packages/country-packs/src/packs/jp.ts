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
import qxFemale from '../../data/JP/wpp2024-qx-female.json' with { type: 'json' };
import qxMale from '../../data/JP/wpp2024-qx-male.json' with { type: 'json' };
import srb from '../../data/JP/wpp2024-srb.json' with { type: 'json' };
import urbanShare from '../../data/JP/wdi-urban-share.json' with { type: 'json' };
import type { CountryPack } from '../schema.ts';
import { JP_METADATA } from './jp.meta.ts';

export const JP_PACK: CountryPack = {
  ...JP_METADATA,
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
