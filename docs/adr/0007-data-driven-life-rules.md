# 0007：数据驱动的 M3 人生规则

- 状态：**已采纳**（维护者于 2026-10-20 确认全部 7 项决定；M3-009 起按本 ADR 实施）
- 日期：2026-10-20
- 关联：ADR-0005（M2 数据架构）、ADR-0006（M3-lite）、Q3（RegionModel 扩展）、Q5（工资/收入）、Q8（死亡风险限幅）、Q11（城市与区划）
- 前置：M3-003（7 个指标契约）、M3-004—007（数据与锚点）

## 背景

M1 的 `RegionModel` 是为一组合成公式设计的：13 个查询方法 + 学制/效应常数，合成地区实现它，系统规则只依赖这个接口。M3-lite 用 D 级常数实现真实地区（ADR-0006），真实人生里的教育、求职、工资、医疗、死亡仍是「一国之内的固定规则」，没有按年份、城乡、家庭背景与宏观周期取数。

M3 已补齐：

- 教育：中学毛入学率、高中完成率；
- 劳动力：劳动参与率、农业就业占比；
- 价格与卫生：CPI（2010=100）、自付卫生支出占比、人均卫生支出；
- 历史：五国经济周期锚点（朝鲜待 Q10）。

现在必须决定：这些数据**怎样进入规则**，以及接口如何演进，才能既让规则继续只依赖 `RegionModel`，又不把「缺失怎么回退」「职业如何分类」埋进代码。

维护者已确认 Q3：保留 `RegionModel` 核心职责，通过独立的 `RegionTables` / 数据查询适配层引入国家、年份、地区与职业维度；**不一次性向原接口加大量方法，也不新增平行模拟引擎**。Q5：真实工资优先，禁止把人均 GDP 当平均工资，缺依据时用明确登记的 D 级假设。本 ADR 只写设计与边界，不实现。

## 决定

### 1. 接口分层：一个门面，两层内部

推荐方案（Q3 的方案 A）：

```text
规则（education / career / finance / health / life）
        │  只依赖
        ▼
   RegionModel（稳定门面，签名基本不变）
        │  委托
        ├── RegionTables（只读数据访问 + 来源/回退/证据）
        └── RegionQueries（教育/劳动力/价格/卫生四个领域查询）
                │
                ▼
          DataRegistry（M2 已有）
```

- **不新增工作区包**（Q13 默认；新增包需要另一次架构审查）。
- `RegionModel` 仍是 `packages/systems` 唯一的取数接口；规则文件不直接 import `DataRegistry` 或国家包 JSON。
- `RegionTables` 是**适配层**：把 `lookup` 的 `found/missing`、回退方法、证据等级变成规则能读的值；它不是第二个模拟引擎，不持有状态，不做事件调度。
- `RegionQueries` 是**领域查询**：把「指标」翻译成「学制/劳动力/价格/卫生问题」。先实现为 `RealRegion` 内部的四个对象，暂不拆成四个公共接口；等 M3-012—016 的调用稳定后，再评估是否正式拆分（另立 ADR）。
- `SyntheticRegion` 继续实现同一 `RegionModel`；新增的 `tables/queries` 由 D 级公式提供，**黄金指纹在 M3-009 不变**。

### 2. 接口草案（TypeScript，示意，不是最终实现）

