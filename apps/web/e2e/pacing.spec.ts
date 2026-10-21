import { expect, test, type Page } from '@playwright/test';

type Save = { snapshot: { at: string }; facts: { id: string; type: string }[] };

async function saved(page: Page): Promise<Save> {
  return page.evaluate(() => JSON.parse(localStorage.getItem('lifesim.save.v1') ?? '{}') as Save);
}

async function start(page: Page): Promise<void> {
  await page.addInitScript(() => {
    Object.defineProperty(crypto, 'randomUUID', { value: () => 'probe-0' });
  });
  await page.goto('/');
  await page.getByRole('radio', { name: '日本', exact: true }).check();
  await page.getByRole('radio', { name: '指定年份' }).check();
  await page.getByLabel('年份', { exact: true }).fill('1978');
  await page.getByRole('button', { name: '开始人生', exact: true }).click();
  await expect(page.getByRole('heading', { name: '人生时间线' })).toBeVisible();
}

test('reveals a year gradually, freezes on pause and resumes from that progress', async ({
  page,
}) => {
  await start(page);
  await page.getByLabel('一生时长', { exact: true }).selectOption('10');
  await page.getByLabel('速度', { exact: true }).selectOption('4');
  // 测试夹具：先到首次入学附近，再观察有新事实的那一年。
  for (let age = 0; age < 6; age += 1)
    await page.getByRole('button', { name: '下一年', exact: true }).click();
  await page.getByRole('button', { name: '播放', exact: true }).click();
  const progress = page.locator('[data-year-progress]');
  await expect
    .poll(async () => Number(await progress.getAttribute('aria-valuenow')))
    .toBeLessThan(100);
  await expect
    .poll(async () => Number(await progress.getAttribute('aria-valuenow')))
    .toBeGreaterThan(0);
  const authoritative = await saved(page);
  expect(await page.locator('.fact').count()).toBeLessThanOrEqual(authoritative.facts.length);
  expect((await progress.getAttribute('aria-valuetext'))! <= authoritative.snapshot.at).toBe(true);
  await page.getByRole('button', { name: '暂停', exact: true }).click();
  const frozenProgress = await progress.getAttribute('aria-valuenow');
  const frozenDate = await progress.getAttribute('aria-valuetext');
  const frozenRows = await page.locator('.fact').count();
  await page.waitForTimeout(900);
  await expect(progress).toHaveAttribute('aria-valuenow', frozenProgress!);
  await expect(progress).toHaveAttribute('aria-valuetext', frozenDate!);
  await expect(page.locator('.fact')).toHaveCount(frozenRows);
  await page.getByRole('button', { name: '播放', exact: true }).click();
  await expect
    .poll(async () => Number(await progress.getAttribute('aria-valuenow')))
    .toBeGreaterThan(Number(frozenProgress));
  await page.getByRole('button', { name: '暂停', exact: true }).click();
  await page.getByRole('button', { name: '下一年', exact: true }).click();
  const advanced = await saved(page);
  await expect(page.locator('.fact')).toHaveCount(
    advanced.facts.filter((fact) => fact.type !== 'finance.settlement').length,
  );
  await expect(progress).toHaveAttribute('aria-valuenow', '100');
  await expect(progress).toHaveAttribute('aria-valuetext', advanced.snapshot.at);
  await page.reload();
  await expect(page.locator('.time-date')).toHaveText(advanced.snapshot.at);
  const ids = await page
    .locator('[data-fact-id]')
    .evaluateAll((rows) => rows.map((row) => row.getAttribute('data-fact-id')));
  expect(ids.length).toBe(
    advanced.facts.filter((fact) => fact.type !== 'finance.settlement').length,
  );
  expect(new Set(ids).size).toBe(ids.length);
});

test('persists playback preferences without changing the autosave and translates controls', async ({
  page,
}) => {
  await start(page);
  const before = await page.evaluate(() => localStorage.getItem('lifesim.save.v1'));
  await page.getByLabel('一生时长', { exact: true }).selectOption('10');
  await page.getByLabel('速度', { exact: true }).selectOption('16');
  await page.reload();
  await expect(page.getByLabel('一生时长', { exact: true })).toHaveValue('10');
  await expect(page.getByLabel('速度', { exact: true })).toHaveValue('16');
  expect(await page.evaluate(() => localStorage.getItem('lifesim.save.v1'))).toBe(before);
  const prefs = await page.evaluate(() => localStorage.getItem('lifesim.prefs.v1'));
  expect(prefs).not.toBeNull();
  expect(prefs).not.toContain('facts');
  expect(prefs).not.toContain('snapshot');
  await page.getByRole('button', { name: 'English' }).click();
  await expect(page.getByLabel('Life length', { exact: true })).toHaveValue('10');
  await expect(page.getByRole('progressbar', { name: 'Year progress' })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('lifesim.save.v1'))).toBe(before);
});

test('shows every committed fact immediately with reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await start(page);
  await page.getByLabel('一生时长', { exact: true }).selectOption('10');
  await page.getByLabel('速度', { exact: true }).selectOption('16');
  await page.getByRole('button', { name: '播放', exact: true }).click();
  await expect
    .poll(async () => Number((await page.locator('.time-age').innerText()).replace(/\D/g, '')))
    .toBeGreaterThan(0);
  await page.getByRole('button', { name: '暂停', exact: true }).click();
  const save = await saved(page);
  await expect(page.locator('.fact')).toHaveCount(
    save.facts.filter((fact) => fact.type !== 'finance.settlement').length,
  );
  await expect(page.locator('[data-year-progress]')).toHaveAttribute('aria-valuenow', '100');
  await expect(page.locator('.time-date')).toHaveText(save.snapshot.at);
});

test('keeps the progress and playback controls inside a 320px viewport', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await start(page);
  await expect(page.getByLabel('一生时长', { exact: true })).toBeVisible();
  await expect(page.locator('[data-year-progress]')).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    ),
  ).toBeLessThanOrEqual(0);
});
