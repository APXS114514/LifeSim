# 0001：工具链与 monorepo 结构

- 状态：已采纳
- 日期：2026-10-20

## 背景

GDD §11.1 给出了建议技术栈，并要求在第一个 ADR 里固定实际版本、检查许可。本 ADR 记录 M0 的选择。

## 决定

| 方面       | 选择                                                                                                       | 版本（锁定）                                                                 |
| ---------- | ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| 包管理     | pnpm workspace（`apps/*`、`packages/*`）                                                                   | pnpm 11.7.0（`packageManager`）                                              |
| 运行时     | Node，由 pnpm `devEngines.runtime` 下载并固定                                                              | Node 24.21.0（`.nvmrc` 同步）                                                |
| 语言       | TypeScript 严格模式（另开 `noUncheckedIndexedAccess`、`exactOptionalPropertyTypes`、`erasableSyntaxOnly`） | typescript 6.0.3                                                             |
| 界面       | React + Vite                                                                                               | react 19.3.0、vite 8.3.4、@vitejs/plugin-react 6.1.2                         |
| 界面文本   | i18next + react-i18next                                                                                    | 26.4.4、17.0.16                                                              |
| 运行时校验 | zod 4，类型从 schema 推导                                                                                  | zod 4.6.7                                                                    |
| 测试       | Vitest + fast-check；Playwright                                                                            | vitest 5.0.4、fast-check 4.10.2、@playwright/test 1.64.0                     |
| 代码规范   | ESLint flat config + typescript-eslint（类型感知）+ Prettier                                               | eslint 10.12.0、typescript-eslint 8.71.2、prettier 3.9.10                    |
| CI         | GitHub Actions：checks 与 e2e 两个任务                                                                     | actions/checkout v7、setup-node v7、pnpm/action-setup v6、upload-artifact v7 |

所有依赖都写精确版本（`savePrefix: ''`），并设置 `minimumReleaseAge: 10080`：只安装发布满 7 天的版本。生产依赖目前全部是 MIT 许可（`pnpm check:licenses`）。

## 理由与取舍

- **TypeScript 6.0 而不是 7.0**：TypeScript 7（原生编译器）已经发布，但 typescript-eslint 8.71 的 peer 范围是 `<6.1.0`，类型感知 lint 还用不了 7。等 typescript-eslint 支持之后再升级。
- **Node 由 pnpm 管理**：开发机上 DSH 自带的 Node 启用了 hardened runtime，又没有 `disable-library-validation` 授权，因此无法加载第三方原生模块；而 Vite 8 的 rolldown、lightningcss 都依赖原生模块。用 `devEngines.runtime` 让 pnpm 下载官方 Node 并把完整性校验写进锁文件，本机和 CI 跑脚本用的就是同一个 Node 版本。代价是首次安装要多下载一次 Node 运行时。
- **pnpm 11.7.0**：与开发机现有版本一致，保证本机和 CI 行为相同。之后升级时一并更新 `packageManager`。
- **zod 作为 schema 唯一来源**：国家包、存档导入都需要运行时校验，从 schema 推导类型可以避免类型和校验器各写一份而逐渐不一致。
- **i18next**：GDD 的建议方案；占位符语法 `{{name}}` 同时用于叙事模板，同一个检查器可以覆盖界面文本和叙事模板。
- **M0 只用一个 Chromium 跑桌面与手机两个视口**：三浏览器兼容在 M5 加入（GDD §13 M5）。本机可以用 `PW_CHANNEL=chrome` 复用已安装的 Chrome，CI 使用 Playwright 自带的 Chromium。
- **不加构建步骤的包**：工作区包直接以 TypeScript 源码导出（`exports: ./src/index.ts`），由 Vite 与 Vitest 处理。M1 的 headless CLI 如果需要直接用 Node 运行，再评估是否增加构建步骤。
- **部署**：目标是 GitHub Pages 项目页 `/LifeSim/`（`LIFESIM_BASE`）。在有可玩内容之前不发布页面。

## 何时重新评估

- typescript-eslint 支持 TypeScript 7 时；
- M1 需要 headless CLI 或 Web Worker 打包时；
- 任何生产依赖要引入非白名单许可证时（先写新的 ADR）。
