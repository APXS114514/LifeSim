# M3-042 接手说明（2026-10-21，Claude Code → DeepSeek）

维护者要求暂停 Claude Code 的工作，剩余部分交给 DeepSeek。本文件说明已经做了什么、做了哪些与规格不同的决定、实测数字，以及还剩什么。规格原文仍是 [M3-042.md](M3-042.md)；冲突时以本文件「与规格的差异」为准，并在完成报告里逐条列出供维护者确认。

## 位置与状态

- 工作树：`/Users/apxs/Documents/DSH/Game-Miscellaneous/_lifesim-m3042-wt`，分支 `task/M3-042-life-events-v1`，基于 main `89973fb`。
- **全部改动尚未提交**（`git status` 可见）。Claude Code 已停止在此工作树操作；接手后可以直接在这里继续（同一时间只有一个 Agent 使用它），或先在本分支做一次本地提交再开自己的工作树。
- 不得推送；推送前必须按 AGENTS.md 逐次请求人类批准。

## 已完成

| 文件                                                 | 内容                                                                                                                                                                         |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/systems/src/life-events.ts`（新）          | 类型、后果工具函数、`scheduleLifeEventYear`、事件工厂（两段式决策）、`lifeEventDefinitions(region, catalog)`、`lifeEventDisclosure(catalog)`                                 |
| `packages/systems/src/life-events-catalog.ts`（新）  | `LIFE_EVENT_CATALOG`（20 个原型）、`lifeEventCatalog()`                                                                                                                      |
| `packages/systems/src/narrative.ts`                  | 48 + 1（`school-days.left-school`）个变体模板、4 个选项模板、`enums.hobby` / `enums.skill`，中英对应                                                                         |
| `packages/systems/src/{shared,life,module,index}.ts` | `SYSTEMS_VERSION` 0.7.0 → 0.8.0；`PRIORITY.lifeEvent` 60、`lifeEventDecision` 61；生日调用排程；`lifeModule(region, { lifeEventCatalog })` 供测试注入；导出                  |
| `apps/web/src/i18n/locales/*.json`                   | 两个新决定类型与四个选项的界面标签（「所有决定都暂停」时决定卡不再显示原始 ID）                                                                                              |
| 既有测试的必要调整                                   | `yearly-focus.test.ts`：改为与同种子「均衡」对照的增量（同样严格）；`polity-change.test.ts`：版本 0.8.0；`apps/cli/src/cli.test.ts` 的 M3-011 投影：排除新原型事实并单独校验 |

已运行：类型检查、eslint、prettier 全部通过；完整 Playwright `116 passed`；既有单元测试除下面「待批准」两项外全部通过。

## 与规格的差异（实施时的决定，需写进完成报告）

1. **链条只启动一次**：生日只在原型第一次进入年龄与年代窗口的那一年排 `count: 0`，之后由处理器带着已发生次数排下一年。规格写的「每个生日都排 count:0」会在链条终止后重置一生上限（交接文档已指出）。
2. **`first-words` / `first-steps` 一生上限 2 → 1**：否则会出现两次「第一次开口」。
3. **`school-days` 新增变体 `left-school`**（新文案，需维护者抽查）：「已经离开学校，跟着家里人学着做事。」/「Out of school now; learned to help with the work at home.」。规格的 `self-study`（「没有上学，跟着家里人认了几个字」）现在只给从没上过学的人；真实地区 16 岁中学毕业，原规格会给所有未升学的 16—18 岁写「认了几个字」。
4. **`hobby-found` 的叙事顺序**：第一段就发出「找到爱好」事实，第二段只按选择写后果（`LifeEventDecision.settle`），否则时间线先出现「决定把闲暇投进这项爱好」再出现「找到爱好」。`learn-skill` 仍是先决定、再写结果。
5. **主题去重**：已有的爱好不再「找到」；已学成（等级 ≥ 0.7）的手艺不再学（`topicAvailable`）。
6. **未独立时的花费由家里承担**：`chargeLivingCostShare` 只在 `isIndependent` 时从主角账户扣钱；`canAffordLivingCostShare` 对未独立者恒真。理由：儿童账户初值 0，扣钱会让 `isPoor` 变真并抬高发病率，等于用日常小事改死亡风险（规格明确禁止的方向）。
7. **`nudgeParentBonds` 跳过已故父母**。
8. **接口形状**：`lifeEventDefinitions(region, catalog)`、`lifeEventDisclosure(catalog)`、`lifeEventCatalog()` 在目录文件；载荷 `{ count, topic? }`（没有 `variant`）；`PrototypeInput.topic`；原型的 `topics` / `topicAvailable`；`LifeEventDecision.optionIds` / `settle`。`PrototypeInput.currency` 是按需解析的 getter（性能，见下）。
9. **验收测试 11**：事实 `id` / `sequence` 是全局计数，插入夹具事实后会后移；比较时要过滤夹具类型并按位置重映射 `id` 与 `causeEventIds`，其余逐字节相同。
10. **规格允许范围之外改了 `apps/web`**（只加 i18n 标签，见上）与三个既有测试（见上）。

规格「需要维护者决定的问题」里其余各项（均值 2.5 优先覆盖率、搬家留给 M3-021、小意外不碰健康、`evidenceIds: []`、概率表的长期归属、高龄概率不递减、书信 2005 截止）都按规格自己的立场实现，没有另作决定。

## 实测（本机 Apple M5，Node 24.21.0）

- `pnpm bench --lives 1000`，旧 main 与新规则交替各 3 次：

  | 版本                      | p50 ms/局             | p95 ms/局                | 事实/局 | 平均快照 | 平均享年 | 工作量指纹                       |
  | ------------------------- | --------------------- | ------------------------ | ------- | -------- | -------- | -------------------------------- |
  | main `89973fb`            | 4.255 / 4.293 / 4.343 | 5.090 / 5.138 / 5.194    | 167.2   | 23,420 B | 76.4     | 84432c86f0fa2a5718f2ed242660a7f7 |
  | M3-042（currency 按需前） | 9.280 / 9.354 / 9.490 | 10.659 / 10.738 / 10.969 | 341.0   | 44,413 B | 76.4     | 7779e125526c3d50dc0d8ed3e6ec7c8f |
  | M3-042（当前）            | 8.638 / 8.600         | 10.052 / 10.050          | 341.0   | 44,413 B | 76.4     | 7779e125526c3d50dc0d8ed3e6ec7c8f |

  **超过 G1 的 5.5 ms。** CPU 采样：内核 `#verify` 约 29%（每个改了压力的事件都要对主角重跑 `CharacterStateSchema`；改了 bonds 时重跑整张关系图），各系统不变量约 12%（含每个事件解析一次宏观状态），`isISODate` 自身约 7%。规格要求不缩目录、不降概率；按 V0.1_PLAN §8 报告维护者，由道 K 另行做内核/契约层的等价优化（高风险，需单独批准）。

- **黄金人生（golden-1，1960-03-15），待维护者批准，不要自行写入 `golden.ts`**：
  - 事实 150 → **307**，指纹 `3d7f9e96b48679d1ef3f96c1795804e0` → **`bd77b163672cd6f299e60c2f6060a866`**；`processedKeys` 398 → 806；快照 22,083 → 42,106 字节；死亡日期不变（2024-06-01）。
  - 新增 157 条：daily-routine 26、rest-and-recover 27、household-affairs 22、friend-contact 19、family-time 8、neighborhood-play 8、minor-mishap 7、write-letters 6、school-days 5、early-childhood 4、learn-skill 4 + 4 条 `decision.made`（均为 give-up）、hobby-found 3 + 3 条 `decision.made`（均为 pursue）、teen-life 3、reunion 3、retired-days 2、first-words 1、first-steps 1、first-playmate 1。
  - 旧的 150 条经 ID 映射后内容与因果全部保留，只有 48 条 `finance.settlement` 的 `balanceMinor` 因花费而不同（结果码不变）。

- **CLI 的 M3-011 主角投影（`apps/cli/src/cli.test.ts`），待批准**：排除新原型事实后，`proj-S2` 的条数仍是 23,275，哈希 `767d9d8f…` → `1d9720c5920e325b625a7c830e3010961943cf255e5f081a9cc82a03de328560`。逐条对比 300 局：死亡日期全部不变；差异只来自花钱——17,997 条结算余额不同、95 条结算由 solvent 变 in-debt、1 次治疗因负担不起由 treat 变 forgo。`proj-S1` 尚未测（测试在第一个断言处停下）。批准后两个值都要按实测更新。

- **已知观察**：默认人生原则下 `learn-skill` 总是选「放弃」（规格给的选项分数让 give-up 胜出）；不改，写进报告。

对照脚本（一次性，不在仓库里，可直接复用）：`/private/tmp/claude-501/-Users-apxs-Documents-DSH------/221d1f9e-07c9-424f-add4-d78097560623/scratchpad/m3042/`（`golden.mjs` 旧新黄金对照、`legacy-diff.mjs` + `compare.mjs` 投影逐条对照、`top.mjs` CPU 采样汇总）。用法：`<worktree>/node_modules/node/bin/node golden.mjs <旧仓库根> <新工作树根>`。

## 剩余工作（按顺序）

1. **验收测试**：新建 `packages/systems/src/life-events.test.ts`（规格测试 1—25）与 `packages/real-world/src/life-events-batch.test.ts`（26—28）。按上面「与规格的差异」测试实现（例如测试 5(a) 用记录 `schedule` 调用的假上下文在链条起点年龄比较；测试 14 用已独立的成年夹具，并加一条「儿童不扣钱」；测试 11 用 ID 映射比较；上限从目录读）。测试 3、4、20、26 的阈值照规格，不得放宽；测试 20 的词表检查要去掉 `{{…}}` 占位符并按整词匹配（`skill` 含 `kill`，`together` 含 `he`）。
2. **批量体验指标**：M5-001 的批量 CLI 已在仓库（`apps/cli/src/batch.ts`）。分别在旧 main 与本工作树运行 `node src/batch.ts --lives-per-cell 125 --out <文件>`（在 `apps/cli` 下），把逐国与总体的 `visiblePerYear`、`emptyYearRatio`、`repetition`、`decisions.selectableMedian` 写进报告。
3. **完成报告**：新建 `docs/audits/M3-042-IMPLEMENTATION.md`（参照 `docs/audits/ADR-0011-IMPLEMENTATION.md` 的结构），更新 `M3-042.md` 顶部交接说明、`docs/tasks/INDEX.md` 的状态、`docs/HANDOFF-2026-10-21.md` 的相应段落。
4. **请维护者批准**黄金指纹与 CLI 投影的新值（给出上面的逐条差异）；**批准前不要改** `golden.ts` 与投影里的哈希。
5. 批准后：更新两处基线，`pnpm verify`、`PW_CHANNEL=chrome pnpm test:e2e`，在 `task/M3-042-life-events-v1` 本地提交（提交信息不得含 AI 署名），`pnpm check:commits main..HEAD`，报告 SHA 与测试结果。**不得推送**，推送须另行请求批准。

## 工具

- pnpm：把 `/private/tmp/claude-501/-Users-apxs-Documents-DSH------/221d1f9e-07c9-424f-add4-d78097560623/scratchpad/bin` 放在 PATH 最前（若该目录不可用，用仓库 `packageManager` 固定的 pnpm 版本）。
- `pnpm test:e2e` 复用 4173 端口上已有的服务器；运行前确认没有别的工作树占着这个端口。
