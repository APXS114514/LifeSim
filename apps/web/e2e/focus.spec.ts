import { expect, test, type Page } from '@playwright/test';

/** 测试夹具：固定出生种子并关闭人生节点反思，让本组用例只关注年度重点（M3-037B）。 */
async function startFixedLife(page: Page): Promise<void> {
  await page.addInitScript(() => {
    if (localStorage.getItem('lifesim.prefs.v1') === null)
      localStorage.setItem(
        'lifesim.prefs.v1',
        JSON.stringify({
          version: 1,
          lifeLengthMinutes: 30,
          pace: 1,
          reflections: { enabled: false, skipDuringAutoPlay: true },
        }),
      );
    Object.defineProperty(globalThis.crypto, 'randomUUID', {
      value: () => 'focus-ui-0',
      configurable: true,
    });
  });
  await page.goto('/');
  await page.getByRole('group', { name: '出生地区' }).getByRole('radio', { name: '日本' }).check();
  await page.getByRole('radio', { name: '指定年份' }).check();
  await page.getByLabel('年份', { exact: true }).fill('1978');
  await page.getByRole('button', { name: '开始人生' }).click();
  await expect(page.getByRole('heading', { name: '人生时间线' })).toBeVisible();
}

const healthByPreset = '这一年以健康为重点（按预设';

test('sets a standing yearly focus from the next birthday and keeps it across a reload', async ({
  page,
}) => {
  await startFixedLife(page);
  const panel = page.getByRole('region', { name: '年度重点' });
  await expect(panel.locator('.focus-current')).toHaveText(/^今年（0 岁）：.+ · 按人生原则$/);
  const fromAgeOne = panel.getByRole('group', { name: '从 1 岁起的重点' });
  await expect(fromAgeOne.getByRole('radio', { name: '按人生原则' })).toBeChecked();
  // 1 岁还不能学习：可以选（软预设），但标明按目前状态不可选。
  await expect(fromAgeOne.getByRole('radio', { name: /学习/ })).toBeEnabled();
  await expect(fromAgeOne.getByText('按目前状态还不可选')).toHaveCount(2);

  await fromAgeOne.getByRole('radio', { name: '健康' }).check();
  await page.getByRole('button', { name: '下一年' }).click();
  await expect(page.locator('.time-age')).toHaveText('1 岁');
  await expect(panel.locator('.focus-current')).toHaveText('今年（1 岁）：健康 · 按预设');
  await expect(page.locator('.fact', { hasText: healthByPreset })).toHaveCount(1);
  await page.getByRole('button', { name: '下一年' }).click();
  await expect(page.locator('.fact', { hasText: healthByPreset })).toHaveCount(2);

  await page.reload();
  const fromAgeThree = page.getByRole('group', { name: '从 3 岁起的重点' });
  await expect(fromAgeThree.getByRole('radio', { name: '健康' })).toBeChecked();

  // 改回按人生原则：之后的年份不再按预设，已经过去的两年保持原样。
  await fromAgeThree.getByRole('radio', { name: '按人生原则' }).check();
  await page.getByRole('button', { name: '下一年' }).click();
  await expect(page.locator('.time-age')).toHaveText('3 岁');
  await expect(panel.locator('.focus-current')).toHaveText(/^今年（3 岁）：.+ · 按人生原则$/);
  await expect(page.locator('.fact', { hasText: healthByPreset })).toHaveCount(2);
  const presets = await page.evaluate(() => {
    const save = JSON.parse(localStorage.getItem('lifesim.save.v1')!) as {
      snapshot: { schedulerState: { presets?: Record<string, string> } };
    };
    return save.snapshot.schedulerState.presets ?? {};
  });
  expect(presets).toEqual({});
});

test('locks the focus while playing and explains the effects in English', async ({ page }) => {
  await startFixedLife(page);
  const health = page
    .getByRole('region', { name: '年度重点' })
    .getByRole('radio', { name: '健康' });
  await page.getByRole('button', { name: '播放', exact: true }).click();
  await expect(health).toBeDisabled();
  await expect(page.getByText('暂停后可以调整。')).toBeVisible();
  await page.getByRole('button', { name: '暂停', exact: true }).click();
  await expect(health).toBeEnabled();

  await page.getByRole('button', { name: 'English', exact: true }).click();
  const panel = page.getByRole('region', { name: 'Yearly focus' });
  await expect(panel.getByRole('radio', { name: 'Follow life principles' })).toBeChecked();
  await panel.getByText('About the effects').click();
  const work = panel.getByRole('row', { name: /^Work/ });
  await expect(work.getByRole('cell')).toHaveText(['−5%', '+15%', '−15%', '+10%', '+3', '—']);
  await expect(panel.getByText(/not statistical findings/)).toBeVisible();
  // 展开的效果表在自己的框里横向滚动，不撑宽手机页面。
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    ),
  ).toBe(0);
});
