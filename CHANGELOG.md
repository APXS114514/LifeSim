# 变更记录

格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循语义化版本。

## [未发布]

### 新增：M0 仓库地基

- 设计基线入库：`docs/GDD.md`（GDD v1.0 原文）与 `docs/AGENT_PROMPTS.md`（分阶段任务原文）。
- pnpm monorepo：`apps/web` 与四个领域包 `content-schema`、`simulation-core`、`save`、`narrative`。
- 类型契约与运行时校验：证据元信息与来源记录、国家包清单、事件事实与日志不变量、角色状态、模拟快照、推进请求、存档仓库接口、存档导入导出信封、双语文本一致性检查。
- 角色创建页草图（zh-Hans / en），明确标注模拟内核尚未实现。
- 质量门禁：Prettier、ESLint（含确定性规则）、依赖边界检查、生产依赖许可证检查、TypeScript 严格模式、Vitest + fast-check、Playwright 冒烟测试（桌面 + 手机），以及 GitHub Actions CI。
- 协作文件：README、AGENTS、CONTRIBUTING、CODE_OF_CONDUCT、SECURITY、THIRD_PARTY_NOTICES、ADR-0001/0002。