```ts
export type DataGrade = 'A' | 'B' | 'C' | 'D';
export type DataQuality = 'exact' | 'neighbor-year' | 'parent-geography' | 'derived' | 'assumption';

/** 一个规则可用的数据值；缺失时不返回 0，而是 null + reason。 */
export interface DataValue {
  readonly value: number;
  readonly grade: DataGrade;
  readonly quality: DataQuality;
  readonly sourceIds: readonly string[];
  readonly sourceYear: number;
  readonly projected: boolean;
  readonly reason?: string;
}

/** 低层只读表：只回答「这个指标值是多少」，不做人生规则。 */
export interface RegionTables {
  /** 年粒度指标；缺失返回 null。 */
  value(indicator: Indicator, year: number): DataValue | null;
  /** 单岁指标（目前只有 life-table-qx）；缺失返回 null。 */
  ageValue(indicator: Indicator, year: number, age: number): DataValue | null;
  /** 该表/指标的来源元信息，用于事实的 evidenceIds。 */
  evidenceFor(indicator: Indicator): EvidenceMeta;
}

/** 领域查询：规则真正问的问题。 */
export interface EducationQueries {
  /** 该年、该城乡的中学毛入学率（0—200，percent-gross）。 */
  secondaryEnrollmentRate(year: number, settlement: Origin['settlement']): DataValue | null;
  /** 该年、该城乡的 25+ 高中完成率（0—1）。 */
  upperSecondaryCompletionRate(year: number, settlement: Origin['settlement']): DataValue | null;
}

export interface LaborQueries {
  participationRate(year: number): DataValue | null;
  agricultureShare(year: number): DataValue | null;
}

export interface PriceQueries {
  /** 2010=100 的 CPI；仅用于购买力折算。 */
  cpi(year: number): DataValue | null;
  /** 名义最小单位 → 以 baseYear 购买力表示的最小单位，整数、确定性。 */
  toRealMinor(
    nominalMinor: number,
    currency: CurrencyVersion,
    year: number,
    baseYear: number,
  ): number;
}

export interface HealthQueries {
  outOfPocketShare(year: number): DataValue | null;
  expenditurePerCapitaUsd(year: number): DataValue | null;
}

export interface RegionQueries {
  readonly education: EducationQueries;
  readonly labor: LaborQueries;
  readonly prices: PriceQueries;
  readonly health: HealthQueries;
}

export interface RegionModel {
  readonly packId: string;
  readonly dataVersion: string;
  readonly polityId: string;
  readonly evidence: Readonly<Record<RegionTable, EvidenceMeta>>;
  readonly anchors: readonly HistoricalAnchor[];
  readonly initialMacro: { economyPhase: EconomyPhase; currency: CurrencyVersion };
  readonly rules: RegionRules;
  readonly effects: RegionEffects;

  /** M3-009 新增：低层表与领域查询；规则不直接读国家包。 */
  readonly tables: RegionTables;
  readonly queries: RegionQueries;

  // 以下 13 个方法保留原签名，M3-009 只改实现，不改调用点。
  placeId(settlement: Origin['settlement']): string;
  urbanBirthShare(year: number): number;
  familyResourcesWeights(
    year: number,
    settlement: Origin['settlement'],
  ): readonly (readonly [Origin['familyResources'], number])[];
  mortalityQ(year: number, age: number): number;
  illnessOnsetP(year: number, age: number): number;
  primaryEnrollmentP(year: number, settlement: Origin['settlement']): number;
  secondaryContinuationP(year: number, origin: Origin): number;
  universityAdmissionP(year: number, aptitude: number): number;
  hiringP(year: number, level: EducationLevel, phase: EconomyPhase): number;
  jobLossP(year: number, phase: EconomyPhase): number;
  annualWageMinor(year: number, level: EducationLevel, currency: CurrencyVersion): number;
  annualLivingCostMinor(
    year: number,
    settlement: Origin['settlement'],
    currency: CurrencyVersion,
  ): number;
  treatmentCostMinor(year: number, currency: CurrencyVersion): number;
}
```

**为什么不是拆成五个公共接口**：拆开会让 `systems` 同时依赖五个接口，M3 的迁移面变大；Q3 要求「不一次性加大量方法」。四个 `RegionQueries` 子对象现在只是 `RegionModel` 的字段，未来可以不改规则调用点地正式拆分。

### 3. 现有调用点的迁移成本

以下每一处 `region.*` 调用在 M3-009 都**保持签名**；变化只在 `RealRegion` 内部从 D 级常数改为 `queries/tables`。

