import { expect, test } from '@playwright/test';

test('serves the SVG favicon and the app icon set', async ({ page, request }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/人生模拟器/);

  const svgIcon = page.locator('link[rel="icon"][type="image/svg+xml"]');
  await expect(svgIcon).toHaveCount(1);
  await expect(svgIcon).toHaveAttribute('href', /favicon\.svg$/);

  const svg = await request.get('/favicon.svg');
  expect(svg.status()).toBe(200);
  expect(svg.headers()['content-type']).toContain('svg');
  expect((await svg.text()).trimStart().startsWith('<svg')).toBe(true);

  for (const path of [
    '/favicon-32.png',
    '/apple-touch-icon.png',
    '/icon-192.png',
    '/icon-512.png',
  ]) {
    const response = await request.get(path);
    expect(response.status(), path).toBe(200);
    expect(response.headers()['content-type'], path).toContain('png');
  }

  await expect(page.locator('.brand-mark svg')).toBeVisible();
});
