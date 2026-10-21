import { describe, expect, it } from 'vitest';
import { factCategory } from '../components/fact-category.ts';
import { archiveIndexLine, archiveNumber } from './archive.ts';

describe('archive numbers (M4-022)', () => {
  const source = { seed: 'probe-0', packId: 'JP', birthDate: '1978-08-25' };

  it('formats region, birth year and a 7-character code', () => {
    expect(archiveNumber(source)).toMatch(/^JP-1978-[0-9A-F]{7}$/);
    expect(archiveIndexLine(source)).toMatch(/^LIFESIM · JP · 19780825 · [0-9A-F]{7}$/);
  });

  it('is stable for the same birth and differs for another seed', () => {
    expect(archiveNumber(source)).toBe(archiveNumber({ ...source }));
    expect(archiveNumber({ ...source, seed: 'probe-1' })).not.toBe(archiveNumber(source));
  });
});

describe('fact categories after M3-011', () => {
  const fact = (type: string) => ({ type }) as unknown as Parameters<typeof factCategory>[0];

  it('keeps life.* for the protagonist and files every npc.* fact under family', () => {
    expect(factCategory(fact('life.death'))).toBe('life');
    expect(factCategory(fact('npc.death'))).toBe('family');
    expect(factCategory(fact('npc.hired'))).toBe('family');
    expect(factCategory(fact('npc.estate-redenominated'))).toBe('family');
  });
});
