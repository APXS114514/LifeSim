# 批量模拟报告格式（M5-001）

> 本文说明 `pnpm --filter @lifesim/cli batch` 产出的分层批量报告（GDD §14.2、[V0.1_PLAN](V0.1_PLAN.md) §2）。
> 报告只**测量与留档**：不声明容差、不判定发布资格。阈值形式化与校准指标归 M5-002 与维护者（见 §10）。

## 1. 怎么跑

    pnpm --filter @lifesim/cli batch [选项]

| 选项                          | 默认                                     | 含义                                                                             |
| ----------------------------- | ---------------------------------------- | -------------------------------------------------------------------------------- |
| `--lives-per-cell <n>`        | 1                                        | 每层局数；80 层 → 80 局（n=1）、160 局（n=2）、10,000 局（n=125）                |
| `--countries <CN,JP,...>`     | `BIRTH_REGION_IDS`（CN、JP、KP、KR、RU） | 国家与**层顺序**；顺序即报告里逐层数组的顺序                                     |
| `--decades <1950,1980>`       | 1950、1960…2020                          | 取值必须是 1950—2020 之间 10 的倍数；重复值去重、结果升序                        |
| `--settlements <urban,rural>` | `urban,rural`                            | 门控城乡；枚举顺序固定 `urban` 先于 `rural`                                      |
| `--pause-policy <all\|major>` | `all`                                    | 决定枚举口径（ADR-0008）：`all` = 所有非 background 决定；`major` = 只算重大决定 |
| `--seed-prefix <s>`           | `m5-001`                                 | 种子前缀（见 §4）                                                                |
| `--max-attempts-per-life <n>` | 200                                      | 单局拒绝抽样的尝试上限                                                           |
| `--out <path>`                | —                                        | 把完整报告写到文件；省略则把完整 JSON 打到 stdout                                |
| `--baseline <path>`           | —                                        | 读入一份旧报告，附上 `comparison`（见 §7）                                       |
| `--help`                      | —                                        | 打印用法，退出 0                                                                 |

退出码：

| 码  | 含义                                                                          |
| --- | ----------------------------------------------------------------------------- |
| 0   | 报告生成成功，且 `invariants.violations === 0 && errors.count === 0`          |
| 1   | 有违规或错误。**报告仍然写出**（先写文件再设退出码），CI 靠它标红             |
| 2   | 用法或配置错误：非法参数、未知国家、年代非法、读不到 `--baseline`、写报告失败 |

体验指标不达标**不**改变退出码：当前三项指标都远低于 P1（§8），接上阈值会让夜间长期标红、失去信号。

## 2. 报告顶层字段

所有浮点用 4 位小数、毫秒用 2 位小数取整；字节与计数是整数。报告里**没有时间戳、绝对路径与主机名**，
同参数两次运行的 diff 应当是空的（除了耗时与 `machine`）。

