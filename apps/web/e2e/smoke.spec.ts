import { expect, test, type Page } from '@playwright/test';

function collectConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  return errors;
}

test('the character creation sketch works in zh-Hans and keeps choices across a language switch', async ({
  page,
}) => {
  const errors = collectConsoleErrors(page);
  await page.goto('/');

  await expect(page.getByRole('heading', { level: 1, name: '人生模拟器' })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-Hans');

  const regions = page.getByRole('group', { name: '出生地区' });
  for (const name of ['随机', '中国大陆', '日本', '朝鲜', '韩国', '俄罗斯（含苏联时期）']) {
    await expect(regions.getByRole('radio', { name })).toBeVisible();
  }

  await regions.getByRole('radio', { name: '日本' }).check();
  await page.getByRole('radio', { name: '指定年份' }).check();
  await page.getByLabel('年份', { exact: true }).fill('1978');
  await expect(page.getByText('日本 · 1978 年')).toBeVisible();

  // M0 没有模拟内核：开始按钮必须不可用，并说明原因。
  await expect(page.getByRole('button', { name: '开始人生' })).toBeDisabled();
  await expect(page.getByText('需要 M1 模拟内核')).toBeVisible();

  await page.getByRole('button', { name: 'English' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'LifeSim' })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  // 切换语言只重绘文本，不改变已选状态。
  await expect(page.getByRole('radio', { name: 'Japan' })).toBeChecked();
  await expect(page.getByText('Japan · 1978')).toBeVisible();

  expect(errors).toEqual([]);
});

test('years outside 1950–2026 are flagged', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('radio', { name: '指定年份' }).check();

  const year = page.getByLabel('年份', { exact: true });
  await year.fill('1949');
  await expect(page.getByRole('alert')).toHaveText('请输入 1950—2026 之间的年份');
  await expect(year).toHaveAttribute('aria-invalid', 'true');

  await year.fill('2026');
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('the layout never scrolls sideways', async ({ page }) => {
  await page.goto('/');
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
