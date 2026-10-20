import { defineConfig, devices } from '@playwright/test';

const port = 4173;
const isCI = Boolean(process.env['CI']);
// 本机可设 PW_CHANNEL=chrome 复用已安装的 Google Chrome；CI 用 Playwright 自带的 Chromium。
const channel = process.env['PW_CHANNEL'];
const browser = channel ? { channel } : {};

export default defineConfig({
  testDir: './e2e',
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  reporter: isCI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    locale: 'zh-CN',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], ...browser } },
    { name: 'mobile', use: { ...devices['Pixel 7'], ...browser } },
  ],
  webServer: {
    // 每次都从源码重新构建，避免测到过期的 dist。
    command: `pnpm run build && pnpm run preview --host 127.0.0.1 --port ${port} --strictPort`,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: !isCI,
    timeout: 120_000,
  },
});
