import { expect, test, type Page } from '@playwright/test';

/**
 * 测试夹具：固定出生种子（与 smoke.spec.ts 相同）。随机种子可能抽到「一生没有重大决定」的人生，
 * 那样就无法验证推进一年之后同龄对照的变化。
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
  const regions = page.getByRole('group', { name: '出生地区' });
  await regions.getByRole('radio', { name: region }).check();
  await page.getByRole('radio', { name: '指定年份' }).check();
  await page.getByLabel('年份', { exact: true }).fill(year);
  await page.getByRole('button', { name: '开始人生' }).click();
  await expect(page.getByRole('heading', { name: '人生时间线' })).toBeVisible();
  await expect(page.locator('.fact').first()).toBeVisible();
}

/** 展开「同龄对照」并等到四个人算出来；面板默认折叠。 */
async function openCohort(page: Page): Promise<void> {
  await page.getByRole('button', { name: '同龄对照' }).click();
  await expect(page.locator('.cohort-row')).toHaveCount(4);
}

/** 推进到目标年龄；途中遇到重大决定就选第一个可用项（与 smoke 的推进方式一致）。 */
async function advanceToAge(page: Page, target: number): Promise<void> {
  for (let guard = 0; guard < 80; guard += 1) {
    const age = Number(((await page.locator('.time-age').textContent()) ?? '').replace(/\D/g, ''));
    if (age >= target) return;
    const option = page.locator('.decision-option:not([disabled])').first();
    if ((await option.count()) > 0) {
      await option.click();
      await expect(page.locator('.decision-card')).toHaveCount(0);
      continue;
    }
    await page.getByRole('button', { name: '下一年' }).click();
    await expect
      .poll(async () => {
        const text = (await page.locator('.time-age').textContent()) ?? '';
        return Number(text.replace(/\D/g, ''));
      })
      .toBeGreaterThan(age);
  }
  throw new Error('The life did not reach age ' + String(target));
}

test('expands into the four others, a survival curve and a life grid', async ({ page }) => {
  await startLife(page, '日本', '1978');
  await expect(page.locator('.cohort-row')).toHaveCount(0);

  await openCohort(page);

  const chart = page.locator('.survival-chart');
  await expect(chart).toBeVisible();
  await expect(chart).toHaveAttribute('role', 'img');
  await expect(chart.locator('title')).toHaveText(/男女合计/);

  const age = Number(((await page.locator('.time-age').textContent()) ?? '').replace(/\D/g, ''));
  await expect(page.locator('.grid-cell')).toHaveCount(age + 1);

  const disclosure = page.locator('.cohort-section', { hasText: '生存曲线' }).locator('.hint');
  await expect(disclosure).toBeVisible();
  const text = (await disclosure.textContent()) ?? '';
  expect(text).toContain('2100');
  expect(text).toContain('B');
  expect(text).toContain('男女合计');
});

test('never changes the player timeline and keeps the four at the player age', async ({ page }) => {
  await startLife(page, '日本', '1978');
  const factsBefore = await page.locator('.fact').allTextContents();

  await openCohort(page);
  expect(await page.locator('.fact').allTextContents()).toEqual(factsBefore);

  await page.getByRole('button', { name: '下一年' }).click();
  await expect(page.locator('.time-age')).toHaveText('1 岁');

  const factsAfter = await page.locator('.fact').allTextContents();
  expect(factsAfter.length).toBeGreaterThan(factsBefore.length);
  expect(factsAfter.slice(0, factsBefore.length)).toEqual(factsBefore);

  const ages = await page.locator('.cohort-age').allTextContents();
  expect(ages).toHaveLength(4);
  for (const label of ages) {
    expect(label === '1' || label.includes('已故')).toBe(true);
  }
});

