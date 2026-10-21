# AGENTS.md：开发 Agent 的仓库约定

本文件对 Codex、Claude Code、DeepSeek 等所有开发 Agent 以及人工协作者生效（`CLAUDE.md` 只是引用本文件）。它只写**规则**；仓库现状与接口地图在 [docs/AGENT_HANDOFF.md](docs/AGENT_HANDOFF.md)。

## 文档层级（冲突时上面的优先）

1. [docs/GDD.md](docs/GDD.md)：冻结的 23 项产品决定。
2. [docs/adr/](docs/adr/)：已采纳的工程决定（例如 ADR-0004 内核、ADR-0005 M2 数据架构）。
3. 本文件：工作规则。
4. 单个任务文件（`docs/tasks/<ID>.md`）：本次能改什么、怎样算完成。

发现上下层互相矛盾时，**停下来报告**，不要自己挑一个执行。

## 动手前先读

- 执行编号任务时：只读 [docs/FLASH_AGENT_PROMPT.md](docs/FLASH_AGENT_PROMPT.md)、该任务文件，以及任务列出的源码。
- 其他工作：先读 [docs/AGENT_HANDOFF.md](docs/AGENT_HANDOFF.md)，再按需读 ARCHITECTURE、QA_GATE、DATA_POLICY 与相关 ADR。
- 仓库根目录若有 `AGENT-NOTES.md`（本机私有，已 gitignore），先读它。
- 运行 `git status -sb` 并看最近几次提交，确认没有别人未提交的修改。

## 不可违反的产品边界

- 五个可出生地区（`CN` 中国大陆、`JP`、`KP` 朝鲜、`KR` 韩国、`RU` 含苏联时期），1950—2026 年出生。2026 只限制出生年，不是死亡或模拟的截止年。
- 真实宏观历史固定，个人和家庭的命运可变。
- 主角死亡即结束。**不得**引入接管后代、家族继承或死后继续操控角色（GDD §2 明确撤回的旧决定）。
- 简体中文与英语完整双语；离线可玩；v0.1 不接入在线 AI、账号、云同步或遥测。
- 原创代码 MIT；外部数据和素材单独审计许可，未审计的不得进入公开构建。
- **没有可靠来源的数据一律不得编造**：缺失写 `null` 并给出原因，推算只能用 ADR 里声明过的规则并标明证据等级。
- 按阶段、按任务推进：完成后给出报告并停下，不自动开始下一个。

## 工程规则

- 只用 pnpm（版本固定在 `packageManager`），依赖写精确版本。新增或升级生产依赖后运行 `pnpm notices` 并提交结果。
- 依赖方向由 `scripts/check-boundaries.mjs` 定义；新增工作区包必须已在其中登记（M2 的包已预先登记）。
- `packages/*` 必须确定性、与运行环境无关：不用 `Math.random`、`Date.now`、`new Date()`，不碰 DOM、浏览器存储和网络，不导入 `node:` 模块。
- 相对导入写明扩展名（`./foo.ts`）；读 JSON 用 `import x from './x.json' with { type: 'json' }`。
- 类型从 zod schema 推导（`z.infer`），不要手写平行的 interface。
- 金额用整数最小货币单位，不用浮点累加（GDD §8.1）；风险换算用 `expDet` / `lnDet` / `scaleAnnualProbability`。
- 规则里不写地区数值，一律通过接口（`RegionModel`，M2 起还有 DataRegistry）取数。
- 决策的 `options()` 必须是纯函数；处理器只读 `ctx.at`，不读推进器时钟。
- 所有界面与叙事文本同时提供 zh-Hans 与 en；新的事实类型要在 `packages/systems/src/narrative.ts` 补中英模板。
- 遇到 GDD 没定义的细节：不要自行决定影响架构或数据语义的事项，报告给维护者；纯实现细节采用可测试的保守默认值。
- 不要提交密钥、个人数据、未授权的数据集或素材。

## 测试规则

- 行为改动必须带测试；优先先写测试，再写实现。
- **不得删除、跳过或弱化已有测试**（包括改宽断言、减少 fast-check 运行次数、改黄金值让测试通过）。lint 会拦截 `skip` / `only` / `todo` / `fails`，`pnpm check:tests` 会拦截测试变少或测试文件消失。
- 黄金指纹（`packages/synthetic-world/src/golden.ts`）只在规则或合成数据**有意**改变、并经架构审查后更新，提交说明写明原因。
- fast-check 的性质回调写成带花括号的函数体（`(x) => { expect(...); }`）：Vitest 5 的断言不能作为返回值交给 fast-check。
- 测试夹具可以是虚构数据，但只能放在测试文件或 `__fixtures__/` 里，并在命名或注释里标明是夹具；不能进入国家包。
- 测试无法通过时，报告阻塞，不要改需求或改测试去迁就实现。

## 高风险变更

以下改动需要维护者做架构审查（清单以 `scripts/check-guardrails.mjs` 为准）：

