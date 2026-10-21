import { describe, expect, it, vi } from 'vitest';
import { GameSession } from './session.ts';
import {
  DEFAULT_PREFERENCES,
  PREFS_KEY,
  loadPreferences,
  savePreferences,
  type PrefsStorage,
} from './prefs.ts';

/** 测试夹具：只允许偏好键，不能碰存档或保留副本。 */
function storage(raw: string | null = null) {
  const values = new Map<string, string>();
  if (raw !== null) values.set(PREFS_KEY, raw);
  const store: PrefsStorage = {
    getItem(key) {
      expect(key).toBe(PREFS_KEY);
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      expect(key).toBe(PREFS_KEY);
      values.set(key, value);
    },
    removeItem(key) {
      expect(key).toBe(PREFS_KEY);
      values.delete(key);
    },
  };
  return { values, store };
}

describe('playback preferences', () => {
  it('defaults to about 30 minutes at 1× without writing storage', () => {
    const { store, values } = storage();
    expect(loadPreferences(store)).toEqual({
      version: 1,
      lifeLengthMinutes: 30,
      pace: 1,
      reflections: { enabled: true, skipDuringAutoPlay: true },
    });
    expect(values.size).toBe(0);
    expect(loadPreferences(null)).toEqual(DEFAULT_PREFERENCES);
  });

  it('round-trips preferences using only their own key', () => {
    const { store, values } = storage();
    const prefs = {
      version: 1 as const,
      lifeLengthMinutes: 10 as const,
      pace: 16 as const,
      reflections: { enabled: false, skipDuringAutoPlay: true },
    };
    expect(savePreferences(prefs, store)).toBe(true);
    expect([...values.keys()]).toEqual(['lifesim.prefs.v1']);
    expect(loadPreferences(store)).toEqual(prefs);
  });

  it.each([
    '{bad-json',
    'null',
    JSON.stringify({ version: 2, lifeLengthMinutes: 30, pace: 1 }),
    JSON.stringify({ version: 1, lifeLengthMinutes: 45, pace: 1 }),
    JSON.stringify({ version: 1, lifeLengthMinutes: 30, pace: 8 }),
  ])('reads invalid preferences non-destructively: %s', (raw) => {
    const { store, values } = storage(raw);
    const before = [...values];
    expect(loadPreferences(store)).toEqual(DEFAULT_PREFERENCES);
    expect([...values]).toEqual(before);
  });

  it('handles blocked reads and writes', () => {
    const { store } = storage();
    vi.spyOn(store, 'getItem').mockImplementation(() => {
      throw new Error('fixture-blocked');
    });
    vi.spyOn(store, 'setItem').mockImplementation(() => {
      throw new Error('fixture-quota');
    });
    expect(loadPreferences(store)).toEqual(DEFAULT_PREFERENCES);
    expect(savePreferences(DEFAULT_PREFERENCES, store)).toBe(false);
    expect(savePreferences(DEFAULT_PREFERENCES, null)).toBe(false);
  });

  it('never adds presentation preferences to a game save', () => {
    const session = GameSession.create({ seed: 'fixture-prefs', region: 'JP', year: 1978 });
    const { store } = storage();
    const before = JSON.stringify(session.serialize());
    savePreferences(DEFAULT_PREFERENCES, store);
    expect(JSON.stringify(session.serialize())).toBe(before);
    for (const key of ['lifeLengthMinutes', 'pace', 'prefs'])
      expect(before).not.toContain(`"${key}"`);
  });
});

it('merges legacy and partial reflection preferences without resetting pacing or writing unknown data', () => {
  for (const reflections of [undefined, { enabled: false }]) {
    const { store, values } = storage(
      JSON.stringify({
        version: 1,
        lifeLengthMinutes: 10,
        pace: 16,
        reflections,
        secret: 'fixture-do-not-copy',
      }),
    );
    const prefs = loadPreferences(store);
    expect(prefs).toEqual({
      version: 1,
      lifeLengthMinutes: 10,
      pace: 16,
      reflections: { enabled: reflections?.enabled ?? true, skipDuringAutoPlay: true },
    });
    expect(savePreferences(prefs, store)).toBe(true);
    expect(values.get(PREFS_KEY)).not.toContain('secret');
  }
});
