import { expect, test, type Page } from '@playwright/test';

function collectConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  return errors;
}

async function startLife(page: Page, region: string, year: string): Promise<void> {
  await page.goto('/');
  const regions = page.getByRole('group', { name: '出生地区' });
  await regions.getByRole('radio', { name: region }).check();
  await page.getByRole('radio', { name: '指定年份' }).check();
  await page.getByLabel('年份', { exact: true }).fill(year);
  await page.getByRole('button', { name: '开始人生' }).click();
  await expect(page.getByRole('heading', { name: '人生时间线' })).toBeVisible();
  await expect(page.locator('.fact').first()).toBeVisible();
}

test('starts a real life and keeps the same facts across a language switch', async ({ page }) => {
  const errors = collectConsoleErrors(page);
  await startLife(page, '日本', '1978');

  await expect(page.getByRole('heading', { level: 1, name: '人生模拟器' })).toBeVisible();
  await expect(page.getByText(/出生在/).first()).toBeVisible();
  const before = await page.locator('.fact').count();

  await page.getByRole('button', { name: 'English' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'LifeSim' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Life timeline' })).toBeVisible();
  await expect(page.getByText(/Born into/).first()).toBeVisible();
  await expect(page.locator('.fact')).toHaveCount(before);

  const saved = await page.evaluate(() => localStorage.getItem('lifesim.save.v1'));
  expect(saved).not.toBeNull();
  expect(errors).toEqual([]);
});

test('can auto-run a life to death, show the summary and start over', async ({ page }) => {
  const errors = collectConsoleErrors(page);
  await startLife(page, '日本', '1978');

  const summary = page.getByRole('heading', { name: '一生总结' });
  for (let round = 0; round < 20 && (await summary.count()) === 0; round += 1) {
    const option = page.locator('.decision-option:not([disabled])').first();
    if ((await option.count()) > 0) {
      await option.click();
      continue;
    }
    const finish = page.getByRole('button', { name: '自动到死亡' });
    if ((await finish.count()) > 0) {
      await finish.click();
      continue;
    }
    await page.getByRole('button', { name: '继续' }).click();
  }
  await expect(summary).toBeVisible();
  await expect(page.getByText('寿命')).toBeVisible();

  await page.getByRole('button', { name: '开始新人生' }).first().click();
  await expect(page.getByRole('heading', { name: '出生设置' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('reloads the autosave and shows the same timeline', async ({ page }) => {
  await startLife(page, '日本', '1978');
  const before = await page.locator('.fact').count();
  await page.reload();
  await expect(page.getByText('已恢复上次自动存档。')).toBeVisible();
  await expect(page.getByRole('heading', { name: '人生时间线' })).toBeVisible();
  await expect(page.locator('.fact')).toHaveCount(before);
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

test('the play layout never scrolls sideways', async ({ page }) => {
  await startLife(page, '日本', '1978');
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

test('keeps an incompatible save, offers a backup and clears only after confirmation', async ({
  page,
}) => {
  await startLife(page, '日本', '1978');
  const raw = await page.evaluate(() => localStorage.getItem('lifesim.save.v1'));
  expect(raw).not.toBeNull();
  const mutated = JSON.parse(raw ?? '{}') as { snapshot: { engineVersion: string } };
  // 模拟 M3-001 升级 SYSTEMS_VERSION 之后的旧存档：规则版本不同。
  mutated.snapshot.engineVersion = '0.0.0';
  await page.evaluate((value) => {
    localStorage.setItem('lifesim.save.v1', JSON.stringify(value));
  }, mutated);

  await page.reload();
  await expect(page.getByRole('heading', { name: '上次的存档无法读取' })).toBeVisible();
  await expect(page.getByText(/旧版本/)).toBeVisible();

  const keys = await page.evaluate(() => ({
    primary: localStorage.getItem('lifesim.save.v1'),
    preserved: localStorage.getItem('lifesim.save.v1.preserved'),
  }));
  expect(keys.primary).not.toBeNull();
  expect(keys.preserved).toBe(keys.primary);

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: '下载原始存档' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('lifesim-save-backup.json');

  await page.getByRole('button', { name: '清除存档并开新局' }).click();
  await page.getByRole('button', { name: '再次点击以确认清除（不可恢复）' }).click();
  await expect(page.getByRole('heading', { name: '出生设置' })).toBeVisible();

  const after = await page.evaluate(() => ({
    primary: localStorage.getItem('lifesim.save.v1'),
    preserved: localStorage.getItem('lifesim.save.v1.preserved'),
  }));
  expect(after.primary).toBeNull();
  expect(after.preserved).toBeNull();
});

test('keeps a corrupt save instead of deleting it silently', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    localStorage.setItem('lifesim.save.v1', '{not json');
  });
  await page.reload();

  await expect(page.getByRole('heading', { name: '上次的存档无法读取' })).toBeVisible();
  await expect(page.getByText(/已损坏或格式不正确/)).toBeVisible();

  const keys = await page.evaluate(() => ({
    primary: localStorage.getItem('lifesim.save.v1'),
    preserved: localStorage.getItem('lifesim.save.v1.preserved'),
  }));
  expect(keys.primary).toBe('{not json');
  expect(keys.preserved).toBe('{not json');
});
