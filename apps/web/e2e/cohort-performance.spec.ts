import { expect, test, type Page } from '@playwright/test';

/**
 * M4-020c 性能实测：主线程上「同龄对照」的同步计算长度。
 *
 * 面板在创建与每个追赶分片上写 \`lifesim:cohort:create\` / \`lifesim:cohort:advance\` 两条
 * performance.measure。这里在桌面与 Playwright 手机模拟两个项目里各跑一遍，断言同步分片的
 * p95 不超过 16 ms（玩家的这一局与动画帧仍能及时让出主线程），并把实测值打印到测试输出。
 *
 * 为什么不是断言「每一个分片都 < 16 ms」：measure 是墙钟时间，并行跑 5 个浏览器时，一个分片可能
 * 被宿主调度暂停几十毫秒——那是环境抖动，不是同步计算变长。设计上每个分片只推进四个人各一年
 * （实测中位数约 0.7—1 ms）；p95 守 16 ms，另设一个很宽的上限捕获真正的性能回归。
 */

async function freezeSeed(page: Page, seed = 'probe-0'): Promise<void> {
  await page.addInitScript(() => {
    const raw = localStorage.getItem('lifesim.prefs.v1');
    const prefs = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    localStorage.setItem(
      'lifesim.prefs.v1',
      JSON.stringify({
        version: 1,
        lifeLengthMinutes: 30,
        pace: 1,
        ...prefs,
        reflections: { enabled: false, skipDuringAutoPlay: true },
      }),
    );
  });
  await page.addInitScript((value: string) => {
    Object.defineProperty(globalThis.crypto, 'randomUUID', {
      value: () => value,
      configurable: true,
    });
  }, seed);
}

async function startLife(page: Page, region: string, year: string): Promise<void> {
  await freezeSeed(page);
  await page.goto('/');
  await page.getByRole('group', { name: '出生地区' }).getByRole('radio', { name: region }).check();
  await page.getByRole('radio', { name: '指定年份' }).check();
  await page.getByLabel('年份', { exact: true }).fill(year);
  await page.getByRole('button', { name: '开始人生' }).click();
  await expect(page.getByRole('heading', { name: '人生时间线' })).toBeVisible();
  await expect(page.locator('.fact').first()).toBeVisible();
}

async function finishLife(page: Page): Promise<void> {
  await page.getByRole('button', { name: '直接模拟至结局', exact: true }).click();
  await page.getByRole('button', { name: '确认直接模拟至结局', exact: true }).click();
  await expect(page.getByRole('heading', { name: '一生总结', exact: true })).toBeVisible();
}

interface Measure {
  readonly name: string;
  readonly duration: number;
}

async function readMeasures(page: Page): Promise<readonly Measure[]> {
  return page.evaluate(() =>
    performance
      .getEntriesByType('measure')
      .filter((entry) => entry.name.startsWith('lifesim:cohort:'))
      .map((entry) => ({ name: entry.name, duration: entry.duration })),
  );
}

function summarize(measures: readonly Measure[], name: string): number[] {
  return measures.filter((entry) => entry.name === name).map((entry) => entry.duration);
}

function report(
  project: string,
  scenario: string,
  values: {
    firstOpenMs: number;
    createMs: readonly number[];
    catchUpWallMs: number;
    slices: readonly number[];
  },
): void {
  const slices = [...values.slices].sort((a, b) => a - b);
  const at = (fraction: number): number =>
    slices.length === 0
      ? 0
      : (slices[Math.min(slices.length - 1, Math.floor(slices.length * fraction))] ?? 0);
  const median = at(0.5);
  const p95 = at(0.95);
  const maxSlice = slices.length === 0 ? 0 : (slices[slices.length - 1] ?? 0);
  console.log(
    '[cohort-perf] ' +
      JSON.stringify({
        project,
        scenario,
        firstOpenMs: Math.round(values.firstOpenMs),
        createMs: values.createMs.map((value) => Number(value.toFixed(2))),
        catchUpWallMs: Math.round(values.catchUpWallMs),
        slices: slices.length,
        medianSliceMs: Number(median.toFixed(2)),
        p95SliceMs: Number(p95.toFixed(2)),
        maxSliceMs: Number(maxSlice.toFixed(2)),
        totalSliceMs: Number(slices.reduce((sum, value) => sum + value, 0).toFixed(2)),
      }),
  );
}

/** 同步分片的预算：p95 必须留在 16 ms 内；单次墙钟尖峰只守一个很宽的上限。 */
function expectSliceBudget(slices: readonly number[]): void {
  const sorted = [...slices].sort((a, b) => a - b);
  const p95 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] ?? 0;
  expect(p95).toBeLessThan(16);
  expect(Math.max(...slices)).toBeLessThan(50);
}

test('first open and the catch-up to the end stay inside the 16 ms budget', async ({ page }) => {
  test.setTimeout(120_000);
  await startLife(page, '日本', '1978');

  const firstOpenStart = Date.now();
  await page.getByRole('button', { name: '同龄对照' }).click();
  await expect(page.locator('.cohort-row')).toHaveCount(4);
  await expect(page.locator('.cohort-panel')).toHaveAttribute('data-status', 'ready');
  const firstOpenMs = Date.now() - firstOpenStart;
  const firstMeasures = await readMeasures(page);
  const createMs = summarize(firstMeasures, 'lifesim:cohort:create');
  expect(createMs.length).toBeGreaterThan(0);

  await page.evaluate(() => performance.clearMeasures('lifesim:cohort:advance'));
  const catchUpStart = Date.now();
  await finishLife(page);
  await expect(page.locator('.cohort-panel')).toHaveAttribute('data-status', 'catching-up', {
    timeout: 30_000,
  });
  await expect(page.locator('.cohort-panel')).toHaveAttribute('data-status', 'ready', {
    timeout: 60_000,
  });
  const catchUpWallMs = Date.now() - catchUpStart;
  const slices = summarize(await readMeasures(page), 'lifesim:cohort:advance');
  expect(slices.length).toBeGreaterThan(20);

  report(test.info().project.name, 'first open at age 0, then simulate to the end', {
    firstOpenMs,
    createMs,
    catchUpWallMs,
    slices,
  });
  expectSliceBudget(slices);
});

test('first opening after a whole life also catches up in slices', async ({ page }) => {
  test.setTimeout(120_000);
  await startLife(page, '日本', '1978');
  await finishLife(page);

  await page.evaluate(() => {
    performance.clearMeasures('lifesim:cohort:create');
    performance.clearMeasures('lifesim:cohort:advance');
  });
  const firstOpenStart = Date.now();
  await page.getByRole('button', { name: '同龄对照' }).click();
  await expect(page.locator('.cohort-row')).toHaveCount(4);
  await expect(page.locator('.cohort-panel')).toHaveAttribute('data-status', 'catching-up', {
    timeout: 30_000,
  });
  await expect(page.locator('.cohort-panel')).toHaveAttribute('data-status', 'ready', {
    timeout: 60_000,
  });
  const firstOpenMs = Date.now() - firstOpenStart;
  const measures = await readMeasures(page);
  const createMs = summarize(measures, 'lifesim:cohort:create');
  const slices = summarize(measures, 'lifesim:cohort:advance');
  expect(createMs.length).toBe(1);
  expect(slices.length).toBeGreaterThan(20);

  report(test.info().project.name, 'first open after a whole life', {
    firstOpenMs,
    createMs,
    catchUpWallMs: firstOpenMs,
    slices,
  });
  expectSliceBudget(slices);
});
