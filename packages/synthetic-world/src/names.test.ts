import { deriveStream } from '@lifesim/simulation-core';
import { describe, expect, it } from 'vitest';
import {
  SYNTHETIC_FAMILY_SYLLABLES,
  SYNTHETIC_GIVEN_SYLLABLES,
  SYNTHETIC_NAME_GRADE,
  SYNTHETIC_NAME_SYLLABLES,
  syntheticFamilyName,
  syntheticGivenName,
  syntheticPersonName,
} from './names.ts';

const streams = (count: number) =>
  Array.from({ length: count }, (_, index) => deriveStream(`synthetic-${index}`, 'identity.name'));

/** 把名字切成固定数量的音节，并核对每个音节都来自声明过的音节表。 */
function syllableParts(
  name: string,
  parts: { onset: readonly string[]; nucleus: readonly string[]; coda: readonly string[] },
): number {
  let rest = name.toLowerCase();
  let count = 0;
  while (rest.length > 0) {
    const onset = parts.onset.find((value) => rest.startsWith(value));
    expect(onset).toBeDefined();
    if (onset === undefined) return count;
    rest = rest.slice(onset.length);
    const nucleus = parts.nucleus.find((value) => rest.startsWith(value));
    expect(nucleus).toBeDefined();
    if (nucleus === undefined) return count;
    rest = rest.slice(nucleus.length);
    const coda = parts.coda.filter((value) => value !== '').find((value) => rest.startsWith(value));
    if (coda !== undefined) rest = rest.slice(coda.length);
    count += 1;
  }
  return count;
}

describe('synthetic name syllables', () => {
  it('is marked as a D grade design assumption', () => {
    expect(SYNTHETIC_NAME_GRADE).toBe('D');
  });

  it('builds every family name out of the declared syllables', () => {
    for (const stream of streams(60)) {
      const name = syntheticFamilyName(stream);
      expect(syllableParts(name, SYNTHETIC_FAMILY_SYLLABLES)).toBe(SYNTHETIC_NAME_SYLLABLES);
      expect(name).toMatch(/^[A-Z][a-z]+$/);
    }
  });

  it('builds given names from the sex-specific syllable sets', () => {
    for (const sex of ['female', 'male'] as const) {
      for (const stream of streams(60)) {
        const name = syntheticGivenName(sex, stream);
        expect(syllableParts(name, SYNTHETIC_GIVEN_SYLLABLES[sex])).toBe(SYNTHETIC_NAME_SYLLABLES);
      }
    }
  });

  it('uses a fictional phonotactics pool in Latin letters only', () => {
    const joined = [
      ...SYNTHETIC_FAMILY_SYLLABLES.onset,
      ...SYNTHETIC_FAMILY_SYLLABLES.nucleus,
      ...SYNTHETIC_FAMILY_SYLLABLES.coda,
      ...SYNTHETIC_GIVEN_SYLLABLES.female.onset,
      ...SYNTHETIC_GIVEN_SYLLABLES.male.onset,
    ].join('');
    expect(joined).toMatch(/^[a-z]+$/);
    expect(joined).not.toContain('x');
    expect(joined).not.toContain('q');
  });
});

describe('synthetic name generation', () => {
  it('is deterministic for the same seed', () => {
    const first = syntheticPersonName('female', deriveStream('seed', 'identity.name'));
    const second = syntheticPersonName('female', deriveStream('seed', 'identity.name'));
    expect(first).toEqual(second);
    expect(first.family.length).toBeGreaterThan(0);
    expect(first.given.length).toBeGreaterThan(0);
  });

  it('produces many distinct names across seeds', () => {
    const family = new Set(streams(200).map((stream) => syntheticFamilyName(stream)));
    const given = new Set(streams(200).map((stream) => syntheticGivenName('male', stream)));
    expect(family.size).toBeGreaterThan(50);
    expect(given.size).toBeGreaterThan(50);
  });

  it('draws the family name before the given name', () => {
    const whole = syntheticPersonName('male', deriveStream('order', 'identity.name'));
    const replay = deriveStream('order', 'identity.name');
    expect(syntheticFamilyName(replay)).toBe(whole.family);
    expect(syntheticGivenName('male', replay)).toBe(whole.given);
  });
});
