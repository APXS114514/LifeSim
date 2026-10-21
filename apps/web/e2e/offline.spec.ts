import { expect, test, type Page } from '@playwright/test';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { extname, resolve } from 'node:path';

async function shellReady(page: Page, url = '/'): Promise<void> {
  await page.goto(url);
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
}
async function japan(page: Page): Promise<void> {
  await page.getByRole('radio', { name: '日本', exact: true }).check();
  await page.getByRole('radio', { name: '指定年份' }).check();
  await page.getByLabel('年份', { exact: true }).fill('1978');
  await page.getByRole('button', { name: '开始人生', exact: true }).click();
  await expect(page.getByRole('heading', { name: '人生时间线' })).toBeVisible();
}
async function fixedSeed(page: Page): Promise<void> {
  await page.addInitScript(() =>
    Object.defineProperty(crypto, 'randomUUID', { value: () => 'probe-0' }),
  );
}

test('includes an install manifest using the existing local icons', async ({ page }) => {
  await shellReady(page);
  const response = await page.request.get('/manifest.webmanifest');
  const manifest = (await response.json()) as {
    start_url: string;
    scope: string;
    icons: { src: string }[];
  };
  expect(manifest.start_url).toBe('./');
  expect(manifest.scope).toBe('./');
  expect(manifest.icons.map((icon) => icon.src)).toEqual(['icon-192.png', 'icon-512.png']);
});

test('reloads and continues a cached life offline without external requests', async ({
  page,
  context,
}) => {
  await fixedSeed(page);
  await shellReady(page);
  await japan(page);
  await page.getByRole('button', { name: '下一年', exact: true }).click();
  const saved = await page.evaluate(() => localStorage.getItem('lifesim.save.v1'));
  const requests: string[] = [];
  page.on('request', (request) => requests.push(request.url()));
  const origin = new URL(page.url()).origin;
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByText('已恢复上次自动存档。', { exact: true })).toBeVisible();
  await expect(page.locator('.pwa-status')).toContainText('当前离线');
  expect(await page.evaluate(() => localStorage.getItem('lifesim.save.v1'))).toBe(saved);
  await page.getByRole('button', { name: '下一年', exact: true }).click();
  await expect(page.locator('.time-age')).toHaveText('2 岁');
  expect(requests.every((url) => new URL(url).origin === origin)).toBe(true);
});

test('keeps license documents readable through ordinary links while offline', async ({
  page,
  context,
}) => {
  await shellReady(page);
  await context.setOffline(true);
  await page.locator('footer a[href$="THIRD_PARTY_NOTICES.txt"]').click();
  await expect(page).toHaveURL(/THIRD_PARTY_NOTICES\.txt$/);
  await expect(page.locator('body')).toContainText('MIT');
});

test('explains an uncached country offline and permits returning to a cached country', async ({
  page,
  context,
}) => {
  await fixedSeed(page);
  await shellReady(page);
  await japan(page);
  await page.getByRole('button', { name: '开始新人生', exact: true }).click();
  await context.setOffline(true);
  await page.getByRole('radio', { name: '中国大陆', exact: true }).check();
  await page.getByRole('button', { name: '开始人生', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('无法加载国家数据');
  expect(await page.evaluate(() => localStorage.getItem('lifesim.save.v1.preserved'))).toBeNull();
  await page.getByRole('button', { name: '返回出生设置', exact: true }).click();
  await japan(page);
  await page.getByRole('button', { name: '下一年', exact: true }).click();
  await expect(page.locator('.time-age')).toHaveText('1 岁');
});

test('remains playable online when offline registration is disabled', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await fixedSeed(page);
  await page.addInitScript(() =>
    Object.defineProperty(navigator.serviceWorker, 'register', {
      value: () => Promise.reject(new Error('fixture-disabled')),
    }),
  );
  await page.goto('/');
  await expect(page.locator('.pwa-status')).toContainText('你仍可在线游玩');
  await japan(page);
  await page.getByRole('button', { name: '下一年', exact: true }).click();
  await expect(page.locator('.time-age')).toHaveText('1 岁');
  expect(errors).toEqual([]);
});

/** Local deployment fixture: serves actual build bytes and can publish a second worker version. */
async function deploymentFixture() {
  const root = fileURLToPath(new URL('../dist/', import.meta.url));
  let updated = false;
  const server = createServer((request, response) => {
    void (async () => {
      const path = new URL(request.url ?? '/', 'http://fixture.test').pathname;
      const name = path === '/' ? 'index.html' : path.slice(1);
      const target = resolve(root, name);
      if (!target.startsWith(root)) {
        response.writeHead(404).end();
        return;
      }
      let body = await readFile(target);
      if (name === 'sw.js' && updated)
        body = Buffer.from(
          body.toString().replace(/"version":"([^"]+)"/, '"version":"$1-fixture-v2"'),
        );
      const types: Record<string, string> = {
        '.html': 'text/html',
        '.js': 'application/javascript',
        '.css': 'text/css',
        '.svg': 'image/svg+xml',
        '.png': 'image/png',
        '.webmanifest': 'application/manifest+json',
      };
      response.writeHead(200, {
        'Content-Type': types[extname(name)] ?? 'text/plain',
        'Cache-Control': 'no-store',
      });
      response.end(body);
    })().catch(() => response.writeHead(404).end());
  });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Fixture has no listening port');
  return {
    url: `http://127.0.0.1:${address.port}/`,
    update: () => {
      updated = true;
    },
    close: () =>
      new Promise<void>((done, reject) =>
        server.close((error) => (error ? reject(error) : done())),
      ),
  };
}

