import { expect, test, type Page } from '@playwright/test';

/** 固定种子是显示层夹具，不改变模拟规则。 */
async function startLife(page: Page): Promise<void> {
  await page.addInitScript(() => {
    Object.defineProperty(globalThis.crypto, 'randomUUID', {
      value: () => 'probe-0',
      configurable: true,
    });
  });
  await page.goto('/');
  await page.getByRole('group', { name: '出生地区' }).getByRole('radio', { name: '日本' }).check();
  await page.getByRole('radio', { name: '指定年份' }).check();
  await page.getByLabel('年份', { exact: true }).fill('1978');
  await page.getByRole('button', { name: '开始人生' }).click();
  await expect(page.locator('.indicators')).toBeVisible();
}

async function values(page: Page): Promise<string[]> {
  return page
    .locator('.indicators [data-indicator]')
    .evaluateAll((elements) =>
      elements.map((element) => element.getAttribute('aria-valuenow') ?? ''),
    );
}

test('shows five accessible derived values, missing income and disclosed assumptions', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await startLife(page);
  const panel = page.locator('.indicators');
  await expect(panel.getByRole('progressbar')).toHaveCount(5);
  const labels = ['健康', '幸福', '知识', '人际', '经济'];
  for (const label of labels) {
    const bar = panel.getByRole('progressbar', { name: label, exact: true });
    await expect(bar).toHaveAttribute('aria-valuemin', '0');
    await expect(bar).toHaveAttribute('aria-valuemax', '100');
    const percent = Number(await bar.getAttribute('aria-valuenow'));
    expect(Number.isInteger(percent)).toBe(true);
    expect(percent).toBeGreaterThanOrEqual(0);
    expect(percent).toBeLessThanOrEqual(100);
    await expect(bar.locator('.indicator-value')).toHaveText(String(percent));
  }
  await expect(panel.locator('[data-field="income"] dd')).toHaveText('—');
  await panel.locator('.indicator-about summary').click();
  await expect(panel.locator('.indicator-about')).toContainText('D 级设计假设');
  await expect(panel.locator('[data-indicator-note]')).toHaveCount(5);
  expect(errors).toEqual([]);
});

test('increases knowledge on primary school entry without advancing extra time', async ({
  page,
}) => {
  await startLife(page);
  const before = Number(
    await page.locator('[data-indicator="knowledge"]').getAttribute('aria-valuenow'),
  );
  let years = 0;
  while (
    years < 12 &&
    !(await page.locator('[data-field="education"]').innerText()).includes('小学')
  ) {
    await page.getByRole('button', { name: '下一年' }).click();
    years += 1;
  }
  await expect(page.locator('[data-field="education"]')).toContainText('小学');
  expect(
    Number(await page.locator('[data-indicator="knowledge"]').getAttribute('aria-valuenow')),
  ).toBeGreaterThan(before);
  await expect(page.locator('.time-age')).toHaveText(`${years} 岁`);
  await expect(page.locator('.age-number')).toHaveText(String(years));
});

test('switches languages without changing indicators or the autosave', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await startLife(page);
  const before = await values(page);
  const saved = await page.evaluate(() => localStorage.getItem('lifesim.save.v1'));
  await page.getByRole('button', { name: 'English' }).click();
  await expect(
    page.locator('.indicators').getByRole('heading', { name: 'Character status' }),
  ).toBeVisible();
  await expect(
    page.locator('.indicators').getByRole('progressbar', { name: 'Health', exact: true }),
  ).toBeVisible();
  expect(await values(page)).toEqual(before);
  expect(await page.evaluate(() => localStorage.getItem('lifesim.save.v1'))).toBe(saved);
  await page.getByRole('button', { name: '中文', exact: true }).click();
  expect(await values(page)).toEqual(before);
  expect(await page.evaluate(() => localStorage.getItem('lifesim.save.v1'))).toBe(saved);
  expect(errors).toEqual([]);
});

test('wraps the panel and its expanded explanations at 320 pixels', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await startLife(page);
  await page.locator('.indicator-about summary').click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    ),
  ).toBeLessThanOrEqual(0);
  await page.getByRole('button', { name: 'English' }).click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    ),
  ).toBeLessThanOrEqual(0);
});
