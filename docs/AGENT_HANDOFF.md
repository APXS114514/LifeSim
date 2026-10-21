# Agent 交接手册

> 给接手开发的 Agent 与人类协作者。本文独立于任何聊天记录，只描述**仓库现在是什么样、怎么验证、哪里还没做**。
> 规则以 [AGENTS.md](../AGENTS.md) 为准，产品边界以 [GDD.md](GDD.md) 为准；本文不复述它们。
> 最后更新：2026-10-20（M1 完成并审计，M2 已拆分为任务队列）

## 1. 一页概览

- **项目**：LifeSim，真实历史统计约束下的单人人生模拟（中国大陆、日本、朝鲜、韩国、俄罗斯，1950—2026 出生；中英双语；离线；MIT）。
- **当前阶段**：M0 已验收；M1（确定性模拟内核 + 合成地区上的最小人生因果链）已完成并审计，等待维护者验收；M2 尚未开始，任务已拆分。
- **能做什么**：在 Node 里用一个**虚构的合成地区**跑完整人生（`pnpm life`），结果确定、可复现、可存档恢复。
- **还不能做什么**：没有任何真实国家数据；网页只有角色创建页草图，不能游玩；没有 NPC、家庭、迁居。
- **下一步**：按 [docs/tasks/INDEX.md](tasks/INDEX.md) 的顺序执行 M2 任务，一次一个。

## 2. 开发环境

| 项目       | 要求                                                                                                                    |
| ---------- | ----------------------------------------------------------------------------------------------------------------------- |
| Node       | 24（运行脚本时由 pnpm 按 `package.json` 的 `devEngines.runtime` 使用 24.21.0）                                          |
| pnpm       | 11.7.0（`packageManager` 字段；`corepack enable` 后自动使用）                                                           |
| 首次       | `pnpm install`（同时把仓库的 `core.hooksPath` 设为 `.githooks`，启用提交信息检查）                                      |
| 浏览器测试 | `pnpm --filter @lifesim/web exec playwright install chromium`；或本机已装 Chrome 时用 `PW_CHANNEL=chrome pnpm test:e2e` |
| 本机特例   | 仓库根目录若有 `AGENT-NOTES.md`（已 gitignore），先读它：里面是这台机器的工具链路径与坑                                 |

TypeScript 源码不经构建，由 Node 24 的类型剥离直接运行；因此**相对导入必须写扩展名**（`./foo.ts`），包之间用包名导入。

## 3. 验证命令

| 命令                                       | 内容                                                                             | 何时必须跑         |
| ------------------------------------------ | -------------------------------------------------------------------------------- | ------------------ |
| `pnpm verify`                              | 格式、lint、依赖边界、许可证、类型检查、单元测试（含 JSON 报告）、测试基线、构建 | 每次提交前         |
| `pnpm test:e2e`                            | Playwright 冒烟（桌面 + 手机）                                                   | 改了 `apps/web` 时 |
| `pnpm life --seed demo --birth 1978-05-04` | 合成人生（加 `--locale en`、`--choose start-work`、`--json`、`--save <文件>`）   | 改了规则时看效果   |
| `pnpm bench --lives 1000`                  | 性能基准 JSON（固定种子；`workload.fingerprint` 只取决于种子与规则）             | 改了内核或规则时   |
| `pnpm check:commits <base>..<head>`        | 提交信息里没有 AI 工具署名                                                       | 提交后             |

CI（`.github/workflows/`）：`ci.yml` 运行提交信息检查、上表的全部门禁、`pnpm life`、500 局基准（报告作为产物上传）与 Playwright；`guardrails.yml` 在 PR 上检查高风险路径（见第 8 节）。

## 4. 仓库地图

```text
packages/content-schema/   公共契约（zod schema 与推导出的类型）——高风险
packages/simulation-core/  确定性模拟内核——高风险
packages/systems/          人生规则、RegionModel 接口、双语叙事模板
packages/synthetic-world/  虚构地区 ZZ-SYN（D 类数据，只供测试与 headless）；golden.ts 黄金指纹——高风险
packages/narrative/        叙事渲染与双语一致性检查
packages/save/             存档仓库接口与导入导出信封
apps/cli/                  headless 入口：run-life.ts、bench.ts
apps/web/                  React + Vite 网页（角色创建页草图）
docs/                      GDD（冻结）、ADR、架构、数据政策、质量门禁、路线图、审计、任务
data/                      来源登记；M2 起有数据脚本（data/scripts/）与本机缓存（data/cache/，不进仓库）
scripts/                   质量门禁脚本（check-*）——高风险
qa/                        测试基线——高风险
```

依赖方向（由 `pnpm check:boundaries` 强制）：

```text
apps/cli ─► synthetic-world ─► systems ─► simulation-core ─► content-schema
apps/cli ─► save、narrative ─────────────────────────────► content-schema
apps/web ─► narrative、content-schema（不能依赖 synthetic-world）
M2 计划：data-registry ─► content-schema；country-packs ─► data-registry、simulation-core、content-schema
```

