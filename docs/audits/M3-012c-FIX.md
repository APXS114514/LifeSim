# M3-012c 修复审计：学段时长与家庭教育支出

- 日期：2026-10-22
- 分支：`task/M3-012c-education-fixes`（基于 main `7f154b4`；协调者要求不合并更新的 main）
- 前置：M3-012b 审查发现的两个高严重度问题；顺带恢复 `polity-change.test.ts` 的版本断言
- 状态：实现、测试与基线更新完成；`pnpm verify` 与 `PW_CHANNEL=chrome pnpm test:e2e` 全绿
- 基线：按协调者裁决（维护者授权）更新；没有「为让测试通过而改基线」之外的规则改动

## 范围

允许改动面内的文件：

- `packages/systems/src/shared.ts`：`educationStageAges`、`primaryEntryAge`、`isIndependentForSettlement`、`SYSTEMS_VERSION`
- `packages/systems/src/education.ts`：学费付款方（在世父母 / 本人）
- `packages/systems/src/yearly-focus.ts`、`packages/systems/src/npc.ts`：入学/毕业年龄与生日排程
- `packages/systems/src/{education-era,yearly-focus,npc}.test.ts`、`packages/real-world/src/{education-fixes,polity-change}.test.ts`
- `packages/synthetic-world/src/golden.ts`、`apps/cli/src/cli.test.ts`：获批后的基线
- 本文件

`SYSTEMS_VERSION` 0.9.0 → 0.10.0。

## 问题 1：学段时长按入学那一年的学制

### 规则

- **入学年龄可确定**：小学用 `primaryEntryAge`（出生年 + 逐年学制，第一次满足 `age ≥ 当年 primaryStartAge`）；中学在小学毕业当天入学；大学在 `max(中学毕业, 法定工作年龄)` 的 `after-secondary` 决定里入学（与决定的排程同一公式）。
- **毕业年龄**：每段毕业 = 该段入学年龄 + **入学那年** `systemAt(入学年)` 的年限（`shared.educationStageAges`）。推迟入学不缩短学制；学制在就读期间改革不改变已经开始的学段长度。
- **排程**：毕业事件仍由**当年的生日**（`scheduleAnnualSystems` 的 `sameDay`）排，携带 `{ focus }`。没有新增 `CharacterState` 字段，也没有新增随机抽样。
- `yearly-focus` 与 `npc` 共用同一份日历；NPC 生日与主角生日走同一个教育事件处理器。

### 五个回归（修复后）

| 用例           | 事实（入学 → 毕业）          | 学制         | 修复前 |
| -------------- | ---------------------------- | ------------ | ------ |
| JP 1978 种子 e | 大学 1994-07-31 → 1998-07-31 | 4 年（1994） | 3 年   |
| KR 1980 种子 e | 大学 1996-07-30 → 2000-07-30 | 4 年（1996） | 3 年   |
| RU 1952 种子 d | 大学 1968-06-04 → 1973-06-04 | 5 年（1968） | 4 年   |
| KP 1955 种子 e | 大学 1971-07-31 → 1976-07-31 | 5 年（1971） | 6 年   |
| KP 1965 种子 e | 小学 1972-07-31 → 1976-07-31 | 4 年（1972） | 3 年   |

KP 1955 的 1972 年改革把中学年限从 3 改成 7、入学年龄从 7 降到 6：只在**新入学**的学段生效，已开始的大学仍是 5 年。KP 1965 的入学年龄那年从 7 降到 6：按当年学制判断入学，不再用「当前年份的入学年龄」倒推。

### 性质测试

`packages/real-world/src/education-fixes.test.ts`：五国 × 1950—2010 出生年 × 2 个种子（610 局），每个实际发生的学段都断言

```text
毕业年份 - 入学年份 === systemAt(入学年) 的该段年限
```

实际检查 1000+ 个学段（含中途死亡而跳过未毕业的学段）。另有一条 NPC 回归：朝鲜式 1972 年改革（入学年龄 7 → 6）时，NPC 生日处理器按推导出的入学年龄排 `education.primary-entry`，不会再漏掉整届学生。

### focus 读的是哪一年（返工点）

排程恢复带载荷之后：

