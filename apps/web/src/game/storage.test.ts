import { beforeEach, describe, expect, it } from 'vitest';
import { GameSession } from './session.ts';
import {
  PRESERVED_KEY,
  SAVE_KEY,
  clearGame,
  downloadSaveBackup,
  loadGame,
  saveGame,
} from './storage.ts';

/** 测试夹具：内存版 localStorage，不是浏览器实现。 */
class MemoryStorage implements Storage {
  readonly #map = new Map<string, string>();

  get length(): number {
    return this.#map.size;
  }

  clear(): void {
    this.#map.clear();
  }

  getItem(key: string): string | null {
    return this.#map.get(key) ?? null;
  }

  key(index: number): string | null {
    return [...this.#map.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.#map.delete(key);
  }

  setItem(key: string, value: string): void {
    this.#map.set(key, value);
  }
}

const request = { seed: 'save-0', region: 'JP' as const, year: 1978 as const };

let store: MemoryStorage;

beforeEach(() => {
  store = new MemoryStorage();
  Object.defineProperty(globalThis, 'localStorage', {
    value: store,
    configurable: true,
    writable: true,
  });
});

function newSession(): GameSession {
  const session = GameSession.create(request);
  session.advance();
  return session;
}

describe('save storage', () => {
  it('round-trips a session through localStorage', () => {
    const session = newSession();
    expect(saveGame(session)).toBe(true);
    const result = loadGame();
    expect(result.kind).toBe('loaded');
    if (result.kind !== 'loaded') throw new Error('expected a loaded save');
    expect(result.session.facts).toEqual(session.facts);
    expect(result.session.pending?.key).toBe(session.pending?.key);
  });

  it('keeps an incompatible save version instead of deleting it', () => {
    store.setItem(SAVE_KEY, JSON.stringify({ version: 999 }));
    const result = loadGame();
    expect(result.kind).toBe('failed');
    if (result.kind !== 'failed') throw new Error('expected a failed load');
    expect(result.reason).toBe('incompatible');
    expect(store.getItem(SAVE_KEY)).toBe(JSON.stringify({ version: 999 }));
    expect(store.getItem(PRESERVED_KEY)).toBe(JSON.stringify({ version: 999 }));
  });

  it('keeps a save from an incompatible engine version', () => {
    const session = newSession();
    const raw = JSON.stringify(session.serialize());
    const mutated = JSON.parse(raw) as { snapshot: { engineVersion: string } };
    mutated.snapshot.engineVersion = '0.0.0';
    const changed = JSON.stringify(mutated);
    store.setItem(SAVE_KEY, changed);

    const result = loadGame();
    expect(result.kind).toBe('failed');
    if (result.kind !== 'failed') throw new Error('expected a failed load');
    expect(result.reason).toBe('incompatible');
    expect(store.getItem(SAVE_KEY)).toBe(changed);
    expect(store.getItem(PRESERVED_KEY)).toBe(changed);
  });

  it('keeps a corrupt save and reports it as unreadable', () => {
    store.setItem(SAVE_KEY, '{not json');
    const result = loadGame();
    expect(result.kind).toBe('failed');
    if (result.kind !== 'failed') throw new Error('expected a failed load');
    expect(result.reason).toBe('unreadable');
    expect(store.getItem(SAVE_KEY)).toBe('{not json');
    expect(store.getItem(PRESERVED_KEY)).toBe('{not json');
  });

  it('refuses to overwrite a save that is waiting to be handled', () => {
    store.setItem(SAVE_KEY, '{not json');
    loadGame();
    const session = newSession();
    expect(saveGame(session)).toBe(false);
    expect(store.getItem(SAVE_KEY)).toBe('{not json');
  });

  it('deletes both keys only when the player explicitly clears', () => {
    store.setItem(SAVE_KEY, '{not json');
    loadGame();
    expect(store.getItem(PRESERVED_KEY)).not.toBeNull();
    clearGame();
    expect(store.getItem(SAVE_KEY)).toBeNull();
    expect(store.getItem(PRESERVED_KEY)).toBeNull();
    expect(loadGame().kind).toBe('none');
  });

  it('surfaces a preserved-only copy instead of silently dropping it', () => {
    store.setItem(PRESERVED_KEY, '{"old":true}');
    const result = loadGame();
    expect(result.kind).toBe('failed');
    if (result.kind !== 'failed') throw new Error('expected a failed load');
    expect(result.raw).toBe('{"old":true}');
  });

  it('reports that a download is not possible outside a browser', () => {
    expect(downloadSaveBackup('{}')).toBe(false);
  });

  it('keeps a save whose journal does not match the snapshot', () => {
    const session = newSession();
    const mutated = JSON.parse(JSON.stringify(session.serialize())) as { facts: unknown[] };
    mutated.facts = mutated.facts.slice(0, -1);
    const changed = JSON.stringify(mutated);
    store.setItem(SAVE_KEY, changed);

    const result = loadGame();
    expect(result.kind).toBe('failed');
    if (result.kind !== 'failed') throw new Error('expected a failed load');
    expect(result.reason).toBe('unreadable');
    expect(store.getItem(SAVE_KEY)).toBe(changed);
    expect(store.getItem(PRESERVED_KEY)).toBe(changed);
  });
});
