# M3-012d 清理审计：学制登记、历史注释与门禁

- 日期：2026-10-22
- 分支：`task/M3-012d-education-cleanup`（基线 main `8742255`）
- 状态：实现、测试与文档完成；`pnpm verify` 与 `PW_CHANNEL=chrome pnpm test:e2e` 全绿
- 基线：**未更新黄金指纹与 CLI 投影**；没有「为让测试通过而改基线」的改动
- 未合并、未推送；提交信息不含 AI 工具署名

## 1. 范围与文件

| 类别               | 文件                                                                                                                                                                                                                                             |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 学制登记与缺口表   | `docs/data/EDUCATION_SYSTEMS.md`（新增）                                                                                                                                                                                                         |
| 历史注释与来源引用 | `packages/country-packs/src/packs/{cn,jp,kp,kr,ru}.education.ts`                                                                                                                                                                                 |
| 来源登记           | `data/sources.json`、`data/SOURCES.md`（生成）                                                                                                                                                                                                   |
| 数据版本           | `packages/country-packs/src/packs/{cn,jp,kp,kr,ru}.meta.ts`（0.1.0 → 0.2.0）                                                                                                                                                                     |
| 门禁脚本           | `scripts/check-data.mjs`、`scripts/check-data.test.ts`                                                                                                                                                                                           |
| 幸福指标           | `packages/systems/src/indicators.ts`、`indicators.test.ts`、`apps/web/src/components/Indicators.tsx`                                                                                                                                             |
| 学制常量清理       | `packages/systems/src/region.ts`、`packages/real-world/src/region-model.ts`、`packages/synthetic-world/src/{region.ts,region.test.ts}`、`packages/systems/src/__fixtures__/focus-region.ts`、`packages/systems/src/{npc.test.ts,region.test.ts}` |

## 2. 历史注释核实（逐条）

| #   | 待核实说法                                      | 结论                       | 证据（已登记来源）                                                                                                                                                                                                                                                                                                     | 处理                                                                 |
| --- | ----------------------------------------------- | -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| 1   | KR 1949 年《教育法》已定 6 年义务教育           | **成立**                   | `kr-archives:compulsory-education`：1948 年宪法初等教育义务免费；1949 年《教育法》第 8 条六年初等义务教育；1950-06-01 施行、战争中断、1952 年施行令；1954—1959 完成计划                                                                                                                                                | 改正 KR-1 注释；`compulsoryYears` 0 → 6（行为中性，见 §5）；登记来源 |
| 2   | KP 1956 / 1958 / 1967 / 1972 的学制与义务教育   | **成立（与现数据不一致）** | `nkinfo:education-system`、`chinaemb-kp:education`：1956 年 4 年初等；1958 年 7 年中等（4+3）；1967 年 9 年（4+5）；1972 年决定 10+1 年、1973-04 实施                                                                                                                                                                  | 改正两段注释；**不改数值**：新增分段会改变行为，列入 §7 待批         |
| 3   | CN 1950 年代中小学收费；高校 1989 / 1997 起收费 | **成立**                   | `chsi:student-aid-70-years`（部分学校收学杂费、1955 年杂费管理通知、1966—1977 缴费入学、1978—1983 高校免费）；`edu-cn:tuition-reform`（1989 年全部收费、1993 年部分并轨、1997 年基本完成）；`cn-npc:compulsory-education-1986`、`moe-cn:compulsory-education-law`（1986 免学费收杂费、2006 免杂费、2008 城乡全面免除） | 改正 CN-2/3/4/5 注释；**不改 feeShare**（改数值会改变投影，列入 §7） |
| 4   | KR 1969 年初中免试与 1974 年高中平准化的区别    | **成立**                   | `kr-aks:admissions-1969-1974`：1969 年初中免试（首尔 1969、10 城 1970、全国 1971）、1974 年高中平准化；`kr-archives:compulsory-education`：初中义务教育 1984 年立法、1985 年分批、2002 年全面                                                                                                                          | 改正 KR-3 注释（原文把「平准化」并到 1969 年）；数值不变             |
| 5   | RU 1984 年入学年龄改革                          | **成立**                   | `ussr-1984:school-reform`：1984-04-12 第 313 号决议，逐步过渡到 11 年制、从 6 岁开始、小学 3→4 年、1—9 不完全中学、1—11(12) 完全中学                                                                                                                                                                                   | 改正 RU-3 注释；`primaryStartAge` 保持 7（改革未全面完成），列入 §7  |