## 5. 模块职责与主要接口

### content-schema（契约）

一切跨包数据都在这里用 zod 定义，类型用 `z.infer` 推导，**不要另写平行的 interface**。所有对象都是严格对象（未知字段报错）。

| 文件                 | 主要导出                                                                                                   |
| -------------------- | ---------------------------------------------------------------------------------------------------------- |
| `primitives.ts`      | `ISODate`、`isISODate`、`compareISODate`、`EntityIdSchema`、`RelativePathSchema`、`SUPPORTED_LOCALES`      |
| `product-scope.ts`   | `BIRTH_REGION_IDS`（CN/JP/KP/KR/RU）、`BIRTH_YEAR_MIN/MAX`（1950/2026）                                    |
| `evidence.ts`        | `EvidenceMetaSchema`（A/B/C/D）、`DataPointSchema`（缺失必须 `null` + 原因）、`SourceRecordSchema`         |
| `money.ts`           | `CurrencyVersionSchema`、`HouseholdAccountSchema`、`addMinor`、`scaleMinor`、`redenominateMinor`（BigInt） |
| `anchor.ts`          | `HistoricalAnchorSchema`（`redenomination`、`economy-phase`）                                              |
| `event-fact.ts`      | `SimEventFactSchema`（含 `sequence`、`details`）、`checkJournalInvariants`                                 |
| `character-state.ts` | `CharacterStateSchema`（身份、地理、生死、人生原则、出身、特质、教育、就业、健康、财务指针，含跨字段规则） |
| `snapshot.ts`        | `SimulationSnapshotSchema`（含 `world` 宏观状态）                                                          |
| `country-pack.ts`    | `CountryPackManifestSchema`                                                                                |

### simulation-core（内核，ADR-0004）

```ts
const sim = Simulation.create({ seed, modules, genesis, activeCharacterId, dataPackVersions, decisions? });
sim.advanceTo({ targetDate, stopAtMajorDecision, maxWorkUnits }, cancellation?)
//   → { reachedDate, stopReason, newFacts, pendingDecision }
sim.decide(decisionKey, optionId); sim.pendingDecision(); sim.snapshot(); sim.facts; sim.ended
Simulation.restore(snapshot, { modules, dataPackVersions })
```

- 规则写成 `EventDefinition { type, version, priority, decision?, handle(ctx) }`，打包成 `SimulationModule { id, events, invariants? }`。
- 处理器里：`ctx.at`（事件日期）、`ctx.state`（草稿，可直接改）、`ctx.random`（本事件独占的随机流）、`ctx.emit(fact)`、`ctx.schedule(req)`、`ctx.actor(id)`、`ctx.choice`。**不能读推进器时钟，不能安排到过去。**
- `DecisionSpec.options()` 必须是纯函数：只读状态，不抽随机数、不 `emit`、不 `schedule`（违反会抛 `impure-decision-options`）。
- 确定性工具：`deriveStream`、`fingerprint`、`canonicalJson`、`expDet` / `lnDet` / `scaleAnnualProbability`、日历函数（`addYears`、`addDays`、`ageOn`、`toDayNumber`）。
- 所有失败都是 `SimulationError`，消息里带 `seed=… event=… at=…`。

### systems（人生规则）

- `RegionModel`（`region.ts`）：规则向地区要的全部数据（概率、金额、学制、效应系数、锚点）。规则里不写地区数值。
- 事件类型与同日优先级在 `shared.ts` 的 `EVENT` / `PRIORITY`；`SYSTEMS_VERSION` 是规则版本，写进快照。
- `createLifeSimulation({ seed, region, birthDate, settlement?, principles?, decisions? })`、`restoreLifeSimulation(snapshot, region)`、`afterSecondaryDecisionKey()`。
- `LIFE_NARRATIVE`：中英模板（键 = 事实的 `templateId`）与枚举文字；`summarizeLife(snapshot, facts)`。

### 其他

- `synthetic-world`：`syntheticRegion`（实现 `RegionModel`）、`syntheticManifest`、`SYNTHETIC_LABELS`；`golden.ts` 的 `GOLDEN_LIFE`。
- `narrative`：`createTemplateNarrator({ resources, formatParam })`、`mergeMessageTrees`、`checkLocaleParity`。
- `save`：`SaveRepository` 接口；`encodeSave` / `decodeSave`（大小、UTF-8、危险键、schema、SHA-256、日志不变量）。

## 6. 版本号与何时提升

