# 架构

> **规范来源是 [GDD.md](GDD.md) 第 4—11 章**（时间、历史、国家包、角色、事件、经济/教育/健康/家庭、证据、UI、技术架构）。
> 本文不复述 GDD，只记录仓库**实际**如何落地、目前做到哪一步，以及代码层面的硬性规则（ADR-0002）。

## 分层与包

GDD §11.2 的目标分层：UI → GameController → Worker RPC → SimulationCore（WorldResolver / EventEngine / ActorSystems）→ Snapshot + Journal → SaveRepository。权威世界状态在 Worker 里，UI 只通过选择器读取摘要。

| 包                         | 职责                                                                                         | 现状（M1）                               |
| -------------------------- | -------------------------------------------------------------------------------------------- | ---------------------------------------- |
| `packages/content-schema`  | 共享类型与运行时 schema：证据、来源、币制与账户、历史锚点、国家包清单、事件事实、角色、快照  | 契约与校验器                             |
| `packages/simulation-core` | 规范推进器、事件队列、随机流、确定性数学、人生原则执行器、快照与恢复                         | **已实现**（ADR-0004）                   |
| `packages/systems`         | 人生规则：出生、教育、就业、家庭财务、健康与死亡、历史锚点；`RegionModel` 接口；双语叙事模板 | M1 最小因果链                            |
| `packages/synthetic-world` | 虚构地区 `ZZ-SYN` 的 D 类数据（实现 `RegionModel`），只供测试与 headless 运行                | M1 测试夹具（ADR-0003），不进公开构建    |
| `packages/save`            | `SaveRepository` 接口、导入导出信封、版本迁移                                                | 接口与信封编解码；真实人生存档往返已测试 |
| `packages/narrative`       | 事实 → zh-Hans/en 叙事：模板渲染、枚举文字、资源合并、双语一致性检查                         | 模板渲染器与检查器                       |
| `apps/cli`                 | headless 入口：跑完整人生（`pnpm life`）、性能基准（`pnpm bench`）                           | M1 验收入口                              |
| `apps/web`                 | React 界面、i18n、（M4）Worker 与 IndexedDB 适配                                             | 角色创建页草图                           |

GDD §11.3 中其余的包按里程碑加入，不提前建空壳：`country-packs`、`data-registry`（M2）、`calibration`（M5，批量模拟）、`optional-ai-contract`（v0.1 之后，只有接口）。

## 依赖规则

```text
apps/cli ──► synthetic-world ──► systems ──► simulation-core ──► content-schema ──► zod
   │                                │                                ▲
   ├──► save ───────────────────────┼────────────────────────────────┤
   └──► narrative ──────────────────┼────────────────────────────────┘
apps/web ──► narrative、content-schema（不能依赖 synthetic-world）
```

- 内部依赖只能沿上图方向，图必须无环。`simulation-core`、`save`、`narrative` 互不依赖：内核只产出快照和事实，持久化与叙事渲染在外层组合。
- `systems` 只依赖内核与契约；地区数据通过 `RegionModel` 注入，规则里不写任何地区数值。
- `packages/*` 不得依赖 `apps/*` 或界面库（react、react-dom、react-i18next）。
- 跨包只能通过包名导入；相对导入必须写明扩展名（`.ts` / `.tsx`），这样 Node 可以直接运行源码。
- 由 `pnpm check:boundaries`（`scripts/check-boundaries.mjs`）检查 `package.json` 声明与源码中的实际导入；新增包要先在脚本的 `ALLOWED_INTERNAL` 里登记允许的依赖。

## 模拟内核（ADR-0004）

- **推进**：`Simulation.advanceTo({ targetDate, stopAtMajorDecision, maxWorkUnits }, cancellation?)` 是唯一的推进入口。事件按（日期、优先级、幂等键）全序处理；工作量用完、取消、遇到重大决定或主角死亡时提前返回，之后可以续跑，结果与一次跑完逐字节相同。
- **事件**：`EventDefinition { type, version, priority, decision?, handle(ctx) }`。处理器通过 `ctx.emit()` 追加事实，通过 `ctx.schedule()` 安排后续事件（不能早于当前日期），只能读事件日期 `ctx.at`。
- **随机**：`ctx.random` 由根种子与事件幂等键派生，与执行顺序无关。
- **原子结算**：处理器修改的是状态草稿；事实、角色与账户 schema、时间与生死约束、系统不变量全部通过后才提交，否则抛出带种子、事件键与日期的 `SimulationError`，状态不变。
- **决策**：重大决定暂停等待 `decide(key, option)`；普通决定和未干预的重大决定由人生原则打分。每次决定产生 `decision.made` 事实。
- **快照**：`snapshot()` / `Simulation.restore()`；快照包含状态、事件队列、已处理键、玩家选择与随机算法版本，恢复后继续推进与不中断的结果相同。

## 人生系统（M1 最小因果链）

```text
出生（城乡、家庭资源、学业能力）
  → 小学入学 → 小学毕业 → 是否升中学 → 中学毕业 → 【重大决定】报考大学 / 直接工作 → 录取与否 → 大学毕业
  → 求职（学历、经济周期、疾病）→ 年度失业风险 → 退休
  → 每个生日结算过去一年收支（工资 / 养老金 − 生活费 − 治疗费，整数分，可负债）
  → 健康检查：慢性病发病（贫困加重）→ 【普通决定】是否治疗（可得性、负担能力、人生原则）
  → 死亡风险 = 生命表 q 经乘数调整（疾病、贫困、学历），同一次检查确定是否死亡与死因
历史锚点：币制重定值（账户换算）、经济衰退与复苏，固定发生
```