- **中学升学**（`primaryExit` 里的 `focusProbability`）读 **primary-exit 那一年生日**携带的 focus。
- **after-secondary 决定本身**不读 focus（`options()` 不变）。
- **大学考试 / 录取**（`afterSecondary` 里的 `focusProbability`）读 **secondary-exit 那一年生日**携带的 focus：`secondaryExit` 把 `ctx.occurrence.payload` 原样传给 `after-secondary`；决定的日期可以被推到 `max(中学毕业, 法定工作年龄)`，但载荷不改。夹具里中学 18 岁毕业、18 岁决定，读 18 岁；KR 这类 15 岁毕业、16 岁决定的国家读 **15 岁**那年的 focus。
- `settle` / `health.check` / 就业等其余年度事项仍读 **当年生日**的 focus。

实测佐证（KR 1980，200 个种子，单年 preset）：focus 在 15 岁 → 学习 67 过 / 29 不过、休闲 57 过 / 39 不过；focus 在 16 岁 → 学习 59/37、休闲 59/37（无影响）。

### 可确定的路径 / 不可确定的路径

上述四段入学年龄都可由出生日期与逐年学制确定；本轮没有发现无法确定的路径。前提是：小学入学只尝试一次（第一次合格的那一年）、中学在小学生毕业当天入学、大学只在 `after-secondary` 决定当天入学——这些都是现有规则的结构，没有「中途转学/退学后重读」的路径。

## 问题 2：学费由家庭承担，孩子不因上学背债

### 规则

- **付款方**（`education.tuitionPayers`）：有自己收入（`employed` / `retired`）时用本人账户；否则由**在世父母**承担；没有在世父母时才用本人账户。
- **分摊**：按 `state.relationships` 里亲子关系的顺序（母亲在前、父亲在后）平均分摊，余数记给第一位；已故父母不参与。
- **负担能力**（`canAffordFee`）：家境不是「贫寒」时视为可以继续垫付（付款方余额可为负）；「贫寒」时按**在世父母余额之和**判断，不够就 `education.cannot-afford`，余额不变、不扣款。
- **事实**：`education.tuition-paid` 的 `details.balanceMinor` 改为**付款方**付款后的余额合计，并新增 `details.paidBy`（`family` / `self`）。叙事模板只读 `feeMinor` / `balanceMinor` / `currency`，键与占位符不变。
- **年度结算**（`isIndependentForSettlement`）：结算覆盖 `[age-1, age)` 这一年，按**被结算的那一年**判断独立；在这一年里还不到法定工作年龄的人不收生活费。15→16 岁那年不再按成年结算。

### 与 M3-042 的对应

M3-042 的「未独立时日常花费由家里承担」在 `chargeLivingCostShare` 里表现为：`isIndependent(actor, age, region)` 为假时**不从本人账户扣**（家庭吸收，不记家庭账户）。本任务的学费规则是同一口径的延伸：

| 项         | M3-042 日常花费                                  | M3-012c 学费                                         |
| ---------- | ------------------------------------------------ | ---------------------------------------------------- |
| 判断口径   | 没有自己收入（child/student 或未到法定工作年龄） | 没有自己收入（child/student/未就业）                 |
| 支出记到哪 | 不记账（家里承担，D 级简化）                     | 记到在世父母账户（按关系顺序分摊）                   |
| 缺失父母   | 不适用                                           | 才用本人账户                                         |
| 观察年份   | 事件发生的当年                                   | 入学当天；年度结算则看**被结算的那一年**（过去一年） |

### 真实输出

- KR 2005 种子 a：12 岁（2017-12-31）本人余额 **0**（修复前 −3,322,347）；中学学费 3,322,347 记在父母账户（−1,661,174 / −1,661,173，余数 1 给第一位）；12 岁前本人账户从未为负。
- JP 1978 种子 e：16 岁（1994-12-31）本人余额 **0**（修复前 −440,335）；1994 年没有 `finance.settlement`（15→16 岁不再按成年收生活费），大学学费 47,179 记在父母账户。
- 性质测试：五国 × 出生年 × 2 个种子，逐年在年末检查「第一次独立之前主角本人账户 ≥ 0」。

## 测试与真实输出

### (a) 中学升学与大学考试（配对种子）

