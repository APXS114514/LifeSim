# 变更记录

格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循语义化版本。

## [未发布]

### 新增：M1 审计与多 Agent 交接

- M1 架构审计（`docs/audits/M1-AUDIT.md`）；修复：决策选项强制为纯函数、提交的事实冻结、出生时宏观状态按锚点地区过滤；补充队列、JSON、人生原则执行器与模板全覆盖测试。
- 多 Agent 质量门禁：测试中禁止 `skip` / `only` / `todo`；测试基线 `qa/test-baseline.json` 与 `pnpm check:tests`；PR 护栏工作流（高风险路径需 `arch-approved`）；`.github/CODEOWNERS`；黄金指纹移到单独的高风险文件。
- 交接文档：`docs/AGENT_HANDOFF.md`、`docs/FLASH_AGENT_PROMPT.md`、重写 `AGENTS.md`；ADR-0005（M2 数据架构）；M2 任务队列 `docs/tasks/`（23 个任务）。

### 新增：M1 确定性人生模拟内核

- `simulation-core`：规范推进器 `Simulation`（逐年 / 快进 / 分批 / 取消共用一条路径）、全序事件队列与幂等键、计数器式随机流、确定性 exp/ln、草稿—校验—提交的原子结算、循环与失控检测、人生原则执行器、重大决定暂停与玩家选择、快照与恢复（ADR-0004）。
- `systems`：出生、教育、就业、年度家庭收支、慢性病与治疗决定、生命表校准的死亡风险、历史锚点（币制重定值、经济周期）；`RegionModel` 接口；中英双语叙事模板与生平概要。
- `synthetic-world`：虚构地区 `ZZ-SYN`，全部数值为 D 类设计假设（ADR-0003），不进公开构建。
- `narrative`：模板渲染器（枚举文字、自定义格式）与资源合并。
- `apps/cli`：`pnpm life` 在 Node 里跑完整人生并打印双语生平、可写出存档；`pnpm bench` 输出可复现的性能基准 JSON。
- 契约扩展：币制版本与账户、历史锚点、角色的出身 / 特质 / 教育 / 就业 / 健康 / 财务字段、事实的 `details`、快照的 `world`。
- 所有相对导入写明 `.ts` 扩展名，Node 24 直接运行 TypeScript 源码。

### 变更

- 关闭 AI 工具的自动 Git 署名，新增提交信息检查（本地 commit-msg 钩子与 CI），见 AGENTS.md「Git 提交规则」。

### 新增：M0 仓库地基

- 设计基线入库：`docs/GDD.md`（GDD v1.0 原文）与 `docs/AGENT_PROMPTS.md`（分阶段任务原文）。
- pnpm monorepo：`apps/web` 与四个领域包 `content-schema`、`simulation-core`、`save`、`narrative`。
- 类型契约与运行时校验：证据元信息与来源记录、国家包清单、事件事实与日志不变量、角色状态、模拟快照、推进请求、存档仓库接口、存档导入导出信封、双语文本一致性检查。
- 角色创建页草图（zh-Hans / en），明确标注模拟内核尚未实现。
- 质量门禁：Prettier、ESLint（含确定性规则）、依赖边界检查、生产依赖许可证检查、TypeScript 严格模式、Vitest + fast-check、Playwright 冒烟测试（桌面 + 手机），以及 GitHub Actions CI。
- 协作文件：README、AGENTS、CONTRIBUTING、CODE_OF_CONDUCT、SECURITY、THIRD_PARTY_NOTICES、ADR-0001/0002。