每条事实都通过 `causeEventIds` 指向导致它的事实：例如失业事实引用受雇事实、衰退锚点与未治疗的疾病；死于疾病的死亡事实引用发病事实。

## 确定性与运行环境

GDD §4.1、§11.4 要求相同种子加相同输入产生相同结果，快进与逐年推进等价。因此 `packages/*` 的非测试代码：

- 不使用 `Math.random`、`Date.now`、`new Date()`：随机数来自种子派生的随机流，时间来自模拟日历，或者由调用方传入（例如存档导出时间）；
- 风险换算用 `expDet` / `lnDet` 而不是 `Math.exp` / `Math.log`（各引擎末位可能不同）；
- 不访问 `window`、`document`、浏览器存储或 `fetch`，也不导入 `node:` 模块，这样同一份代码既能跑在 Web Worker 里，也能跑在 Node 的 headless 批量模拟里；
- 以上由 ESLint（`eslint.config.js`）和依赖边界检查共同拦截。`save` 包需要 Web Crypto 和 `TextEncoder`，因此它的 `tsconfig` 额外引入了 `WebWorker` lib。

## 契约与 GDD 的对应

类型一律从 zod schema 推导（`z.infer`），schema 是唯一来源。所有 schema 都是严格对象：未知字段会被拒绝。

| 契约                                               | GDD              | 文件                                    | 与 GDD 草案的差异                                                                                                          |
| -------------------------------------------------- | ---------------- | --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `ISODate`、`EntityId`、`RelativePath`、`Locale`    | §4.1、§10、§11.4 | `content-schema/src/primitives.ts`      | 日期必须是真实存在的公历日期                                                                                               |
| `BIRTH_REGION_IDS`、`BIRTH_YEAR_MIN/MAX`           | §2 决定 04/05    | `content-schema/src/product-scope.ts`   | —                                                                                                                          |
| `EvidenceMeta`、`DataPoint`、`SourceRecord`        | §9               | `content-schema/src/evidence.ts`        | 新增 `DataPoint`（缺失必须是 `null` 并附原因）与 `SourceRecord`（许可状态独立于数据质量）                                  |
| `CurrencyVersion`、`HouseholdAccount`、金额工具    | §8.1             | `content-schema/src/money.ts`           | 金额为安全整数；重定值用 BigInt 换算，.5 远离零舍入                                                                        |
| `HistoricalAnchor`                                 | §4.2             | `content-schema/src/anchor.ts`          | M1 只有币制重定值与经济阶段两类                                                                                            |
| `CountryPackManifest`                              | §5               | `content-schema/src/country-pack.ts`    | 新增 `role`（出生地 / 只支持迁入）与 `modules` 路径表                                                                      |
| `SimEventFact`、`checkJournalInvariants`           | §7、§11.4        | `content-schema/src/event-fact.ts`      | 新增 `sequence`（单调日志序号）与 `details`（渲染用的结构化参数）；不允许以自身为因                                        |
| `CharacterState`                                   | §6               | `content-schema/src/character-state.ts` | 身份、地理、生死、人生原则、出身、特质、教育、就业、健康、财务指针；跨字段规则（在读与学历、学生身份、计薪）由 schema 检查 |
| `SimulationSnapshot`                               | §11.4            | `content-schema/src/snapshot.ts`        | 新增 `world`（宏观状态）；`householdAccounts` 收紧为账户数组                                                               |
| `AdvanceRequest`、`SimulationEngine`、`Simulation` | §4.1、§11.4      | `simulation-core/src/`                  | 引擎接口是同步的，带 `CancellationToken`；异步发生在 Worker RPC 层                                                         |
| `RegionModel`、`MacroState`                        | §5、§9           | `systems/src/region.ts`                 | M2 的国家包与 DataRegistry 实现同一接口                                                                                    |
| `SaveRepository`、存档信封                         | §11.4            | `save/src/`                             | 导出格式：外层信封记录格式版本与 SHA-256，载荷为 JSON 字符串；导入依次校验大小、UTF-8、危险键、schema、校验和、日志不变量  |
| `NarrativeProvider`、`createTemplateNarrator`      | §7、§10、§15     | `narrative/src/index.ts`                | 占位符语法统一为 `{{name}}`（与 i18next 一致）；枚举值按 `enums.<参数名>.<值>` 查找                                        |

## 界面

- M0 只有角色创建页草图：单栏布局，所有关键操作支持点击、触摸与键盘，手机宽度下不出现横向滚动。GDD §10 的桌面三栏 / 手机单栏时间线在 M4 实现。
- 界面文本放在 `apps/web/src/i18n/locales/{zh-Hans,en}.json`：zh-Hans 是参照语言，键名在编译期检查（`i18next.d.ts`），两种语言的键集合与占位符一致性由单元测试保证。切换语言只重绘文本，不改变状态。
- 只使用系统字体，不加载外部字体（离线可用，也不引入额外的字体许可）。
- 部署目标是 GitHub Pages 项目页 `/LifeSim/`：构建时设置 `LIFESIM_BASE=/LifeSim/`。部署任务在有可玩内容后（M4）再加。
