# 架构

> **规范来源是 [GDD.md](GDD.md) 第 4—11 章**（时间、历史、国家包、角色、事件、经济/教育/健康/家庭、证据、UI、技术架构）。
> 本文不复述 GDD，只记录仓库**实际**如何落地、目前做到哪一步，以及代码层面的硬性规则（ADR-0002）。

## 分层与包

GDD §11.2 的目标分层：UI → GameController → Worker RPC → SimulationCore（WorldResolver / EventEngine / ActorSystems）→ Snapshot + Journal → SaveRepository。权威世界状态在 Worker 里，UI 只通过选择器读取摘要。

| 包                         | 职责                                                                                | 现状（M0）                       |
| -------------------------- | ----------------------------------------------------------------------------------- | -------------------------------- |
| `packages/content-schema`  | 共享类型与运行时 schema：证据、来源、国家包清单、事件事实、角色、快照、产品边界常量 | 契约与校验器                     |
| `packages/simulation-core` | 规范时间推进器、随机流、事件引擎                                                    | 只有 `AdvanceRequest` 与引擎接口 |
| `packages/save`            | `SaveRepository` 接口、导入导出信封、版本迁移                                       | 接口与信封编解码                 |
| `packages/narrative`       | 事实 → zh-Hans/en 叙事的渲染契约、模板占位符与双语一致性检查                        | 契约与检查器                     |
| `apps/web`                 | React 界面、i18n、（M1/M4）Worker 与 IndexedDB 适配                                 | 角色创建页草图                   |

GDD §11.3 中其余的包按里程碑加入，不提前建空壳：`systems`、`calibration`（M1/M3）、`country-packs`、`data-registry`（M2）、`optional-ai-contract`（v0.1 之后，只有接口）。

## 依赖规则

```text
apps/web ──► simulation-core ─┐
   │    ──► save ─────────────┼──► content-schema ──► zod
   │    ──► narrative ────────┘
   └──────────────────────────────► content-schema
```

- 内部依赖只能沿上图方向，图必须无环。`simulation-core`、`save`、`narrative` 互不依赖：内核只产出快照和事实，持久化与叙事渲染在外层组合。
- `packages/*` 不得依赖 `apps/*` 或界面库（react、react-dom、react-i18next）。
- 跨包只能通过包名导入，不能用 `../../other-package/src` 这类相对路径。
- 由 `pnpm check:boundaries`（`scripts/check-boundaries.mjs`）检查 `package.json` 声明与源码中的实际导入；新增包要先在脚本的 `ALLOWED_INTERNAL` 里登记允许的依赖。

## 确定性与运行环境

GDD §4.1、§11.4 要求相同种子加相同输入产生相同结果，快进与逐年推进等价。因此 `packages/*` 的非测试代码：

- 不使用 `Math.random`、`Date.now`、`new Date()`：随机数来自种子派生的随机流（M1），时间来自模拟日历，或者由调用方传入（例如存档导出时间）；
- 不访问 `window`、`document`、浏览器存储或 `fetch`，也不导入 `node:` 模块，这样同一份代码既能跑在 Web Worker 里，也能跑在 Node 的 headless 批量模拟里；
- 以上由 ESLint（`eslint.config.js`）和依赖边界检查共同拦截。`save` 包需要 Web Crypto 和 `TextEncoder`，因此它的 `tsconfig` 额外引入了 `WebWorker` lib。

## 契约与 GDD 的对应

类型一律从 zod schema 推导（`z.infer`），schema 是唯一来源。所有 schema 都是严格对象：未知字段会被拒绝。

| 契约                                              | GDD              | 文件                                    | 与 GDD 草案的差异                                                                                                         |
| ------------------------------------------------- | ---------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `ISODate`、`EntityId`、`RelativePath`、`Locale`   | §4.1、§10、§11.4 | `content-schema/src/primitives.ts`      | 日期必须是真实存在的公历日期                                                                                              |
| `BIRTH_REGION_IDS`、`BIRTH_YEAR_MIN/MAX`          | §2 决定 04/05    | `content-schema/src/product-scope.ts`   | —                                                                                                                         |
| `EvidenceMeta`、`DataPoint`、`SourceRecord`       | §9               | `content-schema/src/evidence.ts`        | 新增 `DataPoint`（缺失必须是 `null` 并附原因）与 `SourceRecord`（许可状态独立于数据质量）                                 |
| `CountryPackManifest`                             | §5               | `content-schema/src/country-pack.ts`    | 新增 `role`（出生地 / 只支持迁入）与 `modules` 路径表                                                                     |
| `SimEventFact`、`checkJournalInvariants`          | §7、§11.4        | `content-schema/src/event-fact.ts`      | 新增 `sequence`（单调日志序号）；不允许以自身为因                                                                         |
| `CharacterState`、`LifePrinciples`、`VitalStatus` | §6               | `content-schema/src/character-state.ts` | 只有身份、地理、生死、人生原则；教育、职业、财务、健康等字段在 M1/M3 补充；表层指标不存储                                 |
| `SimulationSnapshot`                              | §11.4            | `content-schema/src/snapshot.ts`        | `rngState` 等字段必须是 JSON 值且不可缺省                                                                                 |
| `AdvanceRequest`、`SimulationEngine`              | §4.1、§11.4      | `simulation-core/src/index.ts`          | 引擎接口是同步的，带 `CancellationToken`；异步发生在 Worker RPC 层                                                        |
| `SaveRepository`、存档信封                        | §11.4            | `save/src/`                             | 导出格式：外层信封记录格式版本与 SHA-256，载荷为 JSON 字符串；导入依次校验大小、UTF-8、危险键、schema、校验和、日志不变量 |
| `NarrativeProvider`、`checkLocaleParity`          | §7、§10、§15     | `narrative/src/index.ts`                | 占位符语法统一为 `{{name}}`（与 i18next 一致）                                                                            |

## 界面

- M0 只有角色创建页草图：单栏布局，所有关键操作支持点击、触摸与键盘，手机宽度下不出现横向滚动。GDD §10 的桌面三栏 / 手机单栏时间线在 M4 实现。
- 界面文本放在 `apps/web/src/i18n/locales/{zh-Hans,en}.json`：zh-Hans 是参照语言，键名在编译期检查（`i18next.d.ts`），两种语言的键集合与占位符一致性由单元测试保证。切换语言只重绘文本，不改变状态。
- 只使用系统字体，不加载外部字体（离线可用，也不引入额外的字体许可）。
- 部署目标是 GitHub Pages 项目页 `/LifeSim/`：构建时设置 `LIFESIM_BASE=/LifeSim/`。部署任务在有可玩内容后（M4）再加。
