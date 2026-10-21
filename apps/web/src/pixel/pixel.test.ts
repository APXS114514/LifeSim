import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { composeAvatar, lifeStageFor, type LifeStage } from './avatar.ts';
import { SCENE_HEIGHT, SCENE_WIDTH, apartmentBlock, composeScene, sceneFor } from './scene.ts';
import { PixelCanvas, missingColors, pixelRuns, sprite, variantHash } from './sprite.ts';

const STAGES: readonly LifeStage[] = ['infant', 'child', 'teen', 'adult', 'elder'];

describe('pixel primitives (M4-022)', () => {
  it('rejects ragged sprites and empty sprites', () => {
    expect(() => sprite(['ab', 'abc'])).toThrow(RangeError);
    expect(() => sprite([])).toThrow(RangeError);
    expect(sprite(['ab', 'cd'])).toMatchObject({ width: 2, height: 2 });
  });

  it('merges same-colour runs and skips transparent pixels', () => {
    expect(pixelRuns(['aab.', '..cc'])).toEqual([
      { x: 0, y: 0, width: 2, key: 'a' },
      { x: 2, y: 0, width: 1, key: 'b' },
      { x: 2, y: 1, width: 2, key: 'c' },
    ]);
  });

  it('reports palette gaps instead of rendering unknown colours', () => {
    expect(missingColors(['ab.', 'cb.'], { a: '#000', b: '#111' })).toEqual(['c']);
  });

  it('stamps sprites without letting transparent pixels overwrite the canvas', () => {
    const canvas = new PixelCanvas(4, 2, 'k').stamp(sprite(['.x', 'x.']), 1, 0);
    expect(canvas.rows()).toEqual(['kkxk', 'kxkk']);
  });

  it('round-trips run lengths back to the same pixels', () => {
    fc.assert(
      fc.property(
        fc.array(fc.stringMatching(/^[a-c.]{6}$/), { minLength: 1, maxLength: 6 }),
        (rows) => {
          const rebuilt = rows.map((row) => [...row].map(() => '.'));
          for (const run of pixelRuns(rows)) {
            for (let x = run.x; x < run.x + run.width; x += 1) {
              const line = rebuilt[run.y];
              if (line) line[x] = run.key;
            }
          }
          expect(rebuilt.map((line) => line.join(''))).toEqual(rows);
        },
      ),
      { numRuns: 200 },
    );
  });
});

describe('pixel avatars (M4-022)', () => {
  it('maps ages to life stages', () => {
    expect([0, 2, 3, 11, 12, 17, 18, 59, 60, 95].map(lifeStageFor)).toEqual([
      'infant',
      'infant',
      'child',
      'child',
      'teen',
      'teen',
      'adult',
      'adult',
      'elder',
      'elder',
    ]);
  });

  it('draws every life stage as a complete 24×24 portrait', () => {
    for (const stage of STAGES) {
      for (const year of [1950, 1975, 1995, 2020]) {
        const image = composeAvatar({ stage, year, variant: variantHash(`${stage}|${year}`) });
        expect(image.rows).toHaveLength(24);
        expect(image.rows.every((row) => row.length === 24)).toBe(true);
        expect(missingColors(image.rows, image.palette)).toEqual([]);
      }
    }
  });

  it('is deterministic for the same input', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...STAGES),
        fc.integer({ min: 1950, max: 2120 }),
        fc.nat(),
        (stage, year, variant) => {
          expect(composeAvatar({ stage, year, variant })).toEqual(
            composeAvatar({ stage, year, variant }),
          );
        },
      ),
      { numRuns: 100 },
    );
  });
});

describe('pixel scenes (M4-022)', () => {
  it('picks the scene from the current settlement', () => {
    expect(sceneFor({ settlement: 'urban', year: 1990 })).toBe('urban-blocks');
    expect(sceneFor({ settlement: 'rural', year: 1990 })).toBe('rural-village');
  });

  it('composes full-size scenes with a complete palette and is deterministic', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('rural-village', 'urban-blocks' as const),
        fc.nat(),
        (id, variant) => {
          const image = composeScene(id, variant);
          expect(image.rows).toHaveLength(SCENE_HEIGHT);
          expect(image.rows.every((row) => row.length === SCENE_WIDTH)).toBe(true);
          expect(missingColors(image.rows, image.palette)).toEqual([]);
          expect(composeScene(id, variant)).toEqual(image);
        },
      ),
      { numRuns: 60 },
    );
  });

  it('builds apartment blocks that fit inside the scene', () => {
    const block = apartmentBlock(30, 4, 7);
    expect(block.width).toBe(30);
    expect(block.height).toBeLessThan(30);
  });
});