| 字段                                                                 | 口径                                                                                                                           | 单位          |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ------------- |
| `report`、`schemaVersion`                                            | 固定标识 `lifesim-batch-report` 与结构版本（当前 1）；扩字段时升版本                                                           | —             |
| `command`                                                            | 归一化命令串：固定前缀 `pnpm --filter @lifesim/cli batch` + `config` 各项；**不含** `--out` / `--baseline` 的路径              | —             |
| `versions.engine`、`versions.systems`                                | `ENGINE_VERSION`、`SYSTEMS_VERSION`                                                                                            | 版本号        |
| `versions.dataPacks`                                                 | 各国国家包的 `dataVersion`，键升序；`systems` 单独列在上面的字段里，不重复                                                     | 版本号        |
| `config`                                                             | 本次运行的 `countries` / `decades` / `settlements` / `livesPerCell` / `pausePolicy` / `seedPrefix` / `maxAttemptsPerLife`      | —             |
| `machine`                                                            | `node` / `platform` / `arch` / `cpu` / `cpuCount` / `memoryGiB`（不写主机名）                                                  | —             |
| `workload.totalLives`                                                | Σ 层的 `achievedLives`：构造成功且城乡命中的局                                                                                 | 局            |
| `workload.completedLives`                                            | 推进完成且没有抛错的局（体验、事实、快照、死亡、计时的分母）                                                                   | 局            |
| `workload.totalSimulationRuns`                                       | 含被拒绝尝试在内的**全部**模拟次数                                                                                             | 次            |
| `workload.rejectedRuns`                                              | 被拒绝的尝试数（城乡不命中）                                                                                                   | 次            |
| `workload.totalMs`                                                   | 墙钟毫秒，**含**拒绝抽样；不与 `timing.perLifeMs` 重复计                                                                       | ms            |
| `workload.livesPerSecond`                                            | `totalLives / totalMs × 1000`                                                                                                  | 局/秒         |
| `workload.layers[]`                                                  | 每层的 `requestedLives` / `achievedLives` / `completedLives` / `unreachableLives` / `attempts` / `rejectedAttempts`；顺序见 §4 | 局、次        |
| `timing.perLifeMs`                                                   | 单局**推进**耗时（不含构造、快照与指标统计）的 `p50` / `p95` / `p99` / `max`，最近秩法                                         | ms            |
| `timing.byCountry[]`、`timing.byLayer[]`                             | 同上，按国家 / 按层；`lives` 是参与计时的局数，等于对应的 `completedLives`                                                     | ms            |
| `invariants.violations`                                              | 抛 `SimulationError('invariant-violation')` 的**次数**；完成定义要求为 0                                                       | 次            |
| `invariants.lives`、`invariants.byCode`                              | 受影响的局数、按错误码计数                                                                                                     | 局、次        |
| `errors.count`、`errors.lives`                                       | 非不变量类错误（含构造失败与 `work-budget-exhausted`）的次数与局数                                                             | 次、局        |
| `errors.samples[]`                                                   | 最多 10 条 `{ seed, code, eventKey, at, message }`；`message` 截断到 200 字符，缺失的上下文是 `null`                           | —             |
| `facts.total`、`facts.meanPerLife`                                   | **全部**事实（含 `finance.settlement`）条数 / 每局均值（分母 `completedLives`）                                                | 条            |
| `facts.visibleTotal`、`facts.meanVisiblePerLife`                     | 可见事实（§3）条数 / 每局均值                                                                                                  | 条            |
| `facts.byType[]`                                                     | 全部事实按 `type` 计数，`share = count / facts.total`；按 count 降序、同 count 按 type 升序                                    | 条            |
| `snapshots`                                                          | 快照 JSON 字节数：`meanBytes` / `p50Bytes` / `p95Bytes` / `maxBytes`，取 `Buffer.byteLength(JSON.stringify(snapshot), 'utf8')` | 字节          |
| `death.lives`、`death.aliveAtEnd`                                    | 有 `ageAtDeath` 的局数 / 推进结束时仍在世的局数（`death.aliveAtEnd` 应为 0）                                                   | 局            |
| `death.meanAgeAtDeath`、`death.p50AgeAtDeath`                        | 死亡年龄（`summarizeLife(...).ageAtDeath`）的均值与中位数                                                                      | 岁            |
| `death.histogram[]`                                                  | `[0,4] [5,9] … [90,94]` 与最后一档 `[95, null]`，共 20 档；`to` 含端点                                                         | 局            |
| `repetition.overall`、`repetition.byCountry[]`                       | 事件重复率，见 §6                                                                                                              | —             |
| `experience.targets`、`experience.byCountry[]`、`experience.overall` | 三项体验指标与达标布尔值，见 §5                                                                                                | —             |
| `fingerprint.workload`、`fingerprint.metrics`                        | 见 §7                                                                                                                          | 32 位十六进制 |
| `comparison`                                                         | 只有给了 `--baseline` 才有对象，否则 `null`                                                                                    | —             |

约定：

- `snapshots` / `death` / `timing` 只统计 `completedLives`；失败的局只进 `achievedLives` 与 `invariants` / `errors`，
  其事实与指标**不**进入 `facts` / `repetition` / `snapshots` / `death` / `timing`。
