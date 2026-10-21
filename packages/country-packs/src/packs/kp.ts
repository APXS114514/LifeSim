import { StatSeriesSchema } from '@lifesim/content-schema';
import births from '../../data/KP/wpp2024-births.json' with { type: 'json' };
import educationEnrollment from '../../data/KP/wdi-education-enrollment.json' with { type: 'json' };
import employmentAgriculture from '../../data/KP/wdi-employment-agriculture.json' with { type: 'json' };
import laborParticipation from '../../data/KP/wdi-labor-participation.json' with { type: 'json' };
import qx from '../../data/KP/wpp2024-qx.json' with { type: 'json' };
import qxFemale from '../../data/KP/wpp2024-qx-female.json' with { type: 'json' };
import qxMale from '../../data/KP/wpp2024-qx-male.json' with { type: 'json' };
import srb from '../../data/KP/wpp2024-srb.json' with { type: 'json' };
import urbanShare from '../../data/KP/wdi-urban-share.json' with { type: 'json' };
import type { CountryPack } from '../schema.ts';
import { KP_METADATA } from './kp.meta.ts';

export const KP_PACK: CountryPack = {
  ...KP_METADATA,
  series: [
    StatSeriesSchema.parse(births),
    StatSeriesSchema.parse(qx),
    StatSeriesSchema.parse(urbanShare),
    StatSeriesSchema.parse(educationEnrollment),
    StatSeriesSchema.parse(laborParticipation),
    StatSeriesSchema.parse(employmentAgriculture),
    StatSeriesSchema.parse(qxFemale),
    StatSeriesSchema.parse(qxMale),
    StatSeriesSchema.parse(srb),
  ],
};
