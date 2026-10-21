import { expect, test, type Page } from '@playwright/test';

/**
 * M4-022 UI-01：#66CCFF 主题、档案身份卡与布局。只做结构与计算样式断言；
 * 像素级截图不进 CI（不同系统的字体渲染不同），由人工在 Game-Miscellaneous/_verify-lifesim-ui 比对。
 */

async function freezeSeed(page: Page, seed = 'probe-0'): Promise<void> {
  await page.addInitScript((value: string) => {
    Object.defineProperty(globalThis.crypto, 'randomUUID', {
      value: () => value,
      configurable: true,
    });
  }, seed);
}

async function startJapan1978(page: Page): Promise<void> {
  await freezeSeed(page);
  await page.goto('/');
  await page.getByRole('group', { name: '出生地区' }).getByRole('radio', { name: '日本' }).check();
  await page.getByRole('radio', { name: '指定年份' }).check();
  await page.getByLabel('年份', { exact: true }).fill('1978');
  await page.getByRole('button', { name: '开始人生' }).click();
  await expect(page.getByRole('heading', { name: '人生时间线' })).toBeVisible();
}

async function expectNoHorizontalScroll(page: Page): Promise<void> {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

test('uses #66CCFF with dark text on the primary action', async ({ page }) => {
  await page.goto('/');
  // 生产构建会把 #66ccff 压缩成 #6cf，所以比较解析后的颜色。
  const primary = await page.evaluate(() => {
    const probe = document.createElement('span');
    probe.style.color = 'var(--color-primary)';
    document.body.append(probe);
    const color = getComputedStyle(probe).color;
    probe.remove();
    return color;
  });
  expect(primary).toBe('rgb(102, 204, 255)');
  const start = page.getByRole('button', { name: '开始人生' });
  await expect(start).toHaveCSS('background-color', 'rgb(102, 204, 255)');
  const color = await start.evaluate((element) => getComputedStyle(element).color);
  expect(color).not.toBe('rgb(255, 255, 255)');
});

test('shows the identity record with a pixel portrait and real derived meters', async ({
  page,
}) => {
  await startJapan1978(page);
  const card = page.locator('.character-card');
  await expect(card.locator('.archive-bar')).toContainText('身份档案');
  await expect(card.locator('.archive-number')).toHaveText(/^JP-1978-[0-9A-F]{7}$/);
  await expect(card.locator('.avatar-tile svg.pixel-art rect').first()).toBeAttached();
  // M4-016：五条状态条展示真实派生值，数值与可访问性语义一致。
  const status = page.locator('.status-panel');
  await expect(status.locator('.meter.is-pending')).toHaveCount(0);
  await expect(status.getByRole('progressbar')).toHaveCount(5);
  for (const bar of await status.getByRole('progressbar').all()) {
    const percent = Number(await bar.getAttribute('aria-valuenow'));
    expect(Number.isInteger(percent)).toBe(true);
    expect(percent).toBeGreaterThanOrEqual(0);
    expect(percent).toBeLessThanOrEqual(100);
    await expect(bar).toHaveAttribute('aria-valuemin', '0');
    await expect(bar).toHaveAttribute('aria-valuemax', '100');
    await expect(bar.locator('.indicator-value')).toHaveText(String(percent));
  }
  // 真实字段：出生日是「无学历 · 儿童」，入学后变成「在读」。
  await expect(status).toContainText('无学历');
  await expect(status).toContainText('儿童');
  for (let year = 0; year < 8; year += 1) {
    await page.getByRole('button', { name: '下一年' }).click();
  }
  await expect(page.locator('.time-age')).toHaveText('8 岁');
  await expect(status).toContainText('在读');
});

test('keeps every page free of horizontal scrolling from phone to desktop', async ({ page }) => {
  for (const width of [320, 390, 768, 1280]) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto('/');
    await expectNoHorizontalScroll(page);
  }
  await startJapan1978(page);
  await page.getByRole('button', { name: '跳转到下一个决定' }).click();
  await expect(page.locator('.decision-card')).toBeVisible();
  for (const width of [320, 390, 768, 1280]) {
    await page.setViewportSize({ width, height: 800 });
    await expectNoHorizontalScroll(page);
  }
});