- 逐国 / 逐层数组的顺序与 `workload.layers` 一致；逐国聚合一律从**逐局原始值**重算，不把已取整的层值相加。
- `experience.overall` 与 `experience.byCountry[]` 的条目字段相同，只是不含 `country`。
- `experience.*.met` 只适合在夜间规模（每层 ≥ 100 局）上读；每次提交的 80—160 局只能看趋势。

## 3. 「可见事实」的定义（包含 NPC 事实）

    isVisible(fact) = fact.type !== 'finance.settlement'

- 常量在 `apps/cli/src/batch/measure.ts`，与 `apps/cli/src/run-life.ts`、`run-real-life.ts` 的隐藏口径以及
  `apps/web/e2e/smoke.spec.ts` 的行数断言一致。不得再加别的过滤。
- **可见事件计数包含 NPC 事实**：M3-011 合并后，父母的 `npc.*` 事实（结婚、就业、患病、去世等）与主角事件在同一个
  事件日志里；「除 `finance.settlement` 之外的全部事实」因此**包含**它们，这是正确口径，不得把 `npc.*` 再排除。
  这会让「每年可见事件数」比只看主角事实时更高——读数字时要记住这个口径，它不是「主角每年遇到多少事」。
- `decision.made` 计入可见事实；但**不能**用它的条数代替可选决定数（§5）。
- `facts.byType` 用的是**全部**事实（含 `finance.settlement`），与可见事实是两个分母。

## 4. 分层与拒绝抽样

- 层 = 国家 × 出生年代 × 城乡。默认五国 × 8 个年代（1950、1960…2020）× 2 种城乡 = **80 层**，每层局数相同。
- **不做人口加权**（GDD §9.3 要求不忽略小国）。实测未加权抽样的城乡比例很偏（CN urban 39%、JP urban 83%、
  KP 55%、KR 64%、RU 67%），若按观测城乡事后分组，JP 的 `rural` 层只剩约 17% 的样本，小层会随机塌缩。
- **顺序固定**（报告指纹依赖它）：国家按命令行顺序 → 年代升序 → `urban` 先于 `rural` → 局序号升序。
- 层内出生年：`year = decade + (i % span)`，`span = min(10, 2027 − decade)`。2020s 层覆盖 2020—2026，
  `i = 7` 回到 2020；不传 `birthDate`，月日仍由 `selectBirth` 从种子抽，出生日期分布保持连续。
- 种子：`<seedPrefix>-<country>-<decade>-<settlement>-<i>`，重试时追加 `-r<attempt>`。
- **确定性拒绝抽样**：`BirthRequest` / `RealLifeRequest` 没有 settlement 覆盖（见任务文件的待决问题 1），
  而 `selectBirth` 只按当年 `urban-share` 抽城乡。因此对每个「层 + 局序号」，从 `attempt = 0` 起依次换种子构造
  会话，直到 `session.birth.settlement` 等于该层城乡；单局尝试上限 `--max-attempts-per-life`（默认 200），
  超限记 `unreachableLives` 并继续下一局。
- **实测开销**：10,000 局共发起 **27,345** 次模拟（接受 10,000 + 被拒 17,345），即每局约 2.73 次、
  比 1 局 1 次多 **1.73 倍**（规划阶段探针 1.72 倍，同量级）。
- 构造抛错（例如该年出生权重缺失）：记一条 `errors` 样本，该层的这一局计入 `unreachableLives`，
  继续下一局；**不整体中断批量运行**。因此每层恒有 `achievedLives + unreachableLives === requestedLives`。
- 单局失败隔离：`invariant-violation` 记进 `invariants`，其余记进 `errors`；两者都不中断运行、都会被写成样本。

## 5. 三个体验指标

三个指标全部逐国给出（`experience.byCountry`），另有总体（`experience.overall`）。阈值取自
[V0.1_PLAN](V0.1_PLAN.md) §2 与 D12，写进 `experience.targets`，由 `experience.*.met` 算达标布尔值；
**退出码不受它影响**。