| 调用点                | 方法                                           | M3-009 后的数据来源                            | 迁移成本       |
| --------------------- | ---------------------------------------------- | ---------------------------------------------- | -------------- |
| `education.ts:19`     | `primaryEnrollmentP`                           | 学制基线 + 城乡入学假设（D，待小学净入学数据） | 零（实现替换） |
| `education.ts:55`     | `secondaryContinuationP`                       | 毛入学率校准 + 家庭资源权重（C/D）             | 零             |
| `education.ts:121`    | `rules`                                        | 国家/年代学制表（M3-012 新增）                 | 零             |
| `education.ts:145`    | `universityAdmissionP`                         | 学制 + 能力 + 国家/年代门槛（D）               | 零             |
| `career.ts:24`        | `hiringP`                                      | 劳动参与率 + 经济阶段 + 学历（C/B）            | 零             |
| `career.ts:25`        | `effects`                                      | 不变（风险乘数，Q8）                           | 零             |
| `career.ts:72`        | `jobLossP`                                     | 经济阶段 + 劳动参与率（C/D）                   | 零             |
| `finance.ts:26/30`    | `annualWageMinor`                              | 真实工资序列优先；否则 D 级基准（Q5）          | 零             |
| `finance.ts:31`       | `rules`                                        | 不变                                           | 零             |
| `finance.ts:37/41`    | `treatmentCostMinor` / `annualLivingCostMinor` | 卫生支出、CPI、城乡价格（B/C）                 | 零             |
| `health.ts:42`        | `illnessOnsetP`                                | 基线发病率 + 年龄/城乡（D）                    | 零             |
| `health.ts:72`        | `mortalityQ`                                   | WPP 生命表 + 乘数（B/A，Q8）                   | 零             |
| `health.ts:102/134`   | `treatmentCostMinor`                           | 卫生支出/自付比例（B/C）                       | 零             |
| `life.ts:40/43/45/46` | `packId/initialMacro/anchors`                  | 不变                                           | 零             |
| `life.ts:71`          | `urbanBirthShare`                              | WDI 城镇比例（B）                              | 零             |
| `life.ts:73`          | `familyResourcesWeights`                       | 城乡 + 年代（D/C）                             | 零             |
| `life.ts:78`          | `placeId`                                      | 人口池（不变）                                 | 零             |
| `life.ts:85/86`       | `polityId`                                     | 不变                                           | 零             |
| `life.ts:112/113/117` | `anchors/packId/polityId`                      | 不变                                           | 零             |

结论：**M3-009 不要求改任何规则调用点**；这保证 5 个规则文件与黄金指纹在接口任务中不动。M3-012—016 才按各自任务改规则行为。

### 4. 七个新指标如何进入规则

所有指标都通过 `RegionTables.value` 查询，规则不直接读 JSON。回退顺序沿用 ADR-0005 §4：精确 → 相邻 ≤2 年（不跨断点，降 C）→ 上级地理（降 C）→ 指标专属声明规则（D）→ 缺失。**缺失不是 0**。

| 指标                                   | 使用规则                  | 证据等级           | 单位/换算                       | 缺失时行为                                        |
| -------------------------------------- | ------------------------- | ------------------ | ------------------------------- | ------------------------------------------------- |
| `education-enrollment-secondary`       | 中学延续/入学机会校准     | B（WDI，毛入学率） | percent-gross 0—200；不除以 100 | 用国家学制 + D 级基线；事实标 D，界面提示「估算」 |
| `education-completion-upper-secondary` | 高中完成、学历资格        | B                  | share 0—1                       | 用毛入学率 + D 级完成率假设；标 C/D               |
| `labor-force-participation`            | 求职基线、劳动供给        | B（ILO 模型估计）  | share 0—1                       | 用 D 级年龄/学历基线；标 D                        |
| `employment-agriculture-share`         | 职业结构、农业职业权重    | B（ILO 模型估计）  | share 0—1                       | 用 D 级职业结构；标 D                             |
| `cpi-index`                            | 购买力折算、实际工资/支出 | B                  | index，2010=100                 | 不做折算（保持名义并披露）；不得假装有 CPI        |
| `health-out-of-pocket-share`           | 自付医疗负担、治疗决策    | B                  | share 0—1                       | 用 D 级自付比例假设；标 D                         |
| `health-expenditure-per-capita`        | 治疗成本量级、医疗可及性  | B                  | USD/人（现价，非 PPP）          | 用 D 级成本基线；标 D                             |

