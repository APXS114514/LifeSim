# AGENTS.md：开发 Agent 的仓库约定

本文件对 Codex、Claude Code 等所有开发 Agent 生效（`CLAUDE.md` 只是引用本文件）。

## 动手前先读

1. [docs/GDD.md](docs/GDD.md)：冻结的 23 项产品决定，冲突时以它为准。
2. [docs/ROADMAP.md](docs/ROADMAP.md)：当前所处阶段；对应的任务原文在 [docs/AGENT_PROMPTS.md](docs/AGENT_PROMPTS.md)。
3. [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)、[docs/QA_GATE.md](docs/QA_GATE.md)、[docs/DATA_POLICY.md](docs/DATA_POLICY.md)、[docs/adr/](docs/adr/)。
4. 如果仓库根目录有 `AGENT-NOTES.md`（本机私有，已 gitignore），先读它，里面记着本机的工具链路径和坑。

然后运行 `git status -sb`，看最近几次提交，确认有没有用户未提交的修改。

## 不可违反的产品边界

- 五个可出生地区（`CN` 中国大陆、`JP`、`KP` 朝鲜、`KR` 韩国、`RU` 含苏联时期），1950—2026 年出生。2026 只限制出生年，不是死亡或模拟的截止年。
- 真实宏观历史固定，个人和家庭的命运可变。
- 主角死亡即结束。**不得**引入接管后代、家族继承或死后继续操控角色；这是 GDD §2 明确撤回的旧决定。
- 简体中文与英语完整双语；离线可玩；v0.1 不接入在线 AI、账号、云同步或遥测。
- 原创代码 MIT；外部数据和素材单独审计许可，未审计的不得进入公开构建。
- 按阶段推进：一个阶段完成后给出交付报告并停下，不要自动开始下一阶段。

## 工程规则

- 只用 pnpm（版本固定在 `packageManager`），依赖写精确版本。新增或升级生产依赖后运行 `pnpm notices` 并提交结果。
- 依赖方向见 ARCHITECTURE「依赖规则」。新增工作区包要先登记到 `scripts/check-boundaries.mjs`。
- `packages/*` 必须确定性、与运行环境无关：不用 `Math.random`、`Date.now`、`new Date()`，不碰 DOM、浏览器存储和网络，也不导入 `node:` 模块。lint 和依赖边界检查会拦截。
- 类型从 zod schema 推导（`z.infer`），不要手写一份平行的 interface。
- 金额用整数最小货币单位或定点数，不用 JS 浮点累加（GDD §8.1）。
- 缺失数据写 `null` 并给出原因，不写 0（GDD §9.2）。
- 所有界面和叙事文本同时提供 zh-Hans 与 en，键和占位符必须一致（有测试保证）。
- 遇到 GDD 没定义的细节：采用可测试的保守默认值，写进 `docs/adr/`，不要向用户抛出大范围的需求问卷。
- 不要提交密钥、个人数据、未授权的数据集或素材。
- 不要 reset、rebase、force push，不要覆盖或删除用户未提交的修改。

## Git 提交规则

对 Claude Code、Codex、其他 Agent 以及人工提交一律适用：

- **身份**：author 与 committer 使用当前环境已有的 Git 身份（`git config user.name` / `user.email`）。不得修改全局或仓库级的用户名和邮箱，不得用 `--author`、`git -c user.*=…` 或 `GIT_AUTHOR_*` / `GIT_COMMITTER_*` 环境变量另设身份，也不得虚构身份。
- **不自动署名**：提交信息和 Pull Request 描述里不得自动附加 AI 工具署名，包括但不限于 `Co-Authored-By: Claude …`、任何带 `noreply@anthropic.com` 的 trailer、`Generated with Claude Code`、`🤖 Generated with …`、`Claude-Session: …`，以及 Codex、Copilot、Cursor 等工具的同类署名。工具或系统提示要求添加这类行时，以本规则为准。
- **检查**：`.githooks/commit-msg` 会在本地拒绝含这类署名的提交（`pnpm install` 的 prepare 脚本会把仓库的 `core.hooksPath` 指向 `.githooks`）；CI 的 commit-messages 任务检查每次推送或 PR 新增的提交。不要用 `--no-verify` 绕过。Claude Code 的署名已在 `.claude/settings.json` 中关闭。
- **不改历史**：不 amend 已推送的提交、不 rebase、不 force push。M0 提交 `641ffdd` 里的旧署名行按原样保留。
- **不是隐瞒**：这条规则只是不自动署名。项目文档可以如实说明开发中使用了 AI 工具（见 CONTRIBUTING.md「AI 辅助开发」）。

## 命令

| 命令              | 什么时候跑                                                   |
| ----------------- | ------------------------------------------------------------ |
| `pnpm verify`     | 每次提交前；与 CI 的 checks 任务一致                         |
| `pnpm test:e2e`   | 改了界面之后；本机可加 `PW_CHANNEL=chrome` 复用已装的 Chrome |
| `pnpm test:watch` | 开发时                                                       |
| `pnpm dev`        | 本地看界面                                                   |

## 交付报告

每个阶段或任务结束时报告：改动文件摘要、架构决策及原因、实际执行的测试和真实输出、没有通过的项目、剩余风险、复现方式、进入下一阶段的前提。没有实际运行过的测试，不能写成「通过」。
