import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // 单元与属性测试；Playwright 端到端测试在 apps/web/e2e，由 `pnpm test:e2e` 运行。
    include: [
      'packages/*/src/**/*.test.ts',
      'apps/*/src/**/*.test.ts',
      'scripts/**/*.test.ts',
      'data/scripts/**/*.test.ts',
    ],
    environment: 'node',
    // GitHub Actions 的共享 runner 比开发机慢 2—3 倍：整局模拟的属性测试与批量测试在本机 2—3 s，
    // 到 CI 上会越过 vitest 默认的 5 s 而被判「超时失败」（断言本身没有失败）。超时只是运行时间预算，
    // 不是断言；单个测试仍可以写更长的超时。
    testTimeout: 30_000,
  },
});