补充：

- 死亡率基线 **不**用新指标，继续用 WPP `life-table-qx`（M2 已登记）。
- 2008/1998 等经济锚点只改 `macro.economyPhase`，不直接改工资数值；由 `hiringP/jobLossP` 读取阶段乘数。
- 所有换算函数先查 `DataValue`；若值为 C/D 或 `quality !== 'exact'`，事实必须带对应 `evidenceIds`，不能写成 B 级。

### 5. 职业与教育分类（M3-013）

新增一个**受年代约束**的职业类别枚举（放在 `content-schema`，M3-013 实现）：

```ts
export const OCCUPATION_CATEGORIES = [
  'agriculture',
  'manual',
  'clerical',
  'sales-service',
  'professional',
  'technical',
  'public-service',
  'military',
] as const;
```

- 每个国家包登记 `occupationAvailability: { category, validFrom, validTo, sourceIds, grade }[]`；职业在角色年份**不在有效期内就不可选**，从结构上杜绝「1950 年代出现未来职业」。
- 学历是资格的必要条件，不是充分条件：`EducationLevel` → 可进入的职业类别由「国家/年代资格表 + 技能」决定；没有数据时用 D 级资格矩阵，事实标 D。
- 职业流动（转行、晋升、失业再就业）只改变 `occupation` 与技能，不重抽已发生的事实；技能值由确定性规则增长。
- 农业就业占比只用于**职业结构权重**，不直接决定某个人的职业。

### 6. 金额、工资与购买力（Q5）

- `annualWageMinor` 的优先级：
  1. 已核验、可再分发的真实工资/收入序列（目前没有；ILO 仅候选，Q4）；
  2. 有可信校准基准的间接估计（C 级，必须写明方法与误差）；
  3. 明确登记的 D 级设计假设（当前 `WAGE_BASE_MINOR` + 学历系数 + 增长）。
- **禁止**把人均 GDP 直接当平均工资，也**禁止**用 CPI 把人均 GDP「换算」成工资。CPI 只做同一收入/支出在不同年份间的购买力折算。
- 金额始终是整数最小货币单位。CPI 折算用整数运算，不用浮点累加：

```ts
/** 四舍五入到整数最小单位；numerator/denominator 均为正整数。 */
export function mulDivMinor(value: number, numerator: number, denominator: number): number;
// nominalMinor × cpi[baseYear] / cpi[year]
```

实现可用 `BigInt` 中间值避免溢出，最后按「四舍五入、远离零」取整；同一输入在任何平台上结果一致。CPI 缺失时返回原名义值，并让调用方把事实标为「未折算」。

- 生活成本、治疗成本同样走 `toRealMinor`；学费按国家/年代规则，不按现代比例拍脑袋。
- 家庭账户粒度按 Q2=A（M3-014）：个人账户 + 家庭层汇总，不得重复计算个人资产；转移必须平衡。

### 7. 死亡风险（Q8，待确认）

现状：`mortalityQ` 是生命表年度概率，个人乘数由 `RegionEffects.mortality` 调整。GDD §8.3 要求只做乘数调整，`P = 1 - exp(-H·m)`，`H = -ln(1-q)`。

草案建议（**不是已采纳数值**，请维护者逐项确认）：

1. 乘数链 `m` 先乘后限幅，建议下限 **0.5**、上限 **3.0**；限幅后不再乘第二次。
2. 死因与死亡在同一次检查里确定；死亡后不再产生主角行为。
3. 校准验收：按国家/年份/年龄带比较模型死亡率与 WPP 生命表，建议容差 **≤ 2 个百分点**（绝对），或相对误差 ≤ 10%，二者取更宽者；具体容差待确认。
4. 死因权重表暂用 D 级，明确标注；若维护者要求 A/B，则需另找可再分发来源。

