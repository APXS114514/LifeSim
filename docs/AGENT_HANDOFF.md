# Agent 交接手册

> 给接手开发的 Agent 与人类协作者。本文独立于任何聊天记录，只描述**仓库现在是什么样、怎么验证、哪里还没做**。
> 规则以 [AGENTS.md](../AGENTS.md) 为准，产品边界以 [GDD.md](GDD.md) 为准；本文不复述它们。
> 最后更新：2026-10-21（Claude Code 接手审计：M3-000…010、M3-031…033、M4-015 已推送待验收；`713409d` 的 CI 因性能退化变红，M3-035 合并后 `188aecb` 的 CI 已恢复通过；审计见 [audits/M3-TAKEOVER-AUDIT.md](audits/M3-TAKEOVER-AUDIT.md)）

## 1. 一页概览

- **项目**：LifeSim，真实历史统计约束下的单人人生模拟（中国大陆、日本、朝鲜、韩国、俄罗斯，1950—2026 出生；中英双语；离线；MIT）。
- **当前阶段**：M0 已验收；M1 完成并审计，等待验收；M2 的 23 个任务已合入 `main`，里程碑待验收；**M3-lite 已实现**；完整 M3 已完成 M3-000…M3-010（M3-007 部分完成）与 M3-031…033（033 只有设计），全部已推送、**均未经维护者验收**；M4 只先做了 M4-015。逐任务状态见 [tasks/INDEX.md](tasks/INDEX.md)。
- **能做什么**：浏览器里五地选出生、跑完整人生、处理重大决定、看死亡总结、切换中英、刷新续玩；按日期显示历史政体/地名与历史旗帜；苏联解体后在世角色的政治归属与国籍随之改变；出生时生成父母两位 Tier1 NPC（只有初始状态）；Node 里 `pnpm life:real` 跑真实国家包人生；`pnpm life` 仍跑合成地区。
- **还不能做什么**：网页不能逐年推进（点开始就跳到下一个重大决定，见 [M3-034](tasks/M3-034.md)）；父母没有自己的人生进程（永远在世、在职，见 [M3-011](tasks/M3-011.md)）；婚育、收养、迁居、城市人口权重、各国特色事件都属于后续 M3；规则仍全部使用 ADR-0006 的 D 级公式（M3-009 只接好了真实数据的查询接口）；Worker、IndexedDB、PWA 属于 M4。
- **下一步**：按 [V0.1_PLAN.md](V0.1_PLAN.md)（v0.1 推进骨架：分道、门禁、待决事项）推进。[M3-035](tasks/M3-035.md)、[M3-036](tasks/M3-036.md) 已合并且 CI 通过；[M3-011](tasks/M3-011.md) 前置已满足，可交执行 Agent；[M3-034](tasks/M3-034.md) 待批准；骨架任务 M3-037…039、M5-001…008 先细化再实施。仍待维护者决定：Q1/Q6/Q7、Q10 的提示形式、Q14（见 [M3_OPEN_QUESTIONS.md](M3_OPEN_QUESTIONS.md) 末节）。

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

| 命令                                         | 内容                                                                                                             | 何时必须跑         |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------ |
| `pnpm verify`                                | 格式、lint、依赖边界、许可证、`check:data`、`check:coverage`、类型检查、单元测试（含 JSON 报告）、测试基线、构建 | 每次提交前         |
| `pnpm test:e2e`                              | Playwright 冒烟（桌面 + 手机）                                                                                   | 改了 `apps/web` 时 |
| `pnpm check:data`                            | 来源登记、排序、可再分发许可、国家包引用与孤立数据文件                                                           | 改了来源或国家包时 |
| `pnpm data:sources`                          | 由 `data/sources.json` 重新生成 `data/SOURCES.md`                                                                | 改了来源时         |
| `pnpm check:coverage` / `pnpm data:coverage` | 数据覆盖率矩阵检查 / 重新生成 `docs/data/COVERAGE.md`                                                            | 改了序列或国家包时 |
| `pnpm life --seed demo --birth 1978-05-04`   | 合成人生（加 `--locale en`、`--choose start-work`、`--json`、`--save <文件>`）                                   | 改了规则时看效果   |
| `pnpm life:real --region JP --year 1978`     | 真实国家包上的可玩切片（加 `--region random`、`--year random`、`--locale en`、`--json`）                         | 改了适配器或规则时 |
| `pnpm bench --lives 1000`                    | 性能基准 JSON（固定种子；`workload.fingerprint` 只取决于种子与规则）                                             | 改了内核或规则时   |
| `pnpm check:commits <base>..<head>`          | 提交信息里没有 AI 工具署名                                                                                       | 提交后             |

