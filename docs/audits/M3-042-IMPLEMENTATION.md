# M3-042 通用人生事件原型库 v1 实现报告

- 日期：2026-10-21
- 分支：`task/M3-042-life-events-v1`（基于 main `89973fb`）
- 规格：[M3-042.md](../tasks/M3-042.md)；接手说明：[M3-042-HANDOFF.md](../tasks/M3-042-HANDOFF.md)
- 状态：**实现与测试完成；黄金指纹与 CLI 投影的新值等待维护者批准**（批准前未改 `golden.ts` 与投影哈希）

## 行为

20 个通人生事件原型由同一个数据目录与同一个年度运行器驱动（`packages/systems/src/life-events{,-catalog}.ts`）：

- **排程**：生日（`PRIORITY.birthday`）只在原型**第一次**进入年龄与年代窗口的那一年启动链条（`count: 0`），
  之后由处理器把已发生次数带到下一年；到达一生上限或离开窗口即终止。每年重新从 0 排程会在一生上限后重置计数。
- **随机流**：事件键 `life.<原型>|<实体>|year:<年份>`，每个原型的第一次抽样就是「今年是否发生」，
  因此新增原型不改变其他原型的抽样（测试 10、11）。
- **两段式决策**：`hobby-found` 与 `learn-skill` 先抽「今年有没有这件事」，发生了才排一条**非重大**决策事件
  （`PRIORITY.lifeEventDecision`），避免玩家在事件没发生的年份被提问；`hobby-found` 第一段就发出「找到爱好」事实，
  第二段只按选项写后果（`settle`），`learn-skill` 由选项决定变体。
- **后果**只写 M3-043 的细状态（`wellbeing.stress`、`social.ties`、`skills[]`）、`bonds` 数值与账户余额；
  金额一律 `scaleMinor(annualLivingCostMinor, 系数)` 后 `addMinor`，不改 `education`/`employment`/`vitalStatus`/`health.conditions`。
- **披露**：`lifeEventDisclosure()` 给界面「这是什么」，20 行、全部 `evidenceGrade: 'D'`；原型事实 `evidenceIds: []`。
- `SYSTEMS_VERSION` 0.7.0 → 0.8.0。

## 与规格/交接说明的差异

交接文档已列 10 条（链条只启动一次、`first-words`/`first-steps` 上限 1、`school-days.left-school` 新变体、
`hobby-found` 叙事顺序、主题去重、未独立者花费由家里承担、跳过已故父母、接口形状、测试 11 的 ID 重映射、
允许范围外改 `apps/web` 与三个既有测试）。本轮追加 6 条：

1. **`hobby-found.coverageFloor` 改为 `false`**。规格表 A 第 16 行原写「覆盖型 = 是」，但同文件 §频率预算 §3 把
   `hobby-found` 列进**风味型**（2.75 次/一生），测试 3 的两个手算值（年龄 6 → 0.0392、年龄 25 → 0.0486）也**不含**它。
   保留「是」会让测试 3 的 `coverageFloor && era.to === null` 集合多一个 0.25 的原型，年龄 6 变成 0.0294。
   已按维护者 2026-10-21 的确认改为 `false`，并同步表 A 第 16 行为「否（注）」。
2. **`daily-routine.at-home` 的压力增量 0 → 0.01**。原值为 0 且没有别的后果，测试 12「每个变体至少写一个状态字段」无法通过。
3. **测试 18 不能依赖 `@lifesim/narrative`**。`scripts/check-boundaries.mjs` 只允许 `@lifesim/systems` 依赖
   `content-schema` 与 `simulation-core`，而 `@lifesim/narrative` 既不在该包的 `package.json` 也不在根 devDependencies，
   所以测试里不能 `import { checkLocaleParity, createTemplateNarrator }`。改为在测试内实现三个等价助手
   （`flatten` / `placeholders` / `render`），断言不变：两种语言的**键集合相等**、每个模板的**占位符集合相同**、
   每个变体与选项都能渲染且不残留 `{{`。
4. **测试 23 的比较口径**：快照不含事实日志（Q9 设计，`snapshot()` 只存状态与调度器），因此「与一次跑完相同」按
   `[...快照前事实, ...恢复后事实]` 比较——与既有 `life.test.ts`「中途快照恢复」的口径一致。