300 对种子，同一 seed 分别 preset 学习 / 休闲在 12 岁与 18 岁；夹具（虚构）为六三三四、secondaryP = 0.5、考试 passBase = 0.5：

| 指标                          | 学习          | 休闲          |
| ----------------------------- | ------------- | ------------- |
| 中学升学（secondary-started） | 164           | 131           |
| 大学考试通过（exam-passed）   | 87            | 54            |
| 比例（升学 / 考试，按 300）   | 0.547 / 0.290 | 0.437 / 0.180 |

两条断言均通过（学习 > 休闲）。比例分母含未成年死亡，所以低于制度概率本身。

### (b) 落在 [0.5, 0.575) 的大学考试抽样

用 `deriveStream(seed, 'choice.after-secondary|char:protagonist|age:18')` 选出 **exam-window-48**：draw = **0.5327697424792361**；aptitude = 0.988515613617865；按 aptitude 反推制度 `passBase` = 0.35950209195957117，使「均衡」下考试概率正好 0.5、「学习」下 0.575。

| focus | 结果                                                         |
| ----- | ------------------------------------------------------------ |
| 均衡  | `education.exam-failed`（stage=tertiary，passRate 详情 0.5） |
| 学习  | `education.exam-passed`（stage=tertiary，passRate 详情 0.5） |

`details.passRate` 记录的是制度基础通过率（M3-012b 的口径，不含 focus 乘数）；乘数只作用在那一次抽样上（0.5 → 0.575）。

### 命令与结果

```text
$ pnpm verify
...
 Test Files  92 passed (92)
      Tests  857 passed (857)
测试基线检查通过：857 项（基线 ≥ 150），92 个文件，无跳过。
✓ built in 283ms

$ PW_CHANNEL=chrome pnpm test:e2e
  128 passed (47.4s)

$ pnpm check:commits main..HEAD
提交信息检查通过：2 个提交均无 AI 工具自动署名。
```

## 基线差异（按协调者裁决更新）

### 黄金指纹（golden-1 / 1960-03-15）

| 项   | 旧                                 | 新                                 |
| ---- | ---------------------------------- | ---------------------------------- |
| 条数 | 308                                | **307**                            |
| 指纹 | `a1848a94ee1cf66c9b438a38fb71e7d4` | `c058cccdc23acca81712449c0b3ef6a3` |

- 305 条旧事实经 ID 映射后日期/类型/结果/模板/版本/证据/演员完全一致，因果引用按映射全部一致（0 处不一致）。
- 删除 1 条 1975-03-15 `finance.settlement`（年龄 15，收入 0，支出 355,303，余额 −355,303）。
- 1976-03-15、1977-03-15 两条 settlement 的 `outcomeCode` 从 `in-debt` 变成 `solvent`（日期、收入、支出不变，余额各 +355,303）。
- 其余 47 条 settlement 只改 `balanceMinor`，且全部恰好 +355,303。
- 死亡日期不变：主角 2024-06-01、母亲 2017-08-16、父亲 1993-12-22；最终余额 29,522,019 → 29,877,322；学历不变。
- 原因：年度结算改按被结算年度判断独立，离校后、法定工作年龄前那一年不再收生活费。合成地区学费比例为 0，所以问题 2 不进入黄金。

### CLI 主角投影

| 投影                        | 旧条数 / 哈希                                                              | 新条数 / 哈希                                                                  |
| --------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| S2（1970 起，含空演员事实） | 23623 / `42ffa9899c6479ea9799478410630c7b07e768f6930db80080554c609a154da9` | **23541 / `632351853ba5e3a4699cf784b9788778060150c99580e69d4b0c92a23392ec5f`** |
| S1（1950 起，仅主角）       | 22155 / `f59d07f9d02899d234da6f337aa78e6b362263c0fcebeb0d9e1a2f0e1c48fbf1` | **22076 / `0ae1a4e1492d4c6c0586986de91ae52a986a0fce4821ed86880c73ace3d3f183`** |

逐局比对（用 `7f154b4` 旧代码在同一批 300 局上重跑）：