CI（`.github/workflows/`）：`ci.yml` 运行提交信息检查、上表的全部门禁、`pnpm life`、`pnpm life:real`、500 局基准（报告作为产物上传）与 Playwright；`guardrails.yml` 在 PR 上检查高风险路径（见第 8 节）。**直接 `git push` 不会触发 Guardrails**；高风险改动按第 8/10 节在任务分支上本地提交并请维护者审查，每次推送前还需人类操作员当次批准。

## 4. 仓库地图

```text
packages/content-schema/   公共契约（zod schema 与推导出的类型）——高风险
packages/simulation-core/  确定性模拟内核——高风险
packages/systems/          人生规则、RegionModel 接口、双语叙事模板
packages/synthetic-world/  虚构地区 ZZ-SYN（D 类数据，只供测试与 headless）；golden.ts 黄金指纹——高风险
packages/narrative/        叙事渲染与双语一致性检查
packages/save/             存档仓库接口与导入导出信封
packages/data-registry/    统计序列查询、回退规则、断点、预测与情景标记
packages/country-packs/    五国数据包（src/packs）、按日期解析、出生选择器、数据指纹与 data/
packages/real-world/       M3-lite 适配器：国家包 → RegionModel、可玩会话与双语叙事
apps/cli/                  headless 入口：run-life.ts、run-real-life.ts、bench.ts
apps/web/                  React + Vite 网页：出生选择、游戏会话、时间线、决定、总结与自动存档
docs/                      GDD（冻结）、ADR、架构、数据政策、质量门禁、路线图、审计、任务、数据覆盖率
data/                      来源登记、许可审计、数据转换脚本（data/scripts/）与本机缓存（data/cache/，不进仓库）
scripts/                   质量门禁脚本（check-*）——高风险
qa/                        测试基线——高风险
```

依赖方向（由 `pnpm check:boundaries` 强制）：

```text
apps/cli ─► synthetic-world ─► systems ─► simulation-core ─► content-schema
apps/cli ─► save、narrative ─────────────────────────────► content-schema
apps/web ─► narrative、content-schema、systems、real-world（不能依赖 synthetic-world）
M2 已落地：data-registry ─► content-schema；country-packs ─► data-registry、simulation-core、content-schema
M3-lite：real-world ─► country-packs、data-registry、systems、simulation-core、narrative、content-schema
```

## 5. 模块职责与主要接口

### content-schema（契约）

一切跨包数据都在这里用 zod 定义，类型用 `z.infer` 推导，**不要另写平行的 interface**。所有对象都是严格对象（未知字段报错）。