test('switches language without changing the numbers', async ({ page }) => {
  await startLife(page, '日本', '1978');
  await openCohort(page);
  const cells = await page.locator('.grid-cell').count();

  await page.getByRole('button', { name: 'English' }).click();
  await expect(page.getByRole('button', { name: 'Others born that day' })).toBeVisible();
  await expect(page.locator('.cohort-row')).toHaveCount(4);
  await expect(page.locator('.grid-cell')).toHaveCount(cells);
  await expect(page.locator('.survival-chart')).toBeVisible();

  const disclosure = page
    .locator('.cohort-section', { hasText: 'Survival curve' })
    .locator('.hint');
  const text = (await disclosure.textContent()) ?? '';
  expect(text).toContain('2100');
  expect(text).toContain('B');
  expect(text).toContain('both sexes');
});

test('computes the comparison locally instead of asking a server', async ({ page }) => {
  await startLife(page, '日本', '1978');
  const origin = new URL(page.url()).origin;
  const requests: string[] = [];
  page.on('request', (request) => requests.push(request.url()));

  await openCohort(page);
  // 第一次展开只需要本应用自己的国别代码块（五地出生人数加权；数据在本机，不访问任何数据服务）。
  expect(requests.length).toBeGreaterThan(0);
  expect(requests.every((url) => new URL(url).origin === origin)).toBe(true);
  expect(requests.every((url) => /^[^?]*\.js(\?.*)?$/.test(url))).toBe(true);

  // 收起再展开：此时数据已经在本机，展开到渲染完成没有任何网络请求。
  await page.getByRole('button', { name: '同龄对照' }).click();
  await expect(page.locator('.cohort-row')).toHaveCount(0);
  requests.length = 0;
  await openCohort(page);
  expect(requests).toEqual([]);
});

test('keeps the life grid inside a 320 px phone width', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await startLife(page, '日本', '1978');
  await openCohort(page);

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

test('shows varied life-grid categories and keeps ten cells per row on phones', async ({
  page,
}) => {
  test.setTimeout(90_000);
  await startLife(page, '日本', '1978');
  await advanceToAge(page, 20);
  await openCohort(page);

  const categories = await page
    .locator('.grid-cell')
    .evaluateAll((cells) => [
      ...new Set(cells.map((cell) => cell.getAttribute('data-category') ?? '')),
    ]);
  expect(categories.filter((category) => category !== 'none').length).toBeGreaterThanOrEqual(4);
  expect(categories).toContain('daily');
  expect(categories).toContain('decision');

  const legend = page.locator('.grid-legend');
  await expect(legend.locator(".grid-legend-item[data-category='decision']")).toHaveText(
    '人生决定',
  );
  await expect(legend.locator(".grid-legend-item[data-category='daily']")).toHaveText('日常');

  await page.getByRole('button', { name: 'English' }).click();
  await expect(legend.locator(".grid-legend-item[data-category='decision']")).toHaveText(
    'Life decisions',
  );
  await expect(legend.locator(".grid-legend-item[data-category='daily']")).toHaveText('Daily life');

  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 700 });
    await expect(page.locator('.grid-cell').first()).toBeVisible();
    const rows = await page.locator('.grid-cell').evaluateAll((cells) => {
      const counts = new Map<number, number>();
      for (const cell of cells) {
        const top = Math.round(cell.getBoundingClientRect().top);
        counts.set(top, (counts.get(top) ?? 0) + 1);
      }
      return [...counts.values()];
    });
    expect(rows.length).toBeGreaterThan(1);
    expect(Math.max(...rows)).toBeLessThanOrEqual(10);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  }
});

test('keeps the four out of the save file', async ({ page }) => {
  await startLife(page, '日本', '1978');
  const before = await page.evaluate(() => localStorage.getItem('lifesim.save.v1'));
  expect(before).not.toBeNull();

  await openCohort(page);

  const after = await page.evaluate(() => localStorage.getItem('lifesim.save.v1'));
  expect(after).toBe(before);
  const parsed = JSON.parse(after ?? '{}') as Record<string, unknown>;
  expect(Object.keys(parsed)).not.toContain('cohort');
  expect(after ?? '').not.toContain('#cohort');
});
