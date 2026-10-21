import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';

async function start(page: Page, region = '日本', year = '1978'): Promise<void> {
  await page.addInitScript(() => {
    Object.defineProperty(crypto, 'randomUUID', { value: () => 'probe-0' });
  });
  await page.goto('/');
  await page.getByRole('radio', { name: region, exact: true }).check();
  await page.getByRole('radio', { name: '指定年份' }).check();
  await page.getByLabel('年份', { exact: true }).fill(year);
  await page.getByRole('button', { name: '开始人生', exact: true }).click();
  await expect(page.getByRole('heading', { name: '人生时间线' })).toBeVisible();
}

test('reports a failed autosave, exports current progress and retries without losing the old save', async ({
  page,
}) => {
  await start(page);
  const previous = await page.evaluate(() => localStorage.getItem('lifesim.save.v1'));
  // 测试夹具：只让保存失败，读取与已有存档保持可用。
  await page.evaluate(() => {
    const writeLocal = localStorage.setItem.bind(localStorage);
    const writeSession = sessionStorage.setItem.bind(sessionStorage);
    Storage.prototype.setItem = function (key, value) {
      if (key === 'lifesim.save.v1' && !sessionStorage.getItem('fixture-storage-recovered')) {
        throw new DOMException('fixture-quota', 'QuotaExceededError');
      }
      (this === localStorage ? writeLocal : writeSession)(key, value);
    };
  });
  await page.getByRole('button', { name: '下一年', exact: true }).click();
  const warning = page.getByRole('alert');
  await expect(warning).toContainText('当前进度尚未保存');
  expect(await page.evaluate(() => localStorage.getItem('lifesim.save.v1'))).toBe(previous);
  await expect(
    page.getByText('自动保存在本机浏览器；清理站点数据会丢失。', { exact: true }),
  ).toHaveCount(0);
  const downloadEvent = page.waitForEvent('download');
  await warning.getByRole('button', { name: '导出当前进度' }).click();
  const download = await downloadEvent;
  const path = await download.path();
  expect(path).not.toBeNull();
  const backup = JSON.parse(await readFile(path, 'utf8')) as { snapshot: { at: string } };
  const currentDate = await page.locator('.time-date').innerText();
  expect(backup.snapshot.at).toBe(currentDate);
  await warning.getByRole('button', { name: '重试保存' }).click();
  await expect(warning).toBeVisible();
  await page.getByRole('button', { name: 'English' }).click();
  await expect(warning).toContainText('Current progress has not been saved');
  await page.evaluate(() => sessionStorage.setItem('fixture-storage-recovered', 'true'));
  await warning.getByRole('button', { name: 'Retry saving' }).click();
  await expect(warning).toHaveCount(0);
  await page.reload();
  await expect(page.locator('.time-date')).toHaveText(currentDate);
});

test('warns when the very first save cannot be written', async ({ page }) => {
  await page.addInitScript(() => {
    Storage.prototype.setItem = () => {
      throw new DOMException('fixture-quota', 'QuotaExceededError');
    };
  });
  await start(page);
  await expect(page.getByRole('alert')).toContainText('当前进度尚未保存');
  expect(await page.evaluate(() => localStorage.getItem('lifesim.save.v1'))).toBeNull();
});

test('updates the identity currency after the 1998 rouble redenomination', async ({ page }) => {
  await start(page, '俄罗斯（含苏联时期）', '1970');
  await expect(page.locator('.character-card')).toContainText('卢布（1961—1997）');
  await page.getByRole('button', { name: '直接模拟至结局', exact: true }).click();
  await page.getByRole('button', { name: '确认直接模拟至结局' }).click();
  await expect(page.getByRole('heading', { name: '一生总结' })).toBeVisible();
  await expect(page.locator('.character-card')).toContainText('俄罗斯卢布');
  await expect(page.locator('.character-card')).not.toContainText('卢布（1961—1997）');
});
