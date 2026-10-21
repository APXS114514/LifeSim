import { PACE_MULTIPLIERS, type PaceMultiplier } from './year-pacing.ts';

export const PREFS_KEY = 'lifesim.prefs.v1';
export const LIFE_LENGTH_MINUTES = [10, 30, 60] as const;
export type LifeLengthMinutes = (typeof LIFE_LENGTH_MINUTES)[number];

export interface Preferences {
  version: 1;
  lifeLengthMinutes: LifeLengthMinutes;
  pace: PaceMultiplier;
}

export interface PrefsStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const DEFAULT_PREFERENCES: Preferences = Object.freeze({
  version: 1,
  lifeLengthMinutes: 30,
  pace: 1,
});

function browserStorage(): PrefsStorage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function valid(value: unknown): value is Preferences {
  if (typeof value !== 'object' || value === null) return false;
  const prefs = value as Record<string, unknown>;
  return (
    prefs['version'] === 1 &&
    LIFE_LENGTH_MINUTES.includes(prefs['lifeLengthMinutes'] as LifeLengthMinutes) &&
    PACE_MULTIPLIERS.includes(prefs['pace'] as PaceMultiplier)
  );
}

export function loadPreferences(store: PrefsStorage | null = browserStorage()): Preferences {
  try {
    const raw = store?.getItem(PREFS_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (valid(parsed)) {
      return { version: 1, lifeLengthMinutes: parsed.lifeLengthMinutes, pace: parsed.pace };
    }
  } catch {
    // 偏好读取无副作用：损坏或不可用时保留原数据，采用默认值。
  }
  return { ...DEFAULT_PREFERENCES };
}

export function savePreferences(
  prefs: Preferences,
  store: PrefsStorage | null = browserStorage(),
): boolean {
  if (!store || !valid(prefs)) return false;
  try {
    store.setItem(PREFS_KEY, JSON.stringify(prefs));
    return true;
  } catch {
    return false;
  }
}