| 指标           | 公式                                                                                                      | 主口径来源                             | P1                        | P2                        |
| -------------- | --------------------------------------------------------------------------------------------------------- | -------------------------------------- | ------------------------- | ------------------------- |
| 每年可见事件数 | `Σ 可见事实 / Σ 在世年份`（pooled）；辅助 `meanOfLifeMeans` = 逐局比值再取平均（长命权重更高）            | V0.1_PLAN §2「可见事件 ≥ 每年 1.5 条」 | `pooled ≥ 1.5`            | —                         |
| 无事件年份比例 | `没有任何可见事实的在世年份数 / Σ 在世年份`（pooled）                                                     | V0.1_PLAN §2「≥ 90% 的年份至少 1 条」  | `pooled ≤ 0.10`           | —                         |
| 每局可选决定数 | 每局在 `pauseOn` 枚举中遇到的**非 `background`** 决定里 `eligible ≥ 2` 的个数；报均值、中位数、零决定占比 | D12（维护者 2026-10-21 已决定）        | 中位数 ≥ 5、零决定 ≤ 0.10 | 中位数 ≥ 8、零决定 ≤ 0.10 |

口径细则：

- **在世年份** = 出生年…死亡年（含两端）的自然年数；`deathDate === null` 时用快照的 `at` 年份（报告里
  `death.aliveAtEnd` 应为 0）。
- **只计主角的决定**：M3-017 之后 NPC 也可能有决定，`pauseOn: 'all'` 下引擎同样会为 NPC 的决定返回
  `pendingDecision`。`total` 与 `selectable` 都只统计 `pending.actorId === 'char:protagonist'` 的决定；
  NPC 的待决事项仍然 `preset`（否则推进不动），但不进入任何一列指标。
- **不得用 `decision.made` 事实条数代替**：`background` 决定（例如 M3-041 的年度重点）不暂停、不面向玩家，
  但同样写 `decision.made`。实测同一批 10,000 局：`decision.made` 均值 **1.2634**，`all` 口径可选决定均值
  **1.2466**、`major` 口径 **0.5895**——事实条数不随暂停策略变化，可选决定数会变。报告用引擎的
  `pendingDecision` 枚举，所以 `decisions.decisionFactsMean` 只作诊断。
- 1 个合格选项的决定不算「可选」（没有选择），不计入。
- 三个指标是**密度与选择机会**的度量，不是校准指标（§10）。

## 6. 事件重复率（GDD §3.3）

`repetition.overall` 与 `repetition.byCountry[]`：

- `visibleFacts`：可见事实总数。
- `distinctTemplates`：这些事实里出现过的不同 `templateId` 个数。
- `withinLifeRepeatedShare`：**逐局**算「该局属于重复模板（该局内 count ≥ 2）的可见事实条数 / 该局可见事实条数」，
  再对各局取平均；没有可见事实的局按 0 计入分母。
- `meanDistinctTemplatesPerLife`：逐局不同 `templateId` 个数的平均。
- `topTemplates`：按 count 降序、同 count 按 `templateId` 升序，取前 10，`share` 以 `visibleFacts` 为分母。

它是**内容扩容信号**（同一 `templateId` 反复出现说明模板不够），不设阈值、不参与 `met`，也不是校准指标：
三项体验指标衡量密度与选择机会，重复率衡量多样性——密度够但全是同一条模板时，前三个数字仍可能好看。

## 7. 指纹与基线比较

- `fingerprint.workload`：按层顺序与局序号升序，对每个**被接受**的局做
  `fp = fingerprint(fp + fingerprint(canonicalJson(facts)))`（空串起，与 `pnpm bench` 的链式指纹同构）。
- `fingerprint.metrics`：`fingerprint(canonicalJson(projection))`，`projection` 是报告去掉 `command`、
  `machine`、`timing`、`comparison`、`fingerprint` 与 `workload.totalMs` / `workload.livesPerSecond` 之后的整份对象。
- 确定性：同一参数两次运行的 `fingerprint.workload` 与 `fingerprint.metrics` 必须完全相同（耗时与机器信息不参与）。
- `--baseline <path>` 产出 `comparison`：可比性要求 `schemaVersion`、`versions.engine`、`versions.systems`、
  `versions.dataPacks` 与整份 `config` 全部相同；否则 `verdict = "incomparable"` 并在 `reasons` 里列出差异路径
  （例如 `config.livesPerCell: 2 → 1`）。`incomparable` 时 `metrics` 仍然列出，但消费方**不得**据此判定回归。
