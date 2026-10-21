import { expect, test } from '@playwright/test';
import { createRealLifeSimulation } from '@lifesim/real-world';
import { canonicalJson } from '@lifesim/simulation-core';

/** Compare the browser condition against the synchronous Node entry under the current rules. */
for (const [region, label, year] of [
  ['JP', '日本', 1978],
  ['CN', '中国大陆', 1960],
  ['RU', '俄罗斯（含苏联时期）', 1980],
] as const) {
  test(`preserves the complete ${region} ${year} life in the browser`, async ({ page }) => {
    const { simulation } = createRealLifeSimulation({
      seed: 'lazy-packs-compatibility',
      region,
      year,
    });
    simulation.advanceTo({
      targetDate: '2200-01-01',
      stopAtMajorDecision: false,
      maxWorkUnits: 100_000,
    });
    await page.addInitScript(() => {
      Object.defineProperty(crypto, 'randomUUID', { value: () => 'lazy-packs-compatibility' });
    });
    await page.goto('/');
    await page
      .getByRole('group', { name: '出生地区' })
      .getByRole('radio', { name: label, exact: true })
      .check();
    await page.getByRole('radio', { name: '指定年份' }).check();
    await page.getByLabel('年份', { exact: true }).fill(String(year));
    await page.getByRole('button', { name: '开始人生', exact: true }).click();
    await expect(page.getByRole('heading', { name: '人生时间线' })).toBeVisible();
    const finish = page.getByRole('button', { name: '直接模拟至结局', exact: true });
    if (await finish.count()) {
      await finish.click();
      await page.getByRole('button', { name: '确认直接模拟至结局', exact: true }).click();
    }
    await expect(page.getByRole('heading', { name: '一生总结', exact: true })).toBeVisible();
    const facts: unknown[] = await page.evaluate(() => {
      const saved = JSON.parse(localStorage.getItem('lifesim.save.v1')!) as { facts: unknown[] };
      return saved.facts;
    });
    expect(facts).toHaveLength(simulation.facts.length);
    expect(canonicalJson(facts)).toBe(canonicalJson(simulation.facts));
  });
}

test('requests no country at first paint, then only the selected country and restores it', async ({
  page,
}) => {
  const countries: string[] = [];
  page.on('request', (request) => {
    const match = /\/assets\/(cn|jp|kp|kr|ru)-[^/]+\.js/.exec(new URL(request.url()).pathname);
    if (match?.[1]) countries.push(match[1]);
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '出生设置' })).toBeVisible();
  expect(countries).toEqual([]);
  await page.getByRole('radio', { name: '日本', exact: true }).check();
  await page.getByRole('button', { name: '开始人生', exact: true }).click();
  await expect(page.getByRole('heading', { name: '人生时间线' })).toBeVisible();
  expect(countries).toEqual(['jp']);
  await page.reload();
  await expect(page.getByText('已恢复上次自动存档。')).toBeVisible();
  expect(countries.every((id) => id === 'jp')).toBe(true);
});

test('shows a retryable bilingual message when the selected country cannot download', async ({
  page,
  context,
}) => {
  // A controlled page delegates the actual network request to the worker.
  await context.route('**/assets/jp-*.js', (route) => route.abort());
  await page.goto('/');
  await page.getByRole('radio', { name: '日本', exact: true }).check();
  await page.getByRole('button', { name: '开始人生', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('无法加载国家数据');
  await page.getByRole('button', { name: 'English', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Country data could not be loaded');
  await expect(page.getByRole('button', { name: 'Retry loading', exact: true })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('lifesim.save.v1.preserved'))).toBeNull();
  await context.unroute('**/assets/jp-*.js');
  await page.getByRole('button', { name: 'Retry loading', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Life timeline' })).toBeVisible();
});

test('rebuilds the partial registry when a second country is loaded in the same tab', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('radio', { name: '日本', exact: true }).check();
  await page.getByRole('button', { name: '开始人生', exact: true }).click();
  await expect(page.getByRole('heading', { name: '人生时间线' })).toBeVisible();
  await page.getByRole('button', { name: '开始新人生', exact: true }).click();
  await page.getByRole('radio', { name: '中国大陆', exact: true }).check();
  await page.getByRole('button', { name: '开始人生', exact: true }).click();
  await expect(page.getByRole('heading', { name: '人生时间线' })).toBeVisible();
  const saved = await page.evaluate(
    () =>
      JSON.parse(localStorage.getItem('lifesim.save.v1')!) as {
        snapshot: { world: { regionId: string } };
      },
  );
  expect(saved.snapshot.world.regionId).toBe('CN');
  await expect(page.getByRole('alert')).toHaveCount(0);
});
