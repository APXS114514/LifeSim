import { expect, test } from '@playwright/test';

test('creates a female identity with persisted references and changes only its writing across languages', async ({
  page,
}) => {
  await page.addInitScript(() =>
    Object.defineProperty(crypto, 'randomUUID', { value: () => 'probe-0' }),
  );
  await page.goto('/');
  await page.getByRole('radio', { name: '日本', exact: true }).check();
  await page.getByRole('radio', { name: '指定年份', exact: true }).check();
  await page.getByLabel('年份', { exact: true }).fill('1978');
  await page
    .getByRole('group', { name: '生理性别', exact: true })
    .getByRole('radio', { name: '女性', exact: true })
    .check();
  await page.getByRole('button', { name: '开始人生', exact: true }).click();
  await expect(page.locator('.character-name')).not.toHaveText('姓名待接入');
  await expect(page.locator('.character-card')).toContainText('女性');
  const stored = await page.evaluate(() => localStorage.getItem('lifesim.save.v1'));
  const snapshot = JSON.parse(stored!) as {
    snapshot: {
      schemaVersion: number;
      actors: {
        tier: string;
        sex: string;
        name: { family: unknown; given: unknown };
        wellbeing: { stress: number };
        social: { ties: number };
        skills: unknown[];
      }[];
    };
  };
  const actor = snapshot.snapshot.actors.find((candidate) => candidate.tier === 'protagonist')!;
  expect(snapshot.snapshot.schemaVersion).toBe(2);
  expect(actor.sex).toBe('female');
  expect(actor.name.family).not.toBeNull();
  expect(actor.name.given).not.toBeNull();
  expect(actor.wellbeing.stress).toBe(0.3);
  expect(actor.social.ties).toBe(0.5);
  expect(actor.skills).toEqual([]);
  const chinese = await page.locator('.character-name').innerText();
  await page.getByRole('button', { name: 'English', exact: true }).click();
  await expect(page.locator('.character-name')).toHaveText(/[A-Za-z]/);
  expect(await page.locator('.character-name').innerText()).not.toBe(chinese);
  expect(await page.evaluate(() => localStorage.getItem('lifesim.save.v1'))).toBe(stored);
  await page.reload();
  await expect(page.locator('.character-card')).toContainText('Female');
});

test('shows an explicit name gap for the DPRK rather than inventing a given name', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('radio', { name: '朝鲜', exact: true }).check();
  await page.getByRole('button', { name: '开始人生', exact: true }).click();
  await expect(page.locator('.character-name')).toHaveText('姓名待接入');
  const saved = await page.evaluate(
    () =>
      JSON.parse(localStorage.getItem('lifesim.save.v1')!) as {
        snapshot: { actors: { tier: string; name: { given: unknown } }[] };
      },
  );
  expect(
    saved.snapshot.actors.find((actor) => actor.tier === 'protagonist')!.name.given,
  ).toBeNull();
});

test('preserves a pre-identity contract save and offers its original bytes as a backup', async ({
  page,
}) => {
  await page.addInitScript(() =>
    Object.defineProperty(crypto, 'randomUUID', { value: () => 'probe-0' }),
  );
  await page.goto('/');
  await page.getByRole('radio', { name: '日本', exact: true }).check();
  await page.getByRole('button', { name: '开始人生', exact: true }).click();
  await expect(page.locator('.character-card')).toBeVisible();
  const legacy = await page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem('lifesim.save.v1')!) as {
      snapshot: {
        schemaVersion: number;
        dataPackVersions: { systems: string };
        actors: Record<string, unknown>[];
      };
    };
    saved.snapshot.schemaVersion = 1;
    saved.snapshot.dataPackVersions.systems = '0.5.0';
    for (const actor of saved.snapshot.actors)
      for (const field of ['sex', 'name', 'wellbeing', 'social', 'skills']) delete actor[field];
    const raw = JSON.stringify(saved);
    localStorage.setItem('lifesim.save.v1', raw);
    return raw;
  });
  await page.reload();
  await expect(page.locator('.save-issue')).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('lifesim.save.v1'))).toBe(legacy);
  expect(await page.evaluate(() => localStorage.getItem('lifesim.save.v1.preserved'))).toBe(legacy);
  await expect(page.getByRole('button', { name: '下载原始存档', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '开始人生', exact: true })).toHaveCount(0);
});