未确认前 M3-016 不实现限幅数值，只保留接口占位。

### 8. 版本与兼容（Q9）

- M3-010 先把 `SYSTEMS_VERSION` 提升到 `0.3.0`；M3-009 修改 `RegionModel` 后提升到 **`0.4.0`**（2026-10-20 实施记录）。旧快照不能恢复时**保留原始内容、允许导出、提示不兼容**（M3-000 已实现），不静默删除。
- `SNAPSHOT_SCHEMA_VERSION` 保持 1，除非 M3-013/014/015 真的新增持久字段；新增字段必须同时更新 schema、迁移说明与测试。
- 数据包 `dataVersion` 按包提升（例如 `0.2.0`）；规则事实的 `evidence.modelVersion` 记录当时的数据版本，避免「用新数据解释旧事实」。
- 不做静默数据迁移；不把旧存档的 D 级结果改写成新数据结果。

### 9. 回退与披露

- 每条事实已经带 `evidenceIds`；M3 新增的规则事实必须在 `evidence` 中保留 `grade` 与 `methodId`。
- 界面（M4-006 及以前的最小实现）在涉及 C/D 级规则时显示「估算/设计假设」标记；B 级显示来源名。具体 UI 由 M4 任务实现，本 ADR 只要求**数据层可区分**。
- 叙事模板不输出「精确统计」口吻；对缺失数据只说「缺少可靠数据」，不编造。

### 10. 证据与许可

- 7 个新指标全部来自世界银行 WDI，许可 **CC BY 4.0**，已在 `data/sources.json` 逐指标登记并写入 `data/LICENSE_AUDIT.md`；派生值只保留非空观测，百分比按指标规格转成 share 或保留 percent-gross。
- 经济周期锚点来自日本内阁府、中国国家统计局、Brookings 与 WDI GDP 增长率；来源与日期口径已在来源 notes 中注明。
- 死亡率基线来自 UN WPP 2024（男女合计，B 级）；不新增分性别表（Q1）。
- 规则使用数据时必须在事实的 `evidence` 中保留来源与 `methodId`；C/D 级回退不得伪装成 B 级。
- 如果某项指标许可被撤回或无法再分发，替换来源或降级为 D 级假设，并保留旧事实的解释版本。

### 11. 回归测试计划

1. **确定性**：五国 × 出生年 1950/1970/1990/2020 × 固定 seed，跑完整人生，逐字节比较两次运行；不同出生年不得出现日期倒流。
2. **死亡率对照**：按国家/年份/年龄带（0、1—4、5—14、15—44、45—64、65+）比较模型死亡率与 WPP 生命表，输出偏差表；验收阈值待 Q8 确认。
3. **教育分布**：用 WDI 完成率/毛入学率对照模型输出的学历分布（允许口径差异，记录偏差），不得把毛入学率直接当完成率。
4. **购买力**：同一名义工资在 1990/2020 的 CPI 折算结果与手工整数计算一致；缺失 CPI 时不折算且事实标注。
5. **职业年代**：构造一个 1950 年出生、只能读到小学的角色，断言不会获得 1990 年代才存在的职业资格。
6. **性能**：`pnpm bench --lives 1000` 的 `timing` 与 `workload.fingerprint` 记录；加入 NPC 后重新测量，性能预算见 GDD §14.3。
7. **黄金指纹**：M3-009 不变；M3-010/012/013/014/015/016 如改变合成规则或 NPC，必须单独说明并等待维护者确认。

### 12. 实施顺序与任务边界

