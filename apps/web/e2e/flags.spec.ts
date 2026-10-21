import { expect, test, type Page } from '@playwright/test';

async function openCreation(page: Page): Promise<void> {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
}

async function startLife(page: Page, region: string, year: string): Promise<void> {
  await openCreation(page);
  await page.getByRole('radio', { name: region }).check();
  await page.getByRole('radio', { name: '指定年份' }).check();
  await page.getByLabel('年份', { exact: true }).fill(year);
  await page.getByRole('button', { name: '开始人生' }).click();
  await expect(page.locator('.character-card')).toBeVisible();
}

test('serves the flag assets and shows one flag per launch region', async ({ page, request }) => {
  await openCreation(page);
  await expect(page.locator('.choice .polity-flag')).toHaveCount(5);

  for (const file of [
    'cn-prc.svg',
    'jp-japan.svg',
    'kp-dprk.svg',
    'kr-rok.svg',
    'ru-russian-federation.svg',
    'ussr-1936.svg',
    'ussr-1955.svg',
  ]) {
    const response = await request.get('/flags/' + file);
    expect(response.status(), file).toBe(200);
    expect(response.headers()['content-type'], file).toContain('svg');
  }
});

test('uses the historical flag for the selected birth year', async ({ page }) => {
  await openCreation(page);
  await page.getByRole('radio', { name: '俄罗斯（含苏联时期）' }).check();
  await page.getByRole('radio', { name: '指定年份' }).check();

  const year = page.getByLabel('年份', { exact: true });
  const russiaFlag = page.locator('.choice', { hasText: '俄罗斯' }).locator('.polity-flag');

  await year.fill('1950');
  await expect(russiaFlag).toHaveAttribute('src', /ussr-1936\.svg$/);
  await year.fill('1970');
  await expect(russiaFlag).toHaveAttribute('src', /ussr-1955\.svg$/);
  await year.fill('2000');
  await expect(russiaFlag).toHaveAttribute('src', /ru-russian-federation\.svg$/);
});

test('shows the birth-time and current historical flags next to the character', async ({
  page,
}) => {
  await startLife(page, '俄罗斯（含苏联时期）', '1970');
  await expect(page.locator('.birth-flag .polity-flag')).toHaveAttribute('src', /ussr-1955\.svg$/);
  await expect(page.locator('.region-flag .polity-flag')).toHaveAttribute(
    'src',
    /(ussr-1955|ru-russian-federation)\.svg$/,
  );

  await startLife(page, '俄罗斯（含苏联时期）', '1990');
  await expect(page.locator('.birth-flag .polity-flag')).toHaveAttribute('src', /ussr-1955\.svg$/);

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