- 固定比较的指标：`facts.meanPerLife`、`facts.meanVisiblePerLife`、`experience.overall.visiblePerYear.pooled`、
  `experience.overall.emptyYearRatio.pooled`、`experience.overall.decisions.selectableMedian`、
  `experience.overall.decisions.selectableZeroShare`、`snapshots.meanBytes`、
  `repetition.overall.withinLifeRepeatedShare`、`death.meanAgeAtDeath`，以及 `timing.perLifeMs.p50` / `p95`
  （**只在同一台机器上比较才有意义**）。

## 8. 当前基线

下表用本任务的 `batch` 命令在 **`main` = `8bd5ccc`** 上重测（测量日期 **2026-10-21**），替换任务文件
「背景 §1」里在 `8eb94c1` 上测的探针基线。

**测量条件**

- 规模：`--lives-per-cell 125` → 80 层 × 125 = **10,000 局**（每国 2,000 局）。
- 机器：Apple M5 / 16 GiB；Node v24.21.0；darwin arm64。
- 命令：`pnpm --filter @lifesim/cli batch --lives-per-cell 125`；`major` 列另跑
  `--lives-per-cell 125 --pause-policy major`。
- **并发条件：同一台机器上另有 3 个 Agent 并行跑 `pnpm verify`。下表所有毫秒数都是并行负载下的临时值，
  不是性能基线，正式数字由协调者单独重测后再写。**
- 与探针的差异：探针按国随机取出生年、种子是 `m5-probe-*`、且不强制城乡配比；本表是固定分层 + 包含 `npc.*`
  可见事实。两套数字**不要相减**。

| 国家 | 每局事实 | 可见事实/年（pooled） | 无事件年份比例 | 可选决定 all：均值 / 中位数 / 零决定 | 可选决定 major：均值 / 中位数 / 零决定 | 每局 ms（p50） | 快照字节 |
| ---- | -------- | --------------------- | -------------- | ------------------------------------ | -------------------------------------- | -------------- | -------- |
| CN   | 87.53    | 0.3217                | 0.7880         | 1.2475 / 1 / 0.1790                  | 0.5845 / 1 / 0.4155                    | 9.58           | 19,008   |
| JP   | 99.70    | 0.3341                | 0.7728         | 1.3310 / 1 / 0.1225                  | 0.5965 / 1 / 0.4035                    | 10.44          | 21,114   |
| KP   | 83.39    | 0.3512                | 0.7806         | 1.1790 / 1 / 0.2050                  | 0.5870 / 1 / 0.4130                    | 8.82           | 18,133   |
| KR   | 91.97    | 0.3119                | 0.7902         | 1.2820 / 1 / 0.1585                  | 0.5855 / 1 / 0.4145                    | 10.23          | 19,887   |
| RU   | 90.93    | 0.4342                | 0.7410         | 1.1935 / 1 / 0.1805                  | 0.5940 / 1 / 0.4060                    | 9.37           | 18,553   |
| 合计 | 90.71    | 0.3491                | 0.7749         | 1.2466 / 1 / 0.1691                  | 0.5895 / 1 / 0.4105                    | 9.67           | 19,339   |

同一批 10,000 局的其它数字：