**数值改动只有一处**：KR 1950—1952 的 `compulsoryYears` 0 → 6。先确认它在现有规则下不改变任何行为：
该段出生者的入学事件都发生在 1953 年后的分段，黄金指纹与 CLI 投影测试均逐字节不变。其余核实结果只改注释。

## 3. check-data 覆盖学制（高风险门禁）

`scripts/check-data.mjs` 新增导出的 `checkEducation(packs, sources, adrNumbers)`，在命令行模式下与既有检查一起运行：

- 每个教育分段必须有非空 `note`（说明）；
- `grade === 'D'` 必须引用 `adr:0007`；
- `grade === 'C'` 必须至少引用一个**已登记的非 ADR 来源**；
- 每个 `sourceIds` 都要能解析：`adr:` 编号必须存在于 `docs/adr`，其他来源必须在 `data/sources.json` 登记。

错误信息带国家、年份区间与缺失的 ID。测试新增 8 条（`scripts/check-data.test.ts`）：
D 级通过 / D 缺 adr:0007 / 缺说明 / C 只引 ADR / C 引用未登记来源 / C 引用已登记来源通过 /
D 引用未登记来源 / 仓库现有 15 段全部通过。命令行摘要现在报告分段数：

```text
$ pnpm check:data
来源登记检查通过：45 条来源，5 个国家包（15 个教育制度分段），61 个数据文件，10 个姓名表文件，SOURCES.md 已同步。
```

这是**门禁脚本改动**，按高风险单列，等维护者审查。

## 4. 幸福指标

`packages/systems/src/indicators.ts`：

- `deriveIndicators(snapshot, facts, education?)` 新增可选的第三参数（`EducationQueries`）。
  - `education.admitted` 若 `details.stage === 'secondary'` 且该年学制把中学完整覆盖在义务教育内
    （`stageIsCompulsory`），**不再计正面经历**；大学录取仍计。
  - 不传 `education` 时保持旧口径（计入），避免测试夹具与历史快照行为突变；Web 端传入
    `session.region.queries.education`。
  - `education.exam-failed` 且 `details.stage === 'tertiary'` 计**负面经历**；其他阶段的考试失败不计。
- 新增 3 条测试（`indicators.test.ts`）：义务教育内录取不计、非义务教育与大学录取计入、
  大学考试失败计负面而中学考试失败不计。

## 5. 学制常量清理与 dataVersion

- 从 `RegionRules` 删除 `primaryStartAge / primaryYears / secondaryYears / tertiaryYears`
  四个字段（这是 `systems` 的公共契约文件，高风险）；`REAL_RULES` 不再保留 7/6/3/4，
  学制只经 `queries.education.systemAt` 从国家包读取。
- 合成地区把同一组 D 级常数移到 `SYNTHETIC_EDUCATION_BASELINE`，行为逐项等价；测试夹具同步改为
  显式常数。这样不再存在「第二套学制」。
- 五国包 `dataVersion` 0.1.0 → **0.2.0**（ADR-0007 §8）：包内容在 M3-012 已改变行为；
  快照的 `dataPackVersions` 记录新版本。

## 6. 实际测试与输出

### `pnpm verify`（第二次完整运行；第一次因并行负载出现两个 5s 超时，见下）

```text
Test Files  93 passed (93)
     Tests  878 passed (878)
测试基线检查通过：878 项（基线 ≥ 150），93 个文件，无跳过。
✓ built in 417ms
```

第一次完整运行的 2 个失败均为 `Test timed out in 5000ms`（`packages/synthetic-world/src/life.test.ts`
的逐字节比较与 `apps/cli/src/cli.test.ts` 的双语事实渲染）。按任务说明「并行负载下既有重测试偶发 5s
超时是抖动」，单独重跑两个文件均通过：

