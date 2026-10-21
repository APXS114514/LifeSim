import { StatSeriesSchema } from '@lifesim/content-schema';
import births from '../../data/CN/wpp2024-births.json' with { type: 'json' };
import educationCompletion from '../../data/CN/wdi-education-completion.json' with { type: 'json' };
import educationEnrollment from '../../data/CN/wdi-education-enrollment.json' with { type: 'json' };
import employmentAgriculture from '../../data/CN/wdi-employment-agriculture.json' with { type: 'json' };
import laborParticipation from '../../data/CN/wdi-labor-participation.json' with { type: 'json' };
import cpi from '../../data/CN/wdi-cpi.json' with { type: 'json' };
import healthExpenditure from '../../data/CN/wdi-health-expenditure.json' with { type: 'json' };
import healthOutOfPocket from '../../data/CN/wdi-health-out-of-pocket.json' with { type: 'json' };
import qx from '../../data/CN/wpp2024-qx.json' with { type: 'json' };
import qxFemale from '../../data/CN/wpp2024-qx-female.json' with { type: 'json' };
import qxMale from '../../data/CN/wpp2024-qx-male.json' with { type: 'json' };
import srb from '../../data/CN/wpp2024-srb.json' with { type: 'json' };
import urbanShare from '../../data/CN/wdi-urban-share.json' with { type: 'json' };
import type { CountryPack } from '../schema.ts';
import { CN_METADATA } from './cn.meta.ts';

export const CN_PACK: CountryPack = {
  ...CN_METADATA,
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