5. **测试 12 的夹具**把 `stress` / `ties` 置 **0.5**。否则负向增量在 0 处被 `clamp01` 吃掉，
   「写了状态」与「没写状态」不可区分（这正是 `at-home` 那条 bug 的成因）。
6. **测试 26 的空年比例有口径副作用**（见「实际验证 §3」）：M3-041 的年度重点每年写一条 `decision.made`，
   它属于「可见事实」，于是空年比例恒为 0。规格的 `≤ 0.10` 因此**必然通过**，但它衡量不到内容覆盖。

## 实际验证

全部在本机（Apple M5，Node v24.21.0）执行。

### 1. 验收测试（规格 1—28）

```text
$ pnpm exec vitest run packages/systems packages/real-world packages/synthetic-world
 ✓ packages/systems/src/life-events.test.ts (25 tests) 19.3s
 ✓ packages/real-world/src/life-events-batch.test.ts (3 tests)
 FAIL packages/synthetic-world/src/life.test.ts > matches the recorded golden fingerprint
   AssertionError: expected 307 to be 150
 Test Files  1 failed | 14 passed (15)
      Tests  1 failed | 143 passed (144)
```

唯一失败项是**黄金指纹**，正是本报告请求批准的两处基线之一；未批准前不改。

### 2. 批量体验指标（M5-001 的 `batch` 命令，80 层 × 125 = 10,000 局）

```text
$ pnpm --filter @lifesim/cli batch --lives-per-cell 125 --out <文件>
```

| 指标（pooled）                      | main `89973fb`       | M3-042                |
| ----------------------------------- | -------------------- | --------------------- |
| 墙钟 `workload.totalMs`             | 101,645.64 ms        | 160,947.11 ms         |
| 每局耗时 p50 / p95 / p99（ms）      | 9.82 / 12.55 / 13.67 | 15.58 / 18.99 / 20.81 |
| **可见事件 / 在世年**               | **1.343**            | **3.565**             |
| 其中 `decision.made`（年度重点等）  | 1.010                | 1.088                 |
| **去掉 `decision.made` 的内容密度** | **0.333**            | **2.477**             |
| 其中原型事实                        | 0                    | **2.143**             |
| 无事件年份比例                      | 0                    | 0                     |
| 可选决定中位数 / 均值               | 1 / 1.249            | **8 / 7.272**         |
| 没有任何可选决定的人生占比          | 0.168                | **0.0449**            |
| 事实 / 局                           | 170.5                | 348.8                 |
| 不变量违规 / 运行错误               | 0 / 0                | 0 / 0                 |

逐国（M3-042，可见/年 · 空年比例 · 可选决定中位数 · 零决定占比）：
CN 3.535 · 0 · 8 · 0.0695；JP 3.5361 · 0 · 8 · 0.017；KP 3.5803 · 0 · 8 · 0.059；
KR 3.5186 · 0 · 8 · 0.05；RU 3.6655 · 0 · 8 · 0.029。

**结论**：P1 的三项判据在规格口径下全部达标（可见/年 3.565 ≥ 1.5、空年 0 ≤ 0.10、可选决定中位数 8 ≥ 5），
P2 的决定判据（中位数 ≥ 8）也刚好达到。但必须同时说明：**空年比例 0 是口径副作用**，
真正衡量内容密度的是「去掉 `decision.made` 后的 2.477 条/年」，与规格 §频率预算 预测的 2.52 吻合。
建议 M5-002 或 M5-001 的后续版本把「背景决定」从体验指标里剔除，否则这条判据永远为真。

### 3. 黄金人生（`golden-1` / `1960-03-15`，**等待批准**）

| 项                     | 改前                               | 改后                                   |
| ---------------------- | ---------------------------------- | -------------------------------------- |
| 事实条数               | 150                                | **307**                                |
| 指纹                   | `3d7f9e96b48679d1ef3f96c1795804e0` | **`bd77b163672cd6f299e60c2f6060a866`** |
| `processedKeys.length` | 398                                | **806**                                |
| 快照字节               | 22,083                             | **42,106**                             |
| 死亡日期               | 2024-06-01                         | 2024-06-01（不变）                     |

