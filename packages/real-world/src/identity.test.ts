import { BIRTH_REGION_IDS, CharacterStateSchema } from '@lifesim/content-schema';
import { canonicalJson, fingerprint } from '@lifesim/simulation-core';
import { createLifeSimulation } from '@lifesim/systems';
import { describe, expect, it, vi } from 'vitest';
import { realRegionNames } from './names.ts';
import {
  characterName,
  createRealLifeSimulation,
  createRealRegion,
  realDataRegistry,
} from './index.ts';

describe('M3-043 identity', () => {
  it('preserves the exact pre-identity projection of 300 fixed births', () => {
    const projections = Array.from({ length: 300 }, (_, i) => {
      const { simulation, birth } = createRealLifeSimulation({
        seed: `identity-projection-${i}`,
        region: BIRTH_REGION_IDS[i % 5]!,
        year: 1950 + (i % 77),
      });
      return {
        birth,
        actors: simulation.state.actors.map((a) => ({
          id: a.id,
          birthDate: a.birthDate,
          birthPlaceId: a.birthPlaceId,
          origin: a.origin,
          traits: a.traits,
          education: a.education,
        })),
      };
    });
    // Captured before identity implementation; deliberately excludes new fields.
    expect(fingerprint(canonicalJson(projections))).toBe('5c21e346acb9e12567040517fa1f5284');
  });

  it('initializes every actor, keeps explicit sex from changing other birth attributes and resolves family names', () => {
    for (const region of BIRTH_REGION_IDS) {
      for (const year of [1950, 1978, 2000, 2026]) {
        const request = { seed: `identity-${region}-${year}`, region, year };
        const a = createRealLifeSimulation({ ...request, sex: 'female' });
        const b = createRealLifeSimulation({ ...request, sex: 'male' });
        expect(a.birth).toEqual(b.birth);
        for (const simulation of [a.simulation, b.simulation])
          simulation.advanceTo({
            targetDate: a.birth.birthDate,
            stopAtMajorDecision: false,
            maxWorkUnits: 1000,
          });
        const project = (session: typeof a) =>
          session.simulation.state.actors.map(({ sex: _sex, name: _name, ...actor }) => actor);
        expect(project(a)).toEqual(project(b));
        for (const session of [a, b]) {
          const actors = session.simulation.state.actors;
          for (const actor of actors) {
            expect(CharacterStateSchema.safeParse(actor).success).toBe(true);
            expect(actor.wellbeing).toEqual({ stress: 0.3 });
            expect(actor.social).toEqual({ ties: 0.5 });
            expect(actor.skills).toEqual([]);
          }
          const protagonist = actors.find((actor) => actor.tier === 'protagonist')!;
          const mother = actors.find((actor) => actor.id.endsWith(':mother'))!;
          const father = actors.find((actor) => actor.id.endsWith(':father'))!;
          expect(mother.sex).toBe('female');
          expect(father.sex).toBe('male');
          expect(protagonist.name.family).toEqual(father.name.family);
          const refs = canonicalJson(protagonist.name);
          if (region === 'KP') {
            expect(protagonist.name.given).toBeNull();
            expect(characterName(protagonist, 'en')).toBeNull();
          } else {
            expect(characterName(protagonist, 'en')).toMatch(/[A-Za-z]/);
            expect(characterName(protagonist, 'zh-Hans')).toMatch(/[\u4e00-\u9fff]/);
          }
          expect(canonicalJson(protagonist.name)).toBe(refs);
          if (region === 'JP' || region === 'RU')
            expect(mother.name.family).toEqual(father.name.family);
        }
      }
    }
  });

  it('keeps maternal surnames in zh/ko and shares the family surname in ja/ru', () => {
    for (const scheme of ['zh', 'ko', 'ja', 'ru'] as const) {
      // Fictional name references isolate inheritance from country name frequencies.
      const region = {
        ...createRealRegion('CN', '1950-01-01'),
        names: {
          scheme,
          select: (part: 'family' | 'given', request: { sex: 'female' | 'male' }) => ({
            table: `fixture-${part}`,
            id: request.sex,
          }),
          patronymic: () => null,
        },
      };
      const simulation = createLifeSimulation({
        seed: 'fixture-inheritance',
        region,
        birthDate: '1950-01-01',
      });
      simulation.advanceTo({
        targetDate: '1950-01-01',
        stopAtMajorDecision: false,
        maxWorkUnits: 1000,
      });
      const actors = simulation.state.actors;
      expect(actors.find((actor) => actor.tier === 'protagonist')!.name.family?.id).toBe('male');
      expect(actors.find((actor) => actor.id.endsWith(':father'))!.name.family?.id).toBe('male');
      expect(actors.find((actor) => actor.id.endsWith(':mother'))!.name.family?.id).toBe(
        scheme === 'zh' || scheme === 'ko' ? 'female' : 'male',
      );
    }
  });

  it('derives Russian patronymics from known paternal names and resolves gendered forms without mutating references', () => {
    const names = realRegionNames('RU');
    expect(names.patronymic({ table: 'ru-given', id: 'ivan-m-c1' })).toEqual({
      table: 'ru-patronymic',
      id: 'ivanovich',
    });
    expect(names.patronymic({ table: 'ru-given', id: 'unknown-m-c1' })).toBeNull();
    const base = createRealLifeSimulation({
      seed: 'fixture-russian-render',
      region: 'RU',
      year: 1950,
    }).simulation.state.actors.find((actor) => actor.id.endsWith(':father'))!;
    for (const [sex, given, en, zh] of [
      ['female', 'anna-f-c1', 'Anna Ivanovna Ivanova', '安娜·伊万诺夫娜·伊万诺娃'],
      ['male', 'ivan-m-c1', 'Ivan Ivanovich Ivanov', '伊万·伊万诺维奇·伊万诺夫'],
    ] as const) {
      const actor = {
        ...base,
        sex,
        name: {
          scheme: 'ru' as const,
          family: { table: 'ru-family', id: 'ivanov' },
          given: { table: 'ru-given', id: given },
          patronymic: { table: 'ru-patronymic', id: 'ivanovich' },
        },
      };
      const before = canonicalJson(actor.name);
      expect(characterName(actor, 'en')).toBe(en);
      expect(characterName(actor, 'zh-Hans')).toBe(zh);
      expect(canonicalJson(actor.name)).toBe(before);
    }
  });

  it('uses sex-specific WPP qx exactly and sends actor.sex from annual health checks', () => {
    for (const packId of BIRTH_REGION_IDS) {
      const region = createRealRegion(packId, '1978-01-01');
      for (const sex of ['female', 'male'] as const) {
        const qx = realDataRegistry().lookup({
          indicator: 'life-table-qx',
          geographyId: `country:${packId}`,
          year: 1978,
          age: 0,
          sex,
        });
        expect(qx.status).toBe('found');
        if (qx.status !== 'found') throw new Error('Fixture data missing');
        expect(region.mortalityQ(1978, 0, sex)).toBe(qx.value);
        const mortality = vi.fn(() => 0);
        const simulation = createLifeSimulation({
          seed: 'sex-health',
          region: { ...region, mortalityQ: mortality },
          birthDate: '1978-01-01',
          sex,
        });
        simulation.advanceTo({
          targetDate: '1978-01-01',
          stopAtMajorDecision: false,
          maxWorkUnits: 1000,
        });
        expect(mortality).toHaveBeenCalledWith(1978, 0, sex);
      }
    }
  });

  for (const packId of BIRTH_REGION_IDS) {
    it(`samples ${packId} births within 1.5 percentage points of WPP across 20,000 seeds`, () => {
      const region = createRealRegion(packId, '2000-01-01');
      let females = 0;
      for (let i = 0; i < 20_000; i += 1) {
        const simulation = createLifeSimulation({
          seed: `sex-sample-${i}`,
          region,
          birthDate: '2000-01-01',
        });
        if (simulation.state.actors[0]?.sex === 'female') females += 1;
      }
      expect(
        Math.abs(females / 20_000 - 100 / (100 + region.sexRatioAtBirth(2000))),
      ).toBeLessThanOrEqual(0.015);
    }, 60_000);
  }
});