| 常量                      | 位置                            | 何时提升                                   | 影响                                    |
| ------------------------- | ------------------------------- | ------------------------------------------ | --------------------------------------- |
| `RNG_ALGORITHM`           | `simulation-core/src/random.ts` | 散列或生成器任何变化（原则上不允许）       | 所有存档的后续结果改变                  |
| `ENGINE_VERSION`          | `simulation-core/src/engine.ts` | 内核语义变化                               | 旧快照拒绝恢复                          |
| `SNAPSHOT_SCHEMA_VERSION` | 同上                            | 快照结构变化（需要迁移器）                 | 旧快照拒绝恢复                          |
| `SYSTEMS_VERSION`         | `systems/src/shared.ts`         | 规则行为变化                               | 写入 `dataPackVersions`，旧快照拒绝恢复 |
| 数据包 `dataVersion`      | 各地区包                        | 数据变化                                   | 同上                                    |
| `GOLDEN_LIFE`             | `synthetic-world/src/golden.ts` | 规则或合成数据**有意**变化，确认差异合理后 | 需要架构审查                            |

## 7. 已完成与未完成

**已完成（M0、M1）**：仓库地基与全部质量门禁；契约；确定性内核；合成地区上的教育 → 就业 → 收支 → 健康 → 死亡因果链；重大决定暂停与玩家选择；币制重定值与经济周期锚点；快照与存档往返；双语叙事；headless CLI 与基准；多 Agent 护栏。详见 [ROADMAP.md](ROADMAP.md) 与 [audits/M1-AUDIT.md](audits/M1-AUDIT.md)。

**未完成（按里程碑）**：

| 里程碑 | 内容                                                                                                                       | 状态                                        |
| ------ | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| M2     | 统计序列与地理契约、DataRegistry、许可审计、WPP 出生与生命表、城镇比例、五个国家包、币制与政体锚点、出生选择器、覆盖率矩阵 | 已拆分，见 [tasks/INDEX.md](tasks/INDEX.md) |
| M3     | 真实地区的 RegionModel 适配器、家庭与 NPC 分层、婚育、迁居、政体更替作用到在世角色、城市人口权重、各国特色事件             | 未拆分                                      |
| M4     | 网页时间线、决策卡、Web Worker、IndexedDB 存档、PWA 离线                                                                   | 未拆分                                      |
| M5     | 批量校准、三浏览器、发布门禁                                                                                               | 未拆分                                      |

**待维护者决定的产品问题**：角色是否有性别（GDD 未规定；M2 先用男女合计生命表，见 ADR-0005）。

## 8. 质量门禁与高风险变更

任务完成以真实测试结果为准，不以 Agent 的声明为准。

| 门禁                                                 | 防止什么                                             |
| ---------------------------------------------------- | ---------------------------------------------------- |
| lint 禁止测试里的 `skip` / `only` / `todo` / `fails` | 跳过或独占运行测试                                   |
| `pnpm check:tests`（`qa/test-baseline.json`）        | 测试失败、被跳过、总数减少、测试文件消失             |
| 黄金指纹 `GOLDEN_LIFE`                               | 悄悄改变人生结果                                     |
| `pnpm check:boundaries`                              | 依赖方向错误、领域包读环境、相对导入越界或缺扩展名   |
| 内核不变量与 `SimulationError`                       | 负年龄、死后行为、日期倒流、事件循环、违反契约的状态 |
| Guardrails 工作流 + CODEOWNERS                       | 未经审查修改高风险路径                               |

**高风险路径**（清单以 `scripts/check-guardrails.mjs` 为准）：模拟内核、公共契约、`systems` 的 `region.ts` / `shared.ts` / `module.ts`、黄金指纹、数据与数据脚本（`data/scripts/lib/` 除外）、国家包数据、测试基线、门禁脚本、CI、提交钩子、Agent 配置、工具链配置、GDD / ADR / Agent 提示词与 `AGENTS.md`。删除测试文件也算。

改动高风险路径的 PR 必须由维护者审查后加上 `arch-approved` 标签，Guardrails 才会通过。执行任务的 Agent **不得自己加这个标签**。

**建议维护者在 GitHub 开启**：`main` 分支保护（要求 PR、要求 CI / Guardrails 通过、要求 Code Owners 审查、禁止强制推送）、私密漏洞报告。

## 9. 已知风险

- 只有合成数据；真实数据的许可尚未核验（M2 第一道门禁）。
- `RegionModel` 面向合成公式，M3 接入真实数据时预计要重塑（届时写 ADR）。
- 每个事件深拷贝全部状态并校验全部角色；加入 NPC 后需重新测量性能。
- 快照里的已处理事件键随一生增长，NPC 增多后需评估体积。
- 跨浏览器逐位一致只在 V8 上实测过。
- 联合国 WPP 网站由 JavaScript 渲染，命令行取不到许可条款原文；许可核验需要用浏览器完成并逐字记录。

## 10. 如何接手一个任务

1. 读 [docs/FLASH_AGENT_PROMPT.md](FLASH_AGENT_PROMPT.md)（统一执行规程）。
2. 在 [docs/tasks/INDEX.md](tasks/INDEX.md) 里确认任务的前置依赖都已合并。
3. 只读这个任务文件和它列出的源码，按规程执行，完成后停止并提交报告。