```text
$ pnpm exec vitest run packages/synthetic-world/src/life.test.ts
Test Files  1 passed (1)   Tests  15 passed (15)

$ pnpm exec vitest run apps/cli/src/cli.test.ts
Test Files  1 passed (1)   Tests   9 passed (9)
```

随后第二次 `pnpm verify` 全绿（没有改测试、没有放宽超时）。

### `PW_CHANNEL=chrome pnpm test:e2e`

```text
130 passed (1.0m)
```

### 基线与确定性

- 黄金指纹测试 `matches the recorded golden fingerprint` 通过（未更新 `golden.ts`）。
- CLI 主角投影 `is byte-identical for 300 seeds across the whole birth-year range` 通过
  （未更新投影哈希）。
- 合成人生「快进 / 逐年 / 单事件」逐字节一致测试通过。

## 7. 待决（需维护者决定；本任务未实施）

1. **KP 分段**：是否按 1956/1958/1967/1972 四次改革拆段并调整义务/中学年限；会改变行为与投影。
2. **CN 收费**：是否把 `feeShare` 改成按阶段、按年代的规则（1950 年代学杂费、1986 免学费收杂费、
   2006/2008 免杂费、1989/1997 高校收费）；会改变投影。
3. **KR 初中义务教育**：2002 年后是否把 `compulsoryYears` 改为 9；会改变升学行为。
4. **RU 1984 入学年龄**：决议写 6 岁但改革未完成；是否改为 6 或保留 7。
5. **等级口径**：段级只有一个 `grade`；是否允许「结构 C + 参数 D」的混合/拆分等级。
6. **JP 来源**：需要可引用的《学校教育法》文本（e-Gov 抓取失败），才能把 JP 从待核实升级。
7. 任务书「本任务不做」的四项：CN 1966—1976 停招与推荐入学、「中学」含义统一、学费按年收取、
   学制证据进入事实。本任务只在注释与 `EDUCATION_SYSTEMS.md` 中登记，未改规则。

## 8. 高风险清单（提交审查用）

- `scripts/check-data.mjs`：门禁脚本（新增学制校验）。
- `data/sources.json` / `data/SOURCES.md`：新增 9 条来源登记（全部 NOASSERTION / unknown，
  只引用事实，不再分发原文；没有把任何来源标成可再分发）。
- `packages/country-packs/src/packs/*.education.ts` 与 `*.meta.ts`：国家包规则数据与 `dataVersion`。
- `packages/systems/src/region.ts`：公共契约删除四个学制字段。
- `packages/systems/src/indicators.ts`：幸福指标的派生规则（行为改动，带测试）。
- `packages/real-world/src/region-model.ts`、`packages/synthetic-world/src/region.ts` 与测试夹具：
  适配删除的字段。

## 9. 剩余风险

1. **9 条来源都是 NOASSERTION / unknown**：只用来支撑「史实/法律事实」的注释，不进入派生数据；
   若维护者要求再分发许可，需要另做许可审计。
2. **朝鲜与日本的结构值仍无官方来源**：注释已如实标「待核实」，缺口表逐条列出；不要据此宣称已核实。
3. **KR 1950—1952 的 `compulsoryYears` 改动虽然当前行为中性**，但它改变了包数据；若以后有规则
   在 1950—1952 年触发小学事件，会开始产生「免费/强制」差异。已登记在 `EDUCATION_SYSTEMS.md`。
4. **段级 grade 只有 D**：如果维护者采用 ADR 的「年份级 C」口径，需要重新评估 4 个有结构证据的段。

## 10. 复现

```text
pnpm check:data
pnpm exec vitest run packages/systems/src/indicators.test.ts scripts/check-data.test.ts
pnpm exec vitest run packages/synthetic-world/src/life.test.ts apps/cli/src/cli.test.ts
pnpm verify
PW_CHANNEL=chrome pnpm test:e2e
```

逐值登记与缺口表见 [docs/data/EDUCATION_SYSTEMS.md](../data/EDUCATION_SYSTEMS.md)。