test('offers an explicit update, protects an unsaved life, then activates one consistent cache', async ({
  page,
  context,
}) => {
  const deployment = await deploymentFixture();
  try {
    await fixedSeed(page);
    await shellReady(page, deployment.url);
    await japan(page);
    await page.getByRole('button', { name: '下一年', exact: true }).click();
    const before = await page.evaluate(() => caches.keys());
    deployment.update();
    await page.evaluate(async () => {
      await (await navigator.serviceWorker.getRegistration())?.update();
    });
    await expect(page.locator('.pwa-status')).toContainText('有新版本');
    expect(await page.evaluate(() => caches.keys())).toEqual(expect.arrayContaining(before));
    await context.setOffline(true);
    await expect(page.getByRole('button', { name: '刷新以更新', exact: true })).toBeDisabled();
    await page.getByRole('button', { name: '下一年', exact: true }).click();
    await expect(page.locator('.time-age')).toHaveText('2 岁');
    await context.setOffline(false);
    await expect(page.getByRole('button', { name: '刷新以更新', exact: true })).toBeEnabled();
    const saved = await page.evaluate(() => localStorage.getItem('lifesim.save.v1'));
    await page.evaluate(() => {
      const descriptor = Object.getOwnPropertyDescriptor(Storage.prototype, 'setItem');
      if (!descriptor) throw new Error('Storage fixture has no setter');
      const original = localStorage.setItem.bind(localStorage);
      Object.defineProperty(globalThis, 'restoreFixtureStorage', {
        configurable: true,
        value: () => {
          Object.defineProperty(Storage.prototype, 'setItem', descriptor);
        },
      });
      Storage.prototype.setItem = function (key, value) {
        if (key === 'lifesim.save.v1')
          throw new DOMException('fixture-quota', 'QuotaExceededError');
        original(key, value);
      };
    });
    await page.getByRole('button', { name: '刷新以更新', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('当前进度尚未保存');
    expect(await page.evaluate(() => localStorage.getItem('lifesim.save.v1'))).toBe(saved);
    await page.evaluate(() => {
      (globalThis as { restoreFixtureStorage?: () => void }).restoreFixtureStorage?.();
    });
    await page.getByRole('button', { name: '刷新以更新', exact: true }).click();
    await expect(page.getByText('已恢复上次自动存档。', { exact: true })).toBeVisible();
    await expect(page.locator('.time-age')).toHaveText('2 岁');
    expect(await page.evaluate(() => localStorage.getItem('lifesim.save.v1'))).toBe(saved);
    await expect
      .poll(() => page.evaluate(() => caches.keys()))
      .toEqual([expect.stringContaining('-fixture-v2')]);
    const status = await page.evaluate(
      async () => (await fetch('/assets/fixture-other-build.js')).status,
    );
    expect(status).toBe(409);
    await expect(page.getByRole('button', { name: '刷新以更新', exact: true })).toBeVisible();
  } finally {
    await deployment.close();
  }
});
