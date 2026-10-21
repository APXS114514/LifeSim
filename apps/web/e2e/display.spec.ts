import { expect, test, type Page } from '@playwright/test';

/** 测试夹具：固定出生种子，让显示层的断言不受随机出生日期影响。 */
async function freezeSeed(page: Page, seed = 'probe-0'): Promise<void> {
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
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole('radio', { name: region }).check();
  await page.getByRole('radio', { name: '指定年份' }).check();
  await page.getByLabel('年份', { exact: true }).fill(year);
  await page.getByRole('button', { name: '开始人生' }).click();
  await expect(page.getByRole('heading', { name: '人生时间线' })).toBeVisible();
}

test('shows the Soviet Union for an early life and the Russian Federation afterwards', async ({
  page,
}) => {
  await startLife(page, '俄罗斯（含苏联时期）', '1970');
  const card = page.locator('.character-card');
  await expect(card).toContainText('苏联');
  await expect(card).toContainText('出生地');
  await expect(card).toContainText('现居地');
  await expect(card).toContainText('政治归属');
  await expect(card).toContainText('国籍');

  await startLife(page, '俄罗斯（含苏联时期）', '1990');
  // M3-034 起开局停在出生日（1990 年仍是苏联）；逐年推进到苏联解体之后再断言显示层随历史改变。
  for (let step = 0; step < 5; step += 1) {
    await page.getByRole('button', { name: '下一年' }).click();
  }
  await expect(page.locator('.character-card')).toContainText('俄罗斯联邦');
});

test('long polity names do not break the mobile layout', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await startLife(page, '朝鲜', '1980');
  await expect(page.locator('.character-card')).toContainText('朝鲜民主主义人民共和国');
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
