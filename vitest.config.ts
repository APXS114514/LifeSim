import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // 单元与属性测试；Playwright 端到端测试在 apps/web/e2e，由 `pnpm test:e2e` 运行。
    include: ['packages/*/src/**/*.test.ts', 'apps/*/src/**/*.test.ts'],
    environment: 'node',
  },
});
