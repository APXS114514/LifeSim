import { StatSeriesSchema } from '@lifesim/content-schema';
import births from '../../data/RU/wpp2024-births.json' with { type: 'json' };
import educationCompletion from '../../data/RU/wdi-education-completion.json' with { type: 'json' };
import educationEnrollment from '../../data/RU/wdi-education-enrollment.json' with { type: 'json' };
import employmentAgriculture from '../../data/RU/wdi-employment-agriculture.json' with { type: 'json' };
import laborParticipation from '../../data/RU/wdi-labor-participation.json' with { type: 'json' };
import cpi from '../../data/RU/wdi-cpi.json' with { type: 'json' };
import healthExpenditure from '../../data/RU/wdi-health-expenditure.json' with { type: 'json' };
import healthOutOfPocket from '../../data/RU/wdi-health-out-of-pocket.json' with { type: 'json' };
import qx from '../../data/RU/wpp2024-qx.json' with { type: 'json' };
import qxFemale from '../../data/RU/wpp2024-qx-female.json' with { type: 'json' };
import qxMale from '../../data/RU/wpp2024-qx-male.json' with { type: 'json' };
import srb from '../../data/RU/wpp2024-srb.json' with { type: 'json' };
import urbanShare from '../../data/RU/wdi-urban-share.json' with { type: 'json' };
import type { CountryPack } from '../schema.ts';
import { RU_METADATA } from './ru.meta.ts';

export const RU_PACK: CountryPack = {
  ...RU_METADATA,
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