| 文件                 | 主要导出                                                                                                   |
| -------------------- | ---------------------------------------------------------------------------------------------------------- |
| `primitives.ts`      | `ISODate`、`isISODate`、`compareISODate`、`EntityIdSchema`、`RelativePathSchema`、`SUPPORTED_LOCALES`      |
| `product-scope.ts`   | `BIRTH_REGION_IDS`（CN/JP/KP/KR/RU）、`BIRTH_YEAR_MIN/MAX`（1950/2026）                                    |
| `evidence.ts`        | `EvidenceMetaSchema`（A/B/C/D）、`DataPointSchema`（缺失必须 `null` + 原因）、`SourceRecordSchema`         |
| `series.ts`          | `StatSeriesSchema`、`INDICATOR_SPEC`（births / life-table-qx / urban-share）与 8 条交叉规则                |
| `geography.ts`       | 政治实体、行政单位、地点/名称、地点归属；`isValidOn`、`resolveOn`、`findOverlaps`、`findGaps`（半开区间）  |
| `money.ts`           | `CurrencyVersionSchema`、`HouseholdAccountSchema`、`addMinor`、`scaleMinor`、`redenominateMinor`（BigInt） |
| `anchor.ts`          | `HistoricalAnchorSchema`（`redenomination`、`economy-phase`、`polity-change`）                             |
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
- 提交前校验：事实、角色与账户的 schema，时间与生死约束，各系统不变量。M3-035（已合并）起只对本事件新增或改动的角色与账户做 schema 解析；`relationships` 目前**不**逐事件校验（只在恢复快照时校验，见 M3-036）。

### systems（人生规则）

- `RegionModel`（`region.ts`）：规则向地区要的全部数据（概率、金额、学制、效应系数、锚点）。规则里不写地区数值。M3-009 起另有 `tables`（`RegionTables`：按指标/年份取 `DataValue | null`，缺失为 `null` 而不是 0）与 `queries`（教育、劳动力、价格、卫生四个领域查询，ADR-0007）；**目前没有规则调用它们**。`prices.toRealMinor` 的接口有已知缺陷（不能披露未折算、忽略币制版本），使用前先按 Q14 修订。
- `family.ts`（M3-010）：`life.birth` 里创建 `char:protagonist:mother` / `:father`、各自账户与两条 `parent-child` 关系，使用出生事件的随机流（在主角三次抽样之后）。父母目前没有任何后续事件。
- `history.ts`：历史锚点。政体更替（M3-001）改所有在世角色的政治归属与国籍；币制重定值换算所有账户；这两类事实对父母也会各写一条，但模板不区分是谁（M3-011 处理）。
- 事件类型与同日优先级在 `shared.ts` 的 `EVENT` / `PRIORITY`；`SYSTEMS_VERSION` 是规则版本，写进快照。
- `createLifeSimulation({ seed, region, birthDate, settlement?, principles?, decisions? })`、`restoreLifeSimulation(snapshot, region)`、`afterSecondaryDecisionKey()`。
- `LIFE_NARRATIVE`：中英模板（键 = 事实的 `templateId`）与枚举文字；`summarizeLife(snapshot, facts)`。

### data-registry（数据查询）

- `DataRegistry`：构造时校验 `StatSeries` 与 `Breakpoint`，按（指标、地理）建索引。
- `lookup({ indicator, geographyId, year, age? })` 依次尝试：精确值 → 相邻年份（±2 年、不跨断点、同距取早，降为 C）→ 上级地理（只做精确，降为 C）→ `urban-share` 的首个观测值前延（10 年，降为 D）→ 缺失；显式 `allowScenario` 才用 `scenario-hold-last`（末年值，D 级、`projected: true`）。
- 缺失永远返回 `status: 'missing'` 与原因，绝不返回 0；结果里的证据是副本。

### country-packs（国家包）

- `CountryPackSchema`、`validateCountryPack`（13 条跨字段规则）：清单、地理、货币、锚点、断点、序列。
- `resolve.ts`：`assignmentAt`、`politicalEntityAt`、`adminUnitAt`、`placeNameAt`、`currencyAt`、`poolPlace`；日期早于 1950-01-01 抛 `RangeError`。
- `packs/{cn,jp,kp,kr,ru}.ts`：五国数据包；`PACKS` 为完整 `Record<BirthRegionId, CountryPack>`。
- `createPackRegistry()`：汇总序列、断点与「地点 → 国家」父级关系；`DATA_FINGERPRINTS`（15 条）锁定数据。
- `selectBirth({ seed, region, year, birthDate? })`：年份等概率、地区按出生数加权、城乡按 urban-share、日期年内等概率；抽样顺序固定，指定项也照常抽样。缺失数据抛错，不跳过、不当 0。

