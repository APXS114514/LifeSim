import { createPackRegistry, PACKS } from '@lifesim/country-packs';
import { describe, expect, it } from 'vitest';

describe('partial country registry compatibility', () => {
  it.each([
    ['JP', 1978],
    ['CN', 1960],
    ['RU', 1980],
  ] as const)(
    'keeps %s lookup values and provenance identical with only that pack loaded',
    (region, year) => {
      const full = createPackRegistry();
      const partial = createPackRegistry({ [region]: PACKS[region] });
      for (const offset of [0, 1, 20, 50]) {
        for (const indicator of [
          'births',
          'urban-share',
          'education-enrollment-secondary',
          'cpi-index',
        ] as const) {
          const query = { geographyId: PACKS[region].geographyId, indicator, year: year + offset };
          expect(partial.lookup(query, { allowScenario: true })).toEqual(
            full.lookup(query, { allowScenario: true }),
          );
        }
        for (const sex of ['both', 'female', 'male'] as const) {
          for (const age of [0, 20, 50, 90]) {
            const query = {
              geographyId: PACKS[region].geographyId,
              indicator: 'life-table-qx' as const,
              year: year + offset,
              sex,
              age,
            };
            expect(partial.lookup(query, { allowScenario: true })).toEqual(
              full.lookup(query, { allowScenario: true }),
            );
          }
        }
      }
    },
  );
});