新增 157 条 = 150 条原型事实 + 7 条原型 `decision.made`（4 个 give-up、3 个 pursue）。
按类型：daily-routine 26、rest-and-recover 27、household-affairs 22、friend-contact 19、family-time 8、
neighborhood-play 8、minor-mishap 7、write-letters 6、school-days 5、early-childhood 4、learn-skill 4、
hobby-found 3、teen-life 3、reunion 3、retired-days 2、first-words 1、first-steps 1、first-playmate 1。
旧 150 条经 ID 映射后内容与因果保留，只有 48 条 `finance.settlement` 的 `balanceMinor` 因花费而不同。

### 4. CLI 主角投影（**等待批准**）

| 集合    | 条目                       | 哈希（旧 → 新）                                                                      |
| ------- | -------------------------- | ------------------------------------------------------------------------------------ |
| proj-S2 | 23,275（不变）             | `767d9d8f…` → **`1d9720c5920e325b625a7c830e3010961943cf255e5f081a9cc82a03de328560`** |
| proj-S1 | 21,871 → **21,838**（−33） | `917dffbd…` → **`a0c040d4ed3f723aa85f729309c59cb1570fb5606559c347043b1cb098318a44`** |

S1 的 −33 条按类型分解（排除新原型事实后）：`finance.settlement` −30、`health.treatment-started` −2、
`health.illness-onset` −1、`health.treatment-declined` +1。机制是日常花费改变余额 → 一次治疗由 treat 变 forgo →
连带一条发病与治疗事实的形态变化；**交接文档「差异只来自花钱」对 S2 成立，对 S1 还多出这几条健康事实**。
S1 此前从未被测过（测试在 S2 的第一处断言就停下），批准前请知悉这一点。

### 5. 性能

```text
$ pnpm bench --lives 1000
```

| 版本           | p50      | p95       | p99       | 事实/局 | 快照字节 | 享年 | 工作量指纹                         |
| -------------- | -------- | --------- | --------- | ------- | -------- | ---- | ---------------------------------- |
| main `89973fb` | 4.507 ms | 5.460 ms  | 5.909 ms  | 167.2   | 23,420 B | 76.4 | `84432c86f0fa2a5718f2ed242660a7f7` |
| M3-042         | 9.099 ms | 10.746 ms | 11.924 ms | 341.0   | 44,413 B | 76.4 | `7779e125526c3d50dc0d8ed3e6ec7c8f` |

**p50 是旧值的 2.02 倍，超过 G1 的 5.5 ms/局。** 每局事件数翻倍（167 → 341），内核每个改状态的事件都要重跑
`CharacterStateSchema` 校验与关系图校验。按规格与 V0.1_PLAN §8，本任务**不缩目录、不降概率**，
由道 K 另行做内核/契约层的等价优化（高风险，需单独批准）。10,000 局批量从 101.6 s 涨到 160.9 s（1.58×）。

## 审查要点与剩余风险

1. **黄金指纹与投影基线**：两处新值见上，维护者批准后才能写入 `golden.ts` 与 `cli.test.ts`。
2. **性能超预算**：p50 9.1 ms > 5.5 ms，需道 K 决策（内核按需复制、或缩小目录）。
3. **空年比例口径**：见「实际验证 §2」，建议把背景 `decision.made` 从体验指标剔除。
4. **`hobby-found` 的覆盖型归属**：已按维护者确认改为风味型；披露里 `coverageFloor: false` 的语义是「不参与覆盖下界」。
5. **文案待维护者抽查**：48 个变体 + 4 个选项的中英文案，尤其 `school-days.left-school` 与 `family-time.radio`（1995 截止）。
6. **`learn-skill` 在默认人生原则下总选「放弃」**：默认选项分数让 give-up 胜出，未改，属设计观察。
7. 既有的 10 条待维护者决定问题（均值 2.52 vs 覆盖率、ADR-0010 B 字段、搬家归属、年度重点是否乘、性能、
   小意外是否影响健康、证据标注、概率表长期归属、高龄概率、书信截止）**仍全部待决**，本任务按规格立场实现。

## 复现

```text
pnpm exec vitest run packages/systems packages/real-world packages/synthetic-world
pnpm bench --lives 1000
pnpm --filter @lifesim/cli batch --lives-per-cell 125 --out /tmp/batch.json
pnpm life --seed demo --birth 1978-05-04
pnpm verify
PW_CHANNEL=chrome pnpm test:e2e
```