### real-world（M3-lite 可玩切片）

- `createRealRegion(packId, birthDate, { placeId?, polityId? })`：用国家包构造 `RegionModel`；`mortality` 来自 WPP qx，其他表为 ADR-0006 的 D 级基线。
- `createRealLifeSimulation({ seed, region, year, birthDate?, principles?, decisions? })`：先 `selectBirth`，再用出生地点/政体创建人生。
- `createRealNarrator(pack, birthDate)` / `realNarrativeResources`：系统模板 + 该包地点/币制名；金额按币制小数位格式化。
- 明确限制：父母只有初始状态；无迁居与城市权重；人口池地点在苏联时期显示为「其他城镇/农村地区，苏联」，实际只覆盖俄罗斯（RSFSR）范围。
- 显示层（M3-031/032）：`display.ts` 按地点与日期解析名称，`apps/web/src/game/flags.ts` 按政体 ID 与日期选旗；旗帜素材登记在 [FLAG_SOURCES.md](FLAG_SOURCES.md)。
- 网页会话在 `apps/web/src/game/session.ts`：推进、决定、`finish()`、序列化/恢复；`storage.ts` 只存 localStorage，恢复失败时保留原始存档（M3-000）。`currentDate` 目前取最后一条事实的日期，M3-034 改为内核的权威时钟 `simulation.clock`。

### 其他

- `synthetic-world`：`syntheticRegion`（实现 `RegionModel`）、`syntheticManifest`、`SYNTHETIC_LABELS`；`golden.ts` 的 `GOLDEN_LIFE`。
- `narrative`：`createTemplateNarrator({ resources, formatParam })`、`mergeMessageTrees`、`checkLocaleParity`。
- `save`：`SaveRepository` 接口；`encodeSave` / `decodeSave`（大小、UTF-8、危险键、schema、SHA-256、日志不变量）。

## 6. 版本号与何时提升

| 常量                      | 位置                               | 何时提升                                   | 影响                                    |
| ------------------------- | ---------------------------------- | ------------------------------------------ | --------------------------------------- |
| `RNG_ALGORITHM`           | `simulation-core/src/random.ts`    | 散列或生成器任何变化（原则上不允许）       | 所有存档的后续结果改变                  |
| `ENGINE_VERSION`          | `simulation-core/src/engine.ts`    | 内核语义变化                               | 旧快照拒绝恢复                          |
| `SNAPSHOT_SCHEMA_VERSION` | 同上                               | 快照结构变化（需要迁移器）                 | 旧快照拒绝恢复                          |
| `SYSTEMS_VERSION`         | `systems/src/shared.ts`            | 规则行为变化                               | 写入 `dataPackVersions`，旧快照拒绝恢复 |
| 数据包 `dataVersion`      | 各地区包                           | 数据变化                                   | 同上                                    |
| `DATA_FINGERPRINTS`       | `country-packs/src/data-golden.ts` | 数据**有意**更新并经维护者审查后           | 数据指纹测试失败                        |
| `GOLDEN_LIFE`             | `synthetic-world/src/golden.ts`    | 规则或合成数据**有意**变化，确认差异合理后 | 需要架构审查                            |

当前值（2026-10-21）：`ENGINE_VERSION` 0.1.0、`SNAPSHOT_SCHEMA_VERSION` 1、`SYSTEMS_VERSION` 0.4.0、`GOLDEN_LIFE` 72 条事实 / `b4b67de5d12b1a4827e238ad2051d292`；`pnpm bench --lives 1000` 工作量指纹 `3f03ad12c6cea367315ed8825de0e431`，p50 2.72 ms/局（M3-035 合并后，Apple M5；合并前为 4.35 ms）。

## 7. 已完成与未完成