- S2：82/300 局不同；每局恰少 1 条零收入结算（离校后、法定工作年龄前那一年）；214 条结算 `in-debt` → `solvent`；5243 条结算只改 `balanceMinor`。
- S1：79/300 局不同；79 条零收入结算消失；247 条结算 `in-debt` → `solvent`；4780 条只改 `balanceMinor`；另有 8 条 `finance.redenominated` 只改 `beforeMinor` / `afterMinor`（1970 年前的旧债消失）。
- 所有既有结算的 `incomeMinor` / `costMinor` / `incomeSource` 完全不变；没有任何 `life.death` / 健康 / 教育 / 就业 / 家庭 / 历史事实变化；300 局死亡日期全部不变。
- 合成人生在默认人生原则下年度重点恒为 `balanced`（乘数 1），所以恢复 focus 载荷不改变黄金与投影；年度重点的回归只会在非均衡重点下出现（见测试 a / b）。

## 已知缺口：KR 贫寒家庭中学入学比例仍为 0

- 实测（200 个 KR 2005 种子）：贫寒家庭 58 个、中学录取 24 个、`education.cannot-afford` 24 个、实际入学 **0** 个；修复前后完全相同。
- 原因：Tier1 父母账户初值 0，且 M3-011 不为 NPC 结算收支（家庭经济属 M3-014）。「贫寒家庭能否负担看在世父母余额之和」在父母余额为 0 时永远为假；孩子不再背债（本任务目标达成），但受教育机会没有变化。
- 处理：按协调者裁决（维护者授权）**本任务不改家庭经济**，如实记为已知缺口，等 M3-014 有家庭收入/资产后再验收；没有改 Tier1 父母账户、没有碰 M3-011 的 NPC 收支、也没有改成「贫寒家庭也垫付」。

## 剩余风险

1. **父母垫付会让 NPC 变穷**：非贫寒家庭垫付后父母账户可为负，`isPoor` 为真会抬高父母的发病率与死亡率。实测个别真实人生的父母死亡日期提前（KR 2005 a 母亲 2086-07-16 → 2086-03-08；JP 2000 y 母亲 2056-11-30 → 2055-02-23）。等 M3-014 的家庭经济替换这条 D 级规则。
2. **大学考试读毕业当年的 focus**：在「毕业早于法定工作年龄」的国家（如 KR 15 岁毕业、16 岁决定），考试读 15 岁那年的重点，不是 16 岁决定那年的。这是 M3-041/M3-012b 的既有口径，本轮只恢复它；如果维护者要改为决定年的 focus，需要另立决定。
3. **`details.passRate` 的口径**：仍记制度基础通过率（不含 focus 乘数），与 M3-012b 一致；不是本轮回归。
4. **学费按学段收一次**，而 schema 的注释写的是「年度学费」：本轮保持 M3-012b 的一次性收费口径，未改成按年；属于数据/契约语义问题，另行处理。

## 后续（只报告，不在本任务修复）

1. CN 1966—1969 仍可录取大学：学制模型只有 `exam` / `none`，表达不了「停招」。
2. 「中学」在各国含义不同：JP/KR 的 `secondaryYears` 只含初中。
3. 15 个学制分段全是 D 级，引用的 ADR 并没有记录这些数值；缺口表缺失；`check-data` 不检查 `pack.education`。
4. 学制的证据等级没有进入事实（只有表级 `evidenceIds`）。
5. 学费按学段收一次，而 schema 写的是「年度学费」（见剩余风险 4）。
6. 幸福指标对 `education.admitted` 与 `exam-failed` 的处理未定义。
7. 几条历史注释可能不准（KR 1949 年的义务教育、KP 学制、CN 学费）。

## 复现

```text
pnpm life:real --region JP --year 1978 --seed e --all
pnpm life:real --region KR --year 1980 --seed e --all
pnpm life:real --region RU --year 1952 --seed d --all
pnpm life:real --region KP --year 1955 --seed e --all
pnpm life:real --region KP --year 1965 --seed e --all
pnpm life:real --region KR --year 2005 --seed a --all
```

测试见 `packages/real-world/src/education-fixes.test.ts`（五个回归 + 两条性质）、`packages/systems/src/education-era.test.ts`（年度重点 a/b、学费分摊、考试与学费）、`packages/systems/src/npc.test.ts`（NPC 入学年龄）、`packages/systems/src/yearly-focus.test.ts`（结算年度判断）。
