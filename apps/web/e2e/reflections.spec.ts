import { expect, test, type Page } from '@playwright/test';

async function start(page: Page): Promise<void> {
  await page.addInitScript(() => {
    Object.defineProperty(crypto, 'randomUUID', { value: () => 'probe-0' });
  });
  await page.goto('/');
  await page.getByRole('radio', { name: '日本', exact: true }).check();
  await page.getByRole('radio', { name: '指定年份' }).check();
  await page.getByLabel('年份', { exact: true }).fill('1978');
  await page.getByRole('button', { name: '开始人生', exact: true }).click();
  await expect(page.locator('.time-controls')).toBeVisible();
}
async function step(page: Page, years: number): Promise<void> {
  for (let age = 0; age < years; age += 1)
    await page.getByRole('button', { name: '下一年', exact: true }).click();
}
async function finish(page: Page): Promise<void> {
  await page.getByRole('button', { name: '直接模拟至结局', exact: true }).click();
  await page.getByRole('button', { name: '确认直接模拟至结局', exact: true }).click();
  await expect(page.getByRole('heading', { name: '一生总结', exact: true })).toBeVisible();
}

test('answers a node once, blocks controls and restores the local answer in the summary', async ({
  page,
}) => {
  await start(page);
  await step(page, 5);
  const card = page.locator('.reflection-card');
  await expect(card.getByRole('heading')).toContainText('5 岁');
  for (const name of ['下一年', '播放', '跳转到下一个决定', '直接模拟至结局'])
    await expect(page.getByRole('button', { name, exact: true })).toBeDisabled();
  await page.locator('body').press('Space');
  await expect(page.locator('.time-status')).toHaveText('已暂停');
  await card.locator('.reflection-option').first().click();
  await expect(card).toHaveCount(0);
  await expect(page.getByRole('button', { name: '下一年', exact: true })).toBeEnabled();
  await page.reload();
  await expect(card).toHaveCount(0);
  await finish(page);
  await expect(page.locator('.reflection-review')).toContainText('人生里留下的话');
  await expect(page.locator('.reflection-review')).toContainText('家里');
});

test('disabled reflections do not pause or record and remain disabled after refresh', async ({
  page,
}) => {
  await start(page);
  await page.getByLabel('人生节点反思', { exact: true }).uncheck();
  await expect(page.getByLabel('自动播放时跳过', { exact: true })).toBeDisabled();
  await step(page, 6);
  await expect(page.locator('.reflection-card')).toHaveCount(0);
  await page.reload();
  await expect(page.getByLabel('人生节点反思', { exact: true })).not.toBeChecked();
  expect(
    await page.evaluate(
      () =>
        (JSON.parse(localStorage.getItem('lifesim.save.v1') ?? '{}') as { reflections: unknown })
          .reflections,
    ),
  ).toEqual([]);
});

test('autoplay skips by default and pauses at the next node when skipping is off', async ({
  page,
}) => {
  await start(page);
  await page.getByLabel('一生时长', { exact: true }).selectOption('10');
  await page.getByLabel('速度', { exact: true }).selectOption('16');
  await page.getByRole('button', { name: '播放', exact: true }).click();
  await expect
    .poll(async () => Number((await page.locator('.time-age').innerText()).replace(/\D/g, '')), {
      timeout: 12000,
    })
    .toBeGreaterThanOrEqual(6);
  await expect(page.locator('.reflection-card')).toHaveCount(0);
  await page.getByRole('button', { name: '暂停', exact: true }).click();
  expect(
    await page.evaluate(
      () =>
        (JSON.parse(localStorage.getItem('lifesim.save.v1') ?? '{}') as { reflections: unknown })
          .reflections,
    ),
  ).toMatchObject([{ node: 5, status: 'skipped', option: null, note: null }]);
  await page.getByLabel('自动播放时跳过', { exact: true }).uncheck();
  await page.getByRole('button', { name: '播放', exact: true }).click();
  await expect(page.locator('.reflection-card')).toBeVisible({ timeout: 12000 });
  await expect(page.locator('.reflection-card h2')).toContainText('15 岁');
  await expect(page.locator('.time-status')).toHaveText('已暂停');
  await page.getByRole('button', { name: '不回答，继续', exact: true }).click();
  await finish(page);
  await expect(page.locator('.reflection-review')).toContainText('那一年没有留下话');
});

test('saves optional words locally with Enter without network requests and escapes them in review', async ({
  page,
}) => {
  await start(page);
  await step(page, 5);
  const requests: string[] = [];
  page.on('request', (request) => requests.push(request.url()));
  await page.getByLabel('留一句话（可选）', { exact: true }).fill('  <script>🌱</script>  ');
  await page.getByLabel('留一句话（可选）', { exact: true }).press('Enter');
  await expect(page.locator('.reflection-card')).toHaveCount(0);
  expect(requests).toEqual([]);
  await page.reload();
  await expect(page.locator('.reflection-card')).toHaveCount(0);
  await finish(page);
  await expect(page.locator('.reflection-review')).toContainText('<script>🌱</script>');
  await page.getByRole('button', { name: 'English', exact: true }).click();
  await expect(page.locator('.reflection-review')).toContainText('What was left behind');
  expect(await page.locator('.reflection-review script').count()).toBe(0);
});

test('restores an unanswered node and preserves an answer in memory when saving fails', async ({
  page,
}) => {
  await start(page);
  await step(page, 5);
  await page.reload();
  await expect(page.locator('.reflection-card')).toBeVisible();
  await page.evaluate(() => {
    const write = localStorage.setItem.bind(localStorage);
    Storage.prototype.setItem = function (key, value) {
      if (key === 'lifesim.save.v1') throw new DOMException('fixture-quota', 'QuotaExceededError');
      write(key, value);
    };
  });
  await page.locator('.reflection-option').first().click();
  await expect(page.locator('.reflection-card')).toHaveCount(0);
  await expect(page.getByRole('alert')).toContainText('当前进度尚未保存');
  await expect(
    page.getByText('自动保存在本机浏览器；清理站点数据会丢失。', { exact: true }),
  ).toHaveCount(0);
});