**已完成（M0、M1、M2、M3-lite）**：仓库地基与全部质量门禁；契约；确定性内核；合成地区上的教育 → 就业 → 收支 → 健康 → 死亡因果链；重大决定暂停与玩家选择；币制重定值与经济周期锚点；快照与存档往返；双语叙事；headless CLI 与基准；多 Agent 护栏。M2 另含：`StatSeries`/地理/政体更替契约、DataRegistry（回退/断点/预测/情景）、WPP 2024 出生数与单岁生命表、WDI 城镇比例、五国国家包与出生选择器、数据指纹、许可门禁与覆盖率矩阵。M3-lite 另含：`real-world` 适配器、五国完整人生、网页开局/时间线/决定/总结/中英切换/localStorage 续玩、`pnpm life:real` 与 E2E。详见 [ROADMAP.md](ROADMAP.md)、[PLAYABLE_TEST.md](PLAYABLE_TEST.md)、[ADR-0006](adr/0006-first-playable-slice.md)、[audits/M1-AUDIT.md](audits/M1-AUDIT.md) 与 [data/LICENSE_AUDIT.md](../data/LICENSE_AUDIT.md)。

**未完成（按里程碑）**：

| 里程碑 | 内容                                                                                                                       | 状态                                                                                              |
| ------ | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| M2     | 统计序列与地理契约、DataRegistry、许可审计、WPP 出生与生命表、城镇比例、五个国家包、币制与政体锚点、出生选择器、覆盖率矩阵 | **已实现，待维护者验收**，见 [tasks/INDEX.md](tasks/INDEX.md)                                     |
| M3     | 家庭与 Tier1 NPC、教育/职业/经济、疾病与死亡、迁移、五国特色事件、事件目录                                                 | M3-000…010、031…033 已推送待验收；M3-011…030、034…036 未完成；见 [tasks/INDEX.md](tasks/INDEX.md) |
| M4     | 网页时间线、决策卡、Web Worker、IndexedDB 存档、PWA 离线                                                                   | 已拆分为 M4-001…015；M4-015 已推送待验收，其余待 M3 验收后开始                                    |
| M5     | 批量校准、三浏览器、发布门禁                                                                                               | 未拆分                                                                                            |

**待维护者决定的产品问题**：Q1 角色性别、Q6 国际迁移范围、Q7 生育率换算、Q10 敏感内容的提示形式、Q14 购买力折算接口；选项与建议见 [M3_OPEN_QUESTIONS.md](M3_OPEN_QUESTIONS.md) 末节。

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

- 走 PR：改动高风险路径的 PR 必须由维护者审查后加上 `arch-approved` 标签，Guardrails 才会通过。
- 走本地 Git：高风险改动在 `task/*` 分支上完成并本地提交，Agent 在报告里列出高风险点并请维护者审查；维护者本地审查后合并。**Agent 的每一次远程推送都必须先获得人类操作员批准**（见 [AGENTS.md](../AGENTS.md)「分支、工作树与推送」）；直接推送不会触发 Guardrails，所以不能把“CI 通过”当成架构审查。
- 执行任务的 Agent **不得自己加这个标签，也不得声称已完成架构审查**。

**推送纪律**：Agent 只做本地提交；每次推送前必须向人类操作员报告提交内容、commit SHA、目标远程/分支、测试结果与风险，并获得当次明确批准。若希望所有改动强制走 PR/Guardrails，就在 GitHub 开启“要求 PR”的 `main` 分支保护；无论哪种方式，都建议开启禁止强制推送与私密漏洞报告。

## 9. 已知风险

