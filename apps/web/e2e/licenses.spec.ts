import { expect, test } from '@playwright/test';

// MIT 要求每一份副本都带版权与许可声明；压缩会去掉源码注释，所以构建产物必须随附声明文件（M3-044）。
test('ships the licence and third-party notices with the build and links them', async ({
  page,
  request,
}) => {
  const notices = await request.get('/THIRD_PARTY_NOTICES.txt');
  expect(notices.ok()).toBe(true);
  const text = await notices.text();
  expect(text).toContain('## react ');
  expect(text).toContain('Permission is hereby granted');
  expect(text).toContain('Copyright (c) 2026 satoru.net');

  const licence = await request.get('/LICENSE.txt');
  expect(licence.ok()).toBe(true);
  expect(await licence.text()).toContain('MIT License');

  await page.goto('/');
  const link = page.getByRole('link', { name: '开源许可与第三方声明' });
  await expect(link).toHaveAttribute('href', '/THIRD_PARTY_NOTICES.txt');
});