| 顺序 | 任务            | 内容                                                                  | 是否改规则行为       |
| ---- | --------------- | --------------------------------------------------------------------- | -------------------- |
| 1    | M3-009          | 加 `RegionTables/RegionQueries`，13 个方法签名不变，合成地区 D 级实现 | 否（黄金指纹不变）   |
| 2    | M3-010 / M3-011 | 出生家庭、Tier1 NPC 生命周期（依赖 M3-002，可与 009 并行）            | 是（黄金指纹可能变） |
| 3    | M3-012          | 学制、考试、教育费用按国家/年代                                       | 是                   |
| 4    | M3-013          | 职业类别、技能、职业流动（新枚举）                                    | 是                   |
| 5    | M3-014          | 家庭经济、CPI 购买力、资产负债                                        | 是                   |
| 6    | M3-015          | 疾病状态机、医疗决策                                                  | 是                   |
| 7    | M3-016          | 死亡风险统一模型与校准（等 Q8）                                       | 是                   |

M3-009 必须先合入，后续任务才能共享 `queries`；M3-010/011 只依赖 M3-002，不需要等 009。

### 13. 本 ADR 不覆盖

- **Q1 性别**与分性别生命表：不引入 `sex` 字段；婚育按抽象条件处理。
- **Q2 家庭账户粒度**：按已确认的方案 A 执行；继承、财产共有留给家庭系统任务。
- **Q6 国际迁移目的地包**：不新增第三国包；只做五国内部/五国之间。
- **Q7 生育率 → 个人概率**：不把 ASFR 当个人概率；等维护者决定。
- **Q10 敏感历史内容**：朝鲜经济锚点、脱北等不因本 ADR 获得授权。
- **Q11 城市权重/省级区划**：继续用「其他城镇/农村」人口池；城市权重与省级数据另立任务。
- 具体数值标定、UI 面板与文案：由后续任务或 M4 处理。

## 理由与取舍

- **保留 `RegionModel` 门面**：规则文件不需要同时理解数据表、回退与版本；迁移面最小。
- **`RegionTables` 不拥有状态**：避免出现「第二套模拟」；数据缺失仍由 DataRegistry 的既有回退规则处理。
- **不新增包**：符合 Q13 默认，减少依赖方向与构建复杂度；如果未来四个领域查询接口稳定，再评估拆包。
- **职业枚举 + 有效期**：把「时代错位」变成数据约束，而不是叙事审查。
- **CPI 只做购买力折算**：直接回应 Q5 的警告，避免把 GDP/CPI 当成工资来源。
- **Q8 数值留待确认**：死亡限幅是产品/科学边界，执行者不能自行拍板。

## 后果

- 正面：规则继续只依赖一个门面；新增数据不会扩散成 20 个方法；职业年代错位成为数据约束；CPI 与工资的边界写死，避免 Q5 警告的伪换算。
- 代价：`RealRegion` 需要维护 `RegionTables/RegionQueries` 两层映射；M3-009 虽不改规则签名，但会新增接口表面；四个领域查询暂不拆包，未来可能需要一次小重构。
- 风险：WDI 指标覆盖不均（朝鲜只有极少数点），回退与 D 级披露会被玩家看到；若 Q8 容差过严，死亡模型可能无法通过验收。
- 未采纳前，本 ADR 不授权任何源码或数据改动。

## 未决问题（需维护者逐条确认）

1. 是否接受「`RegionModel` 门面 + `RegionTables` + 四个 `RegionQueries` 子对象」的分层，且 M3-009 不拆公共接口？
2. 是否接受职业类别枚举的八个类别与「国家包有效期」约束？
3. Q5：在没有可再分发工资序列时，是否接受「D 级基准 + 明确标注 + 可替换」继续，而不是用 GDP 推算？
4. Q8：乘数上下限（0.5/3.0）、容差（2 个百分点或 10%）与死因权重 D 级是否接受？
5. Q11：M3 是否继续用人口池、不做城市权重？
6. 是否同意 M3-009 提升 `SYSTEMS_VERSION` 到 `0.4.0`（M3-010 已先到 `0.3.0`）、保持 `SNAPSHOT_SCHEMA_VERSION` 1？
7. 是否同意实施顺序与「M3-009 不改黄金指纹」的约束？

