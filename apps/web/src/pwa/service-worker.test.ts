import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';

/** In-memory worker fixture; no real service worker or network participates in these tests. */
function workerFixture() {
  const scope = 'https://fixture.test/LifeSim/';
  const version = 'fixture-v1';
  const handlers: Record<string, (event: Record<string, unknown>) => void> = {};
  const stores = new Map<string, Map<string, Response>>();
  let cacheWritable = true;
  let online = true,
    claimed = false,
    skipped = false;
  const requests: string[] = [];
  const messages: unknown[] = [];
  const resourceUrl = (input: string | Request) => (typeof input === 'string' ? input : input.url);
  const network = (input: string | Request): Promise<Response> => {
    const url = resourceUrl(input);
    requests.push(url);
    return online
      ? Promise.resolve(new Response(url))
      : Promise.reject(new Error('fixture-offline'));
  };
  const caches = {
    keys: () => Promise.resolve([...stores.keys()]),
    delete: (name: string) => Promise.resolve(stores.delete(name)),
    open(name: string) {
      let contents = stores.get(name);
      if (!contents) {
        contents = new Map();
        stores.set(name, contents);
      }
      const data = contents;
      return Promise.resolve({
        match: (input: string | Request) => Promise.resolve(data.get(resourceUrl(input))?.clone()),
        put: (input: string | Request, response: Response) => {
          if (!cacheWritable) return Promise.reject(new Error('fixture-quota'));
          data.set(resourceUrl(input), response.clone());
          return Promise.resolve();
        },
        async addAll(inputs: (string | Request)[]) {
          const responses = await Promise.all(inputs.map(network));
          inputs.forEach((input, index) => data.set(resourceUrl(input), responses[index]!));
        },
      });
    },
  };
  const build = {
    version,
    base: '/LifeSim/',
    shell: ['index.html', 'assets/app-fixture.js'],
    assets: ['index.html', 'assets/app-fixture.js', 'assets/jp-fixture.js', 'assets/cn-fixture.js'],
  };
  const source = readFileSync(new URL('../../public/sw.js', import.meta.url), 'utf8').replace(
    /const BUILD = [\s\S]*?\/\/ LIFESIM_BUILD_CONFIG/,
    `const BUILD = ${JSON.stringify(build)}; // LIFESIM_BUILD_CONFIG`,
  );
  runInNewContext(source, {
    URL,
    Response,
    Request,
    caches,
    fetch: network,
    self: {
      location: new URL(scope + 'sw.js'),
      registration: { scope },
      addEventListener: (type: string, handler: (event: Record<string, unknown>) => void) => {
        handlers[type] = handler;
      },
      clients: {
        claim: () => {
          claimed = true;
          return Promise.resolve();
        },
        get: () => Promise.resolve({ postMessage: (message: unknown) => messages.push(message) }),
      },
      skipWaiting: () => {
        skipped = true;
        return Promise.resolve();
      },
    },
  });
  async function dispatch(type: string, data: Record<string, unknown> = {}) {
    const pending: Promise<unknown>[] = [];
    handlers[type]!({ ...data, waitUntil: (promise: Promise<unknown>) => pending.push(promise) });
    await Promise.all(pending);
  }
  async function request(
    path: string,
    options: { method?: string; mode?: string } = {},
  ): Promise<Response | undefined> {
    let response: Promise<Response> | undefined;
    const pending: Promise<unknown>[] = [];
    handlers['fetch']!({
      request: {
        url: new URL(path, scope).href,
        method: options.method ?? 'GET',
        mode: options.mode ?? 'cors',
      },
      clientId: 'fixture-client',
      respondWith: (value: Promise<Response>) => {
        response = value;
      },
      waitUntil: (promise: Promise<unknown>) => pending.push(promise),
    });
    const result = await response;
    await Promise.all(pending);
    return result;
  }
  return {
    scope,
    version,
    stores,
    messages,
    requests,
    dispatch,
    request,
    caches,
    blockCacheWrites: () => {
      cacheWritable = false;
    },
    offline: () => {
      online = false;
    },
    get claimed() {
      return claimed;
    },
    get skipped() {
      return skipped;
    },
  };
}

describe('versioned offline cache', () => {
  it('precaches the shell but downloads countries only on demand and keeps a loaded one offline', async () => {
    const worker = workerFixture();
    await worker.dispatch('install');
    expect(worker.requests.map((url) => new URL(url).pathname)).toEqual([
      '/LifeSim/index.html',
      '/LifeSim/assets/app-fixture.js',
    ]);
    expect((await worker.request('assets/jp-fixture.js'))?.status).toBe(200);
    worker.offline();
    expect(await (await worker.request('', { mode: 'navigate' }))?.text()).toBe(
      worker.scope + 'index.html',
    );
    expect(await (await worker.request('assets/jp-fixture.js'))?.text()).toBe(
      worker.scope + 'assets/jp-fixture.js',
    );
    expect((await worker.request('assets/cn-fixture.js'))?.status).toBe(503);
  });
  it('keeps a successful online response usable when caching runs out of space', async () => {
    const worker = workerFixture();
    await worker.dispatch('install');
    worker.blockCacheWrites();
    const response = await worker.request('assets/jp-fixture.js');
    expect(response?.status).toBe(200);
    expect(await response?.text()).toBe(worker.scope + 'assets/jp-fixture.js');
    expect(worker.messages).toEqual([{ type: 'LIFESIM_CACHE_FAILED' }]);
  });
  it('serves a known static document as itself rather than replacing it with the application shell', async () => {
    const worker = workerFixture();
    await worker.dispatch('install');
    worker.offline();
    expect(
      await (await worker.request('assets/app-fixture.js', { mode: 'navigate' }))?.text(),
    ).toBe(worker.scope + 'assets/app-fixture.js');
  });
  it('cleans only the previous cache for this application and claims initial pages', async () => {
    const worker = workerFixture();
    await worker.dispatch('install');
    await worker.caches.open('lifesim:/LifeSim/:old');
    await worker.caches.open('lifesim:/Other/:old');
    await worker.dispatch('activate');
    expect(worker.claimed).toBe(true);
    expect([...worker.stores.keys()].sort()).toEqual([
      'lifesim:/LifeSim/:fixture-v1',
      'lifesim:/Other/:old',
    ]);
  });
  it('rejects chunks from a different build and never intercepts remote or non-GET requests', async () => {
    const worker = workerFixture();
    await worker.dispatch('install');
    expect((await worker.request('assets/app-another-build.js'))?.status).toBe(409);
    expect(worker.messages).toEqual([{ type: 'LIFESIM_VERSION_MISMATCH' }]);
    expect(await worker.request('https://elsewhere.test/file.js')).toBeUndefined();
    expect(await worker.request('assets/jp-fixture.js', { method: 'POST' })).toBeUndefined();
    expect(worker.requests).toHaveLength(2);
  });
  it('waits for an explicit update message before replacing a running version', async () => {
    const worker = workerFixture();
    await worker.dispatch('install');
    expect(worker.skipped).toBe(false);
    await worker.dispatch('message', { data: { type: 'unrelated' } });
    expect(worker.skipped).toBe(false);
    await worker.dispatch('message', { data: { type: 'LIFESIM_APPLY_UPDATE' } });
    expect(worker.skipped).toBe(true);
  });
});