| 项                               | 值                                                                                         |
| -------------------------------- | ------------------------------------------------------------------------------------------ |
| 单局耗时 p50 / p95 / p99 / max   | 9.67 / 13.62 / 24.50 / 115.25 ms（并行负载下的临时值）                                     |
| 总墙钟（`workload.totalMs`）     | 102.3 s（并行负载下的临时值；`major` 口径为 110.6 s）                                      |
| 模拟次数                         | 27,345 次（接受 10,000 + 被拒 17,345，1.73 倍开销）                                        |
| 不变量违规 / 运行错误            | 0 / 0                                                                                      |
| 不可达局                         | 0                                                                                          |
| 事实总数 / 每局均值              | 907,059 条 / 90.71 条                                                                      |
| 可见事实总数 / 每局均值          | 279,819 条 / 27.98 条                                                                      |
| 死亡年龄 均值 / 中位数           | 78.66 岁 / 86 岁                                                                           |
| 死亡年龄分布（前几档）           | `[0,4]` 412、`[80,84]` 1,178、`[85,89]` 1,452、`[90,94]` 1,729、`[95,∞)` 2,223             |
| 重复率 `withinLifeRepeatedShare` | 0.4997（总体）；逐国 0.4570—0.5542                                                         |
| 不同模板数                       | 37                                                                                         |
| 每局不同模板数均值               | 19.65                                                                                      |
| 工作负载指纹                     | `3803f7f33ac70b20b2295265add466e7`（`all`）、`303ebd0cd4c9c33710603a597c4a5eaf`（`major`） |

P1/P2 全部不达标：`visiblePerYear.pooled` 0.3491（目标 ≥ 1.5）、`emptyYearRatio.pooled` 0.7749
（目标 ≤ 0.10）、可选决定中位数 1（P1 目标 ≥ 5）、零决定占比 0.1691（目标 ≤ 0.10）。**这不是本任务要修的问题**，
报告只负责把它变成可比较的数字，内容扩容与阈值归后续任务。

## 9. 夜间任务

`.github/workflows/nightly-batch.yml`：

- 触发：`schedule: '17 18 * * *'`（UTC 18:17 = 北京时间 02:17，避开整点高峰）与手动 `workflow_dispatch`
  （可传 `lives-per-cell`）。`schedule` 只在默认分支触发，因此只在 `main` 上夜间跑。
- 规模：默认 `--lives-per-cell 125` → 10,000 局。本机实测约 1 分 43 秒（并行负载），
  `ubuntu-latest` 按慢 3—4 倍估约 3—7 分钟，`timeout-minutes: 45` 有余量。
- 失败行为：批处理以退出码 1 结束时 job 标红；报告在设退出码之前已经写出，`if: always()` 保证产物
  `batch-report.json` 仍作为 artifact 上传（保留 90 天，GDD §14.4 留档要求）。
- 独立性：工作流与 `ci.yml` 分开，**夜间失败不阻塞普通推送的 CI**；本轮也不把每次提交的轻量回归接进 `ci.yml`
  （那属高风险路径，按默认执行：先手动跑 §1 的命令）。

## 10. 与其它任务的边界

- **M5-002（统计校准指标与容差）** 管的是模型与真实统计的偏差（年龄别死亡率 vs 生命表、教育分布、生育、经济等），
  由 D10 声明逐指标容差；**不包含**本报告的三项体验指标。若维护者要把三项体验指标形式化进门禁，应在 M5-002
  里另行声明并复用本报告的字段；本任务只提供测量，不声明容差、不判定发布资格。
- **GDD §3.3 的事件重复率** 是内容扩容信号（§6），既不是校准指标，也不是体验指标的一部分。
- 报告里体验类字段统一在 `experience.*`、重复率在 `repetition.*`，不与 M5-002 的校准指标共用命名。
- `batch` 是仓库**唯一**的批量运行器；M3-016 / M3-019 / M3-028 需要批量数据时应调用它或复用它的指标函数，
  不要各自再写一份。
- 字段不够用时由 M5-002 在自己的任务里升 `schemaVersion` 扩展，本任务不预埋空字段。

## 11. 不得据此下统计结论

- 事件概率是 **D 级设计假设**（见 [DATA_POLICY.md](DATA_POLICY.md) 的证据等级表）：本报告衡量的是**游戏规则产出的
  分布**，不是任何真实人口的统计事实，不能当作人口学或社会学结论引用，也不能与真实统计表直接比较。
- 真实统计口径的对比属于 M5-002 的校准工作，且必须使用有来源、经核验的 A/B 级数据。
- `experience.*.met` 是相对 V0.1_PLAN / D12 的**产品目标**判定，不是统计显著性检验，也不代表发布资格。
