import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import { defineConfig, globalIgnores } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const determinismMessage =
  '模拟包必须可复现（GDD §11.4）：随机数来自种子派生的随机流，时间来自模拟日历或由调用方传入。';

export default defineConfig(
  globalIgnores(['**/dist/', '**/coverage/', '**/playwright-report/', '**/test-results/']),

  js.configs.recommended,

  {
    files: ['**/*.{ts,tsx}'],
    extends: [tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { varsIgnorePattern: '^_', argsIgnorePattern: '^_' },
      ],
    },
  },

  // Node 环境：仓库根的配置文件与脚本、e2e 与 Vite/Playwright 配置、headless CLI。
  {
    files: [
      '*.{js,ts}',
      'scripts/**/*.mjs',
      'scripts/**/*.ts',
      'data/scripts/**/*.{mjs,ts}',
      'apps/web/*.config.ts',
      'apps/web/e2e/**/*.ts',
      'apps/cli/**/*.ts',
    ],
    languageOptions: { globals: globals.node },
  },

  // 浏览器端 React 应用。
  {
    files: ['apps/web/src/**/*.{ts,tsx}'],
    extends: [reactHooks.configs.flat['recommended-latest'], reactRefresh.configs.vite],
    languageOptions: { globals: globals.browser },
  },

  // 领域包与运行环境无关，并且必须确定性：不碰随机数、系统时钟、浏览器存储或网络。
  {
    files: ['packages/*/src/**/*.ts'],
    ignores: ['**/*.test.ts'],
    rules: {
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: determinismMessage },
        { object: 'Date', property: 'now', message: determinismMessage },
      ],
      'no-restricted-syntax': [
        'error',
        { selector: "NewExpression[callee.name='Date']", message: determinismMessage },
      ],
      'no-restricted-globals': [
        'error',
        ...['window', 'document', 'localStorage', 'sessionStorage', 'indexedDB', 'fetch'].map(
          (name) => ({ name, message: '领域包不依赖浏览器环境或网络；通过接口由应用层注入。' }),
        ),
      ],
    },
  },

  // 测试不得被跳过、独占运行或标为预期失败：弱化测试会让质量门禁失效（AGENTS.md）。
  {
    files: ['**/*.test.ts', 'apps/web/e2e/**/*.ts'],
    rules: {
      'no-restricted-properties': [
        'error',
        ...['describe', 'it', 'test'].flatMap((object) =>
          ['skip', 'only', 'todo', 'skipIf', 'runIf', 'fails', 'fail', 'fixme'].map((property) => ({
            object,
            property,
            message: '不要跳过或弱化测试；无法通过时按 AGENTS.md 报告阻塞。',
          })),
        ),
      ],
    },
  },

  prettier,
);