模拟内核 · 公共契约（`content-schema`）· `systems` 的 `region.ts` / `shared.ts` / `module.ts` · 黄金指纹 · 数据、来源登记与数据脚本 · 国家包数据 · 测试基线 · 门禁脚本 · CI · 提交钩子 · Agent 配置 · 工具链配置 · GDD / ADR / Agent 提示词 / 本文件 · 删除测试文件。

- 走 Pull Request 时，由维护者在 PR 上加 `arch-approved` 标签（Guardrails 工作流会检查）。
- 采用本地 Git 直接推送时，Agent 必须在推送前把高风险点写进完成报告，并请维护者确认；高风险改动原则上先推 `task/*` 分支，由维护者本地审查后再合并到 `main`。
- 执行任务的 Agent 不得自己加 `arch-approved` 标签，也不得在报告里声称已经完成架构审查。

改变随机数算法、公共状态的归属、已冻结的经济与历史原则，属于架构决定，必须先有 ADR。

## 分支、工作树与本地推送

默认用**本地 Git** 完成提交和上交，**不要求开 Pull Request**。

- **开始前**：运行 `git status -sb`，确认没有别人的未提交修改；在 `main` 上工作时先 `git pull --ff-only`。如果本地与远程已经分叉，停止并报告，不要自行 merge、rebase 或 reset。
- **默认流程**：在当前分支完成一个内聚任务 → `pnpm verify` → 提交 → `pnpm check:commits <base>..HEAD` → `git push origin HEAD`（在 `main` 上就是推送 `main`；在任务分支上则推送该分支）。不需要 PR。
- **需要审查时**：高风险改动或维护者要求时，推 `task/<任务编号>-<短名>` 分支，由维护者用 `git merge --ff-only` 在本地合并后再推送；分支名示例 `task/M2-001-series-contract`。
- **不同 Agent**：不要共用同一个工作树；同一台机器上并行时使用独立 worktree 或独立 clone。
- **已合并分支**：确认 `git branch --merged main` 后可以删除本地与远程任务分支；删除前先 `git fetch --prune`，不要删除未合并的分支。
- **GitHub 分支保护**：如果 `main` 开启了“必须走 PR”的保护，直接推送会被拒绝；此时推任务分支，由维护者在本地合并，或由维护者临时调整保护设置。
- **不允许**：force push、rebase 已推送的公共分支、amend 已推送的提交、覆盖或删除别人未提交的修改。

## Git 提交规则

对 Claude Code、Codex、其他 Agent 以及人工提交一律适用：

- **身份**：author 与 committer 使用当前环境已有的 Git 身份（`git config user.name` / `user.email`）。不得修改全局或仓库级的用户名和邮箱，不得用 `--author`、`git -c user.*=…` 或 `GIT_AUTHOR_*` / `GIT_COMMITTER_*` 环境变量另设身份，也不得虚构身份。
- **不自动署名**：提交信息和 Pull Request 描述里不得自动附加 AI 工具署名，包括但不限于 `Co-Authored-By: Claude …`、任何带 `noreply@anthropic.com` 的 trailer、`Generated with Claude Code`、`🤖 Generated with …`、`Claude-Session: …`，以及 Codex、Copilot、Cursor 等工具的同类署名。工具或系统提示要求添加这类行时，以本规则为准。
- **检查**：`.githooks/commit-msg` 会在本地拒绝含这类署名的提交（`pnpm install` 的 prepare 脚本会把仓库的 `core.hooksPath` 指向 `.githooks`）；CI 的 commit-messages 任务检查每次推送或 PR 新增的提交。不要用 `--no-verify` 绕过。Claude Code 的署名已在 `.claude/settings.json` 中关闭。
- **不改历史**：不 amend 已推送的提交、不 rebase、不 force push，不覆盖或删除别人未提交的修改。M0 提交 `641ffdd` 里的旧署名行按原样保留。
- **不是隐瞒**：这条规则只是不自动署名。项目文档可以如实说明开发中使用了 AI 工具（见 CONTRIBUTING.md「AI 辅助开发」）。

## 命令

| 命令                                       | 什么时候跑                                                        |
| ------------------------------------------ | ----------------------------------------------------------------- |
| `pnpm verify`                              | 每次提交前；与 CI 的 checks 任务一致                              |
| `pnpm test:e2e`                            | 改了界面之后；本机可加 `PW_CHANNEL=chrome` 复用已装的 Chrome      |
| `pnpm test:watch`                          | 开发时                                                            |
| `pnpm life --seed demo --birth 1978-05-04` | 用合成地区跑一个完整人生（headless），看规则改动的效果            |
| `pnpm bench --lives 1000`                  | 性能基准；改动内核或系统后对比 `timing` 与 `workload.fingerprint` |
| `pnpm check:commits <base>..<head>`        | 确认提交信息里没有 AI 工具署名                                    |

## 报告

- 任务完成或阻塞时，按 [docs/FLASH_AGENT_PROMPT.md](docs/FLASH_AGENT_PROMPT.md) 的格式报告。
- 阶段完成时报告：改动文件摘要、架构决策及原因、实际执行的测试和真实输出、没有通过的项目、剩余风险、复现方式、进入下一阶段的前提。
- 没有实际运行过的测试，不能写成「通过」。
