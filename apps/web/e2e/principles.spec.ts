import { expect, test } from '@playwright/test';

test('stores all six birth principles and keeps them across language and reload', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByText('人生原则', { exact: true }).click();
  for (const label of ['亲情', '财富', '健康', '知识', '风险', '稳定']) {
    const slider = page.getByRole('slider', { name: label, exact: true });
    await slider.focus();
    await slider.press(label === '知识' ? 'End' : 'Home');
  }
  await page.getByRole('button', { name: 'English', exact: true }).click();
  await expect(page.getByRole('slider', { name: 'Knowledge', exact: true })).toHaveValue('1');
  await page.getByRole('button', { name: 'Start a life', exact: true }).click();
  await expect(page.locator('.character-card')).toBeVisible();
  const principles = await page.evaluate(() => {
    const data = JSON.parse(localStorage.getItem('lifesim.save.v1')!) as {
      request: { principles: unknown };
      snapshot: { actors: { tier: string; lifePrinciples: unknown }[] };
    };
    return {
      request: data.request.principles,
      actor: data.snapshot.actors.find((actor) => actor.tier === 'protagonist')!.lifePrinciples,
    };
  });
  const expected = { family: 0, wealth: 0, health: 0, knowledge: 1, risk: 0, stability: 0 };
  expect(principles).toEqual({ request: expected, actor: expected });
  await page.reload();
  await expect(page.locator('.character-card')).toBeVisible();
  expect(
    await page.evaluate(() => {
      const data = JSON.parse(localStorage.getItem('lifesim.save.v1')!) as {
        request: { principles: unknown };
      };
      return data.request.principles;
    }),
  ).toEqual(expected);
});

test('restores the all-decisions preference and presents an ordinary decision on its actual date', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(crypto, 'randomUUID', { value: () => 'ordinary-ui-1330' });
    if (localStorage.getItem('lifesim.prefs.v1') === null)
      localStorage.setItem(
        'lifesim.prefs.v1',
        JSON.stringify({
          version: 1,
          lifeLengthMinutes: 30,
          pace: 1,
          pauseOn: 'all',
          reflections: { enabled: false, skipDuringAutoPlay: true },
        }),
      );
  });
  await page.goto('/');
  await page.getByRole('radio', { name: '日本', exact: true }).check();
  await page.getByRole('radio', { name: '指定年份', exact: true }).check();
  await page.getByLabel('年份', { exact: true }).fill('1980');
  await page.getByRole('button', { name: '开始人生', exact: true }).click();
  await expect(page.locator('.decision-card')).toContainText('治疗');
  await expect(page.getByLabel('介入策略', { exact: true })).toHaveValue('all');
  await expect(page.locator('.time-age')).toHaveText('0 岁');
  await page.reload();
  await expect(page.locator('.decision-card')).toContainText('治疗');
  await page.getByRole('button', { name: /不接受治疗/ }).click();
  await expect(page.locator('.decision-card')).toHaveCount(0);
  const before = await page.evaluate(() => localStorage.getItem('lifesim.save.v1'));
  await page.getByLabel('介入策略', { exact: true }).selectOption('major');
  expect(await page.evaluate(() => localStorage.getItem('lifesim.save.v1'))).toBe(before);
  await page.reload();
  await expect(page.getByLabel('介入策略', { exact: true })).toHaveValue('major');
});
