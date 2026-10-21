import { BIRTH_REGION_IDS } from '@lifesim/content-schema';
import { describe, expect, it } from 'vitest';
import { flagFileFor, flagUrlFor, hasFlag, polityForRegionAt } from './flags.ts';

describe('flag mapping', () => {
  it('maps every launch region to a registered polity at a modern date', () => {
    for (const region of BIRTH_REGION_IDS) {
      const polity = polityForRegionAt(region, '2026-01-01');
      expect(hasFlag(polity), region).toBe(true);
      expect(flagFileFor(polity, '2026-01-01'), region).not.toBeNull();
    }
  });

  it('switches the Soviet flag at the 1955 adoption date', () => {
    expect(flagFileFor('polity:ussr', '1950-01-01')).toBe('ussr-1936.svg');
    expect(flagFileFor('polity:ussr', '1955-08-18')).toBe('ussr-1936.svg');
    expect(flagFileFor('polity:ussr', '1955-08-19')).toBe('ussr-1955.svg');
    expect(flagFileFor('polity:ussr', '1991-12-25')).toBe('ussr-1955.svg');
  });

  it('derives the Russian polity from the country pack, not a hardcoded branch', () => {
    expect(polityForRegionAt('RU', '1950-01-01')).toBe('polity:ussr');
    expect(polityForRegionAt('RU', '1991-12-25')).toBe('polity:ussr');
    expect(polityForRegionAt('RU', '1991-12-26')).toBe('polity:ru-russian-federation');
    expect(polityForRegionAt('CN', '1950-01-01')).toBe('polity:cn-prc');
    expect(polityForRegionAt('JP', '1950-01-01')).toBe('polity:jp-japan');
    expect(polityForRegionAt('KP', '1950-01-01')).toBe('polity:kp-dprk');
    expect(polityForRegionAt('KR', '1950-01-01')).toBe('polity:kr-rok');
  });

  it('returns null for an unregistered polity and builds a base-aware url', () => {
    expect(flagFileFor('polity:missing', '1990-01-01')).toBeNull();
    expect(hasFlag('polity:missing')).toBe(false);
    expect(flagUrlFor('polity:missing', '1990-01-01')).toBeNull();
    const url = flagUrlFor('polity:ussr', '1980-01-01');
    expect(url).toMatch(/\/flags\/ussr-1955\.svg$/);
  });
});
