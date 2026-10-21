import { expect, test, type Page } from '@playwright/test';

function collectConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  return errors;
}

/**
 * 测试夹具：固定出生种子。随机种子会抽到「一生没有重大决定」的人生（日语地区约 37%），
 * 那类人生的快进会直接到死亡，无法验证「停在决定前」。
 */
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
    const finish = page.getByRole('button', { name: '直接模拟至结局', exact: true });
    if ((await finish.count()) > 0) {
      await finish.click();
      await page.getByRole('button', { name: '确认直接模拟至结局' }).click();
      continue;
    }
    const fastForward = page.getByRole('button', { name: '跳转到下一个决定' });
    if ((await fastForward.count()) > 0) {
      await fastForward.click();
      continue;
    }
    await page.getByRole('button', { name: '下一年' }).click();
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

test('starts paused on the birth day and steps one year at a time', async ({ page }) => {
  const errors = collectConsoleErrors(page);
  await startLife(page, '日本', '1978');

  await expect(page.getByText('已暂停')).toBeVisible();
  await expect(page.locator('.time-age')).toHaveText('0 岁');
  await expect(page.locator('.decision-card')).toHaveCount(0);

  const before = await page.locator('.fact').allTextContents();
  await page.getByRole('button', { name: '下一年' }).click();
  await expect(page.locator('.time-age')).toHaveText('1 岁');
  await expect(page.locator('.time-date')).toHaveText(/^1979-/);

  // 已经显示的事实原样保留，只追加新的一年。
  const after = await page.locator('.fact').allTextContents();
  expect(after.slice(0, before.length)).toEqual(before);
  expect(errors).toEqual([]);
});

test('plays at the fastest speed and keeps the age still while paused', async ({ page }) => {
  await startLife(page, '日本', '1978');
  await page.getByLabel('速度').selectOption('16');
  await page.getByRole('button', { name: '播放' }).click();
  await expect(page.getByText('播放中')).toBeVisible();
  await page.waitForTimeout(1200);
  await page.getByRole('button', { name: '暂停' }).click();
  await expect(page.getByText('已暂停')).toBeVisible();

  const age = await page.locator('.time-age').textContent();
  await page.waitForTimeout(1500);
  await expect(page.locator('.time-age')).toHaveText(age ?? '');
});

test('stops at a major decision and does not skip years after the choice', async ({ page }) => {
  await startLife(page, '日本', '1978');
  await page.getByRole('button', { name: '跳转到下一个决定' }).click();

  await expect(page.getByText('等待你的决定')).toBeVisible();
  await expect(page.locator('.decision-card')).toBeVisible();
  await expect(page.getByRole('button', { name: '下一年' })).toBeDisabled();
  await expect(page.getByRole('button', { name: '跳转到下一个决定' })).toBeDisabled();

  const ageBefore = Number((await page.locator('.time-age').textContent())?.replace(/\D/g, ''));
  await page.locator('.decision-option:not([disabled])').first().click();
  await expect(page.locator('.decision-card')).toHaveCount(0);
  await expect(page.getByText('已暂停')).toBeVisible();

  const ageAfter = Number((await page.locator('.time-age').textContent())?.replace(/\D/g, ''));
  expect(ageAfter - ageBefore).toBeLessThanOrEqual(1);
});

test('simulating to the end asks for confirmation first', async ({ page }) => {
  await startLife(page, '日本', '1978');
  await page.getByRole('button', { name: '直接模拟至结局', exact: true }).click();
  await expect(page.getByRole('button', { name: '确认直接模拟至结局' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '一生总结' })).toHaveCount(0);
  await expect(page.getByText('剩余的重大决定将按人生原则自动选择。')).toBeVisible();

  await page.getByRole('button', { name: '确认直接模拟至结局' }).click();
  await expect(page.getByRole('heading', { name: '一生总结' })).toBeVisible();
});

test('restores paused after reloading during playback', async ({ page }) => {
  await startLife(page, '日本', '1978');
  await page.getByLabel('速度').selectOption('16');
  await page.getByRole('button', { name: '播放' }).click();
  await page.waitForTimeout(900);

  const saved = await page.evaluate(() => localStorage.getItem('lifesim.save.v1'));
  expect(saved).not.toBeNull();
  const save = JSON.parse(saved ?? '{}') as {
    snapshot: { at: string };
    facts: { type: string }[];
  };
  const expectedRows = save.facts.filter((fact) => fact.type !== 'finance.settlement').length;

  await page.reload();
  await expect(page.getByText('已恢复上次自动存档。')).toBeVisible();
  await expect(page.getByText('已暂停')).toBeVisible();
  await expect(page.locator('.time-date')).toHaveText(save.snapshot.at);
  await expect(page.locator('.fact')).toHaveCount(expectedRows);
});

test('switches the time control copy without changing the facts', async ({ page }) => {
  await startLife(page, '日本', '1978');
  const before = await page.locator('.fact').count();
  await expect(page.getByRole('button', { name: '下一年' })).toBeVisible();

  await page.getByRole('button', { name: 'English' }).click();
  await expect(page.getByRole('button', { name: 'Next year' })).toBeVisible();
  await expect(page.getByText('Paused')).toBeVisible();
  await expect(page.locator('.fact')).toHaveCount(before);
});