- M2 的真实数据许可已核验并登记（WPP CC BY 3.0 IGO、WDI CC BY 4.0），但**结论仍需维护者确认**；史实来源（东京都、大阪府、韩国、中国、俄罗斯）多为 `redistribution: unknown`，只引用事实、不再分发。
- 朝鲜的币制改革细节来自韩国官方教育/研究机构（非朝鲜官方来源）；中国重庆 1997 年采用 6 月 18 日正式挂牌日（全国人大批准日为 3 月 14 日）；苏联解体采用 1991-12-26 宣言（12 月 25 日为戈尔巴乔夫辞职/降旗）。这些取舍需维护者复核。
- WPP Demographic Indicators 文件包含 2101 年行（`Births` 为空），转换脚本按项目范围忽略；重新下载后若列名/方案名变化，脚本会报错而不是猜。
- `RegionModel` 面向合成公式，M3 接入真实数据时预计要重塑（届时写 ADR）；M2 的 `country-packs` 尚未接入 `systems`。
- 性能：M3-010 加入两位父母后，单局 p50 从 1.82 升到 4.34 ms（内核每个事件校验全部角色），CI 模板覆盖测试因此超时；M3-035 改为增量校验后为 2.72 ms。每个事件仍深拷贝整份状态，M3-011 让父母有自己的事件后要重新测量，p50 > 5.5 ms 就停下来报告。**任务报告必须附 `pnpm bench --lives 1000` 前后对比**。
- CI 只在推送时运行；一次推送多个提交时，CI 无法定位是哪个提交出的问题（M3-001…010 就是一次推送的 19 个提交）。推送前务必本地 `pnpm verify`。
- 快照里的已处理事件键随一生增长，NPC 增多后需评估体积。
- 跨浏览器逐位一致只在 V8 上实测过。
- 五国数据文件约 7.5 MB JSON；M3-lite 网页构建约 4.1 MB（gzip 约 690 KB），后续需要按需加载或拆分国家包。
- M3-lite 的教育/就业/工资/价格/疾病是 **ADR-0006 的 D 级假设**，不是五国历史统计；M3 接入真实数据时必须替换并更新 ADR。
- M3-lite 的父母只有初始状态；没有婚育、迁居、城市权重；网页在主线程同步推进，存档只在 localStorage。
- M3-033（朝鲜半岛南→北迁移）只有设计稿，审计发现史实问题，修订前不得实现。

## 10. 如何接手一个任务

1. 读 [docs/FLASH_AGENT_PROMPT.md](FLASH_AGENT_PROMPT.md)（统一执行规程）。
2. 在 [docs/tasks/INDEX.md](tasks/INDEX.md) 里确认前置依赖都已合并（「当前任务」一节列出了下一批）。高风险的内核任务（M3-035、M3-036）由 Claude Code 执行；执行 Agent 拿细粒度任务，不读全部 GDD 自行设计。
3. 只读这个任务文件和它列出的源码，按规程执行，完成后停止并提交报告。
4. 改动数据或国家包时，依次运行 `pnpm data:sources`、`pnpm data:coverage`，再运行 `pnpm verify`；有意更新数据时同步维护 `DATA_FINGERPRINTS` 并说明原因。
5. 默认用本地 Git 提交，不需要开 PR；**推送前必须获得人类操作员的当次批准**：

   ```sh
   git status -sb                 # 确认没有别人的未提交修改
   git pull --ff-only             # 在 main 上工作时先同步
   pnpm verify                    # 改了界面再加 pnpm test:e2e
   git add <允许修改的文件>
   git commit -m "feat(scope): TASK_ID 简述"
   pnpm check:commits origin/main..HEAD
   # 到此为止：报告提交内容、SHA、目标分支、测试结果与风险，等待人类批准后再推送
   git push origin HEAD           # 仅在获得当次批准后执行
   ```

6. 高风险改动或维护者要求审查时：在 `task/<任务编号>-<短名>` 分支上本地提交，在报告里列出高风险点；推送同样需要人类逐次批准，合并由维护者执行。不要 force push、rebase 已推送分支或 amend 已推送提交。
7. 分支合并进 `main` 后，确认 `git branch --merged main`，再删除本地/远程任务分支；用 `git fetch --prune` 清理远程引用。