## 何时重新评估

- 维护者确认或修改 Q8/Q11 时；
- 任一新增指标被替换、许可变化或覆盖率不足以支撑规则时；
- M3-013 的职业枚举需要扩展（例如加入行业维度）时；
- 规则调用点开始需要 `RegionModel` 之外的数据（例如家庭层）时；
- 性能预算被突破或 NPC 规模改变时。

## 增补（2026-10-21）：教育制度的按年接口（M3-012）

> 背景：M3-012 细化实施时发现本 ADR 只定义了教育**统计指标**的查询（§2 的 `EducationQueries`），没有定义「学制随国家与年代变化」这一**规则数据**的形状与归属，导致任务无法在不新增 ADR 未定义结构的前提下落地。本节是最小充分增补，不改动前面各节的既有决定。

### 决定

1. **新增按年查询**（`RegionQueries.education` 扩展一个方法）：

   ```ts
   export interface EducationSystem {
     /** 入学年龄（小学一年级开始的周岁）。 */
     primaryStartAge: number;
     /** 各级修业年限（年）。 */
     primaryYears: number;
     secondaryYears: number;
     tertiaryYears: number;
     /** 义务教育年限；0 表示该年没有义务教育。 */
     compulsoryYears: number;
     /** 升学考试：没有考试，或有考试与基础通过率（0—1）。 */
     entranceExam: { kind: 'none' } | { kind: 'exam'; passBase: number };
     /** 学费与杂费占当年生活费的比例（0 = 免学费）；只作**名义**金额，不折算。 */
     feeShare: number;
     /** 该条目的证据等级与来源（D 级设计假设也必须写明）。 */
     grade: 'C' | 'D';
     sourceIds: readonly string[];
   }

   export interface EducationQueries {
     // …既有两个统计方法不变…
     /** 该年的学制；没有国别来源时返回 D 级设计假设，界面必须披露。 */
     systemAt(year: number): EducationSystem;
   }
   ```

2. **数据归属**：学制是**规则数据**而不是统计序列，放在国家包（`packages/country-packs`）里按年份分段的 `education` 小节，由 `real-world` 适配器读成 `systemAt`。它**不是** `StatSeries`、不进 `DataRegistry` 的回退链，也不占用 `Indicator` 枚举。
3. **合成地区与测试夹具**：用 D 级默认实现（与现有 `RegionRules` 常数等价），保证合成人生与既有夹具的行为不变；因此 `packages/synthetic-world` 与 `packages/systems/src/__fixtures__` 必须同步实现新成员（允许修改）。
4. **证据等级**：能引用已登记教育法规来源的年份为 C；没有来源的年份写 D 级设计假设并**如实列进缺口表**，不得冒充统计。朝鲜（KP）允许 C/D 混用并在披露中说明。
5. **零缺口时也不得编造**：某国某年缺少依据时，允许退回「该国该年代最近一条有依据的学制」并标 D，但必须在披露与缺口表里写明。

### 学费与购买力（与 Q14 的边界）

- M3-012 **只按名义金额**记账（`feeShare × 当年生活费`，整数最小单位），不使用 `prices.toRealMinor`。
- CPI 折算与 `toRealMinor` 的修订归 **M3-014 / Q14**；本 ADR 增补不预先实现第二套折算。
- §4 的回退表增补一行：`education-tuition-share` —— 缺失时用 D 级比例假设，事实标 D，界面提示「设计假设」。

### 兼容与版本

- 在 `EducationQueries` 上加方法是**接口扩展**：所有 `RegionModel` 实现（`real-world`、`synthetic-world`、`systems` 的测试夹具）都要实现，属 M3-012 允许的改动面。
- M3-012 提升 `SYSTEMS_VERSION`；教育行为的年代差异会改变事实，**黄金指纹一次性更新**并由维护者批准；不得为了让测试通过而调整阈值。
