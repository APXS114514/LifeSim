# 数据许可审计

> 本文件记录外部数据来源许可核验的**证据**；结论必须经维护者在 PR 审查中确认后才生效。
> 任何派生数据进入仓库之前，其来源必须在本文件确认为可再分发（`allowed`），并在 [sources.json](sources.json) 中登记。
>
> 核验日期：2026-10-20。核验人：执行 Agent，待维护者确认。

## `un-wpp:2024` — 联合国 World Population Prospects 2024

### 条款页面

- 官方数据下载清单（UN Population Division）：<https://population.un.org/wpp/assets/downloads.json>，访问日期 2026-10-20。
- 许可全文（Creative Commons）：<https://creativecommons.org/licenses/by/3.0/igo/>，访问日期 2026-10-20。

### 条款原文摘录

WPP 下载清单每个数据组的 `Footer` 字段：

> Copyright © 2024 by United Nations, made available under a Creative Commons license CC BY 3.0 IGO: <http://creativecommons.org/licenses/by/3.0/igo/>
> Suggested citation: United Nations, Department of Economic and Social Affairs, Population Division (2024). _World Population Prospects 2024, Online Edition_.

CC BY 3.0 IGO 许可摘要（<https://creativecommons.org/licenses/by/3.0/igo/>）：

> You are free to: Share — copy and redistribute the material in any medium or format for any purpose, even commercially. Adapt — remix, transform, and build upon the material for any purpose, even commercially.
>
> Under the following terms: Attribution — You must give appropriate credit, provide a link to the license, and indicate if changes were made. You may do so in any reasonable manner, but not in any way that suggests the licensor endorses you or your use. No additional restrictions — You may not apply legal terms or technological measures that legally restrict others from doing anything the license permits.

### 结论

| 问题               | 结论 | 依据                                                                                                                                           |
| ------------------ | ---- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| 允许再分发？       | 是   | CC BY 3.0 IGO 的 Share 权利，任何介质与格式。                                                                                                  |
| 允许修改后再分发？ | 是   | Adapt 权利；须注明改动（本项目把 CSV 转换为 `StatSeries` JSON）。                                                                              |
| 署名要求？         | 有   | 适当署名、附许可链接、注明改动；建议引用为 United Nations, DESA, Population Division (2024), World Population Prospects 2024, Online Edition。 |
| 商业使用限制？     | 无   | Deed 明确 "for any purpose, even commercially"。                                                                                               |

**建议结论：`allowed`（待维护者确认）。**

说明：联合国网站的一般 [Terms of Use](https://www.un.org/en/about-us/terms-of-use) 写有仅供个人非商业使用；该页面同时说明特定材料可以适用更具体的条款，而 WPP 数据在官方下载清单中明确采用 CC BY 3.0 IGO。本审计以**数据集专属条款**为准。

### 官方下载入口与文件名（只登记，未在本任务下载）

| 文件                                                       | 用途                           | 字节数      | 链接                                                                                                                                             |
| ---------------------------------------------------------- | ------------------------------ | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `WPP2024_Demographic_Indicators_Medium.csv.gz`             | 年出生数（Medium 方案）        | 16,557,272  | <https://population.un.org/wpp/assets/Excel%20Files/1_Indicator%20(Standard)/CSV_FILES/WPP2024_Demographic_Indicators_Medium.csv.gz>             |
| `WPP2024_Life_Table_Complete_Medium_Both_1950-2023.csv.gz` | 单岁生命表（男女合计，估计期） | 200,036,668 | <https://population.un.org/wpp/assets/Excel%20Files/1_Indicator%20(Standard)/CSV_FILES/WPP2024_Life_Table_Complete_Medium_Both_1950-2023.csv.gz> |
| `WPP2024_Life_Table_Complete_Medium_Both_2024-2100.csv.gz` | 单岁生命表（男女合计，预测期） | 203,785,578 | <https://population.un.org/wpp/assets/Excel%20Files/1_Indicator%20(Standard)/CSV_FILES/WPP2024_Life_Table_Complete_Medium_Both_2024-2100.csv.gz> |

## `worldbank-wdi:SP.URB.TOTL.IN.ZS` — 世界银行 WDI 城镇人口比例

### 条款页面

- 数据目录的许可说明：<https://datacatalog.worldbank.org/public-licenses>，访问日期 2026-10-20。
- World Bank Data 的 Summary Terms of Use：<https://data.worldbank.org/summary-terms-of-use>，访问日期 2026-10-20。
- WDI 数据集页面：<https://datacatalog.worldbank.org/search/dataset/0037712>，访问日期 2026-10-20。
- 指标元信息：<https://api.worldbank.org/v2/indicator/SP.URB.TOTL.IN.ZS?format=json>，访问日期 2026-10-20。

### 条款原文摘录

Data Catalog 的 Public Licenses 页面：

> The World Bank Group makes data publicly available according to open data standards and licenses datasets under the Creative Commons Attribution 4.0 International license (CC-BY 4.0). Many datasets are available under other licenses. They are labeled accordingly, and when they are accessed by users, users agree to comply with all of the terms of the respective licenses, as explained below.
>
> Creative Commons Attribution 4.0 (CC-BY 4.0) The Creative Commons Attribution 4.0 International license allows users to copy, modify and distribute data in any format for any purpose, including commercial use. Users are only obligated to give appropriate credit (attribution) and indicate if they have made any changes, including translations.

Data 网站的 Summary Terms of Use：

> Unless indicated otherwise in the data or indicator metadata, you are free to copy, distribute, adapt, display or include the data in other products for commercial or noncommercial purposes at no cost under a Creative Commons Attribution 4.0 International License, with the additional terms below.

WDI 数据集页面的 "Data Access and Licensing" 部分：

> Classification : Public
> License : Creative Commons Attribution 4.0
> This dataset is licensed under Creative Commons Attribution 4.0

### 结论

| 问题               | 结论 | 依据                                                                               |
| ------------------ | ---- | ---------------------------------------------------------------------------------- |
| 允许再分发？       | 是   | CC BY 4.0 的 copy、distribute 权利。                                               |
| 允许修改后再分发？ | 是   | adapt 权利；须注明改动（本项目把百分比除以 100 转成 share）。                      |
| 署名要求？         | 有   | 适当署名、附许可链接、注明改动。                                                   |
| 商业使用限制？     | 无   | 条款明确 "including commercial use" / "for commercial or noncommercial purposes"。 |

**建议结论：`allowed`（待维护者确认）。**

### 官方下载入口（只登记，未在本任务下载）

- 指标页面：<https://data.worldbank.org/indicator/SP.URB.TOTL.IN.ZS>
- API（五个国家、全部年份、单页）：<https://api.worldbank.org/v2/country/CHN;JPN;PRK;KOR;RUS/indicator/SP.URB.TOTL.IN.ZS?format=json&per_page=20000>
- 版本记录：API 响应元信息 `lastupdated: 2026-10-08`；WDI 数据集页面显示数据文件 Last Updated 2026-10-09、元信息 2026-10-12。

## `worldbank-wdi:SE.SEC.ENRR` — 世界银行 WDI 中学毛入学率

### 条款页面

- 数据目录许可说明：<https://datacatalog.worldbank.org/public-licenses>，访问日期 2026-10-20。
- Summary Terms of Use：<https://data.worldbank.org/summary-terms-of-use>，访问日期 2026-10-20。
- WDI 数据集页面：<https://datacatalog.worldbank.org/search/dataset/0037712>，访问日期 2026-10-20。
- 指标元信息：<https://api.worldbank.org/v2/indicator/SE.SEC.ENRR?format=json>，访问日期 2026-10-20。

### 结论

条款与 `SP.URB.TOTL.IN.ZS` 相同（CC BY 4.0，允许复制、修改、再分发，须署名并注明改动）。本项目只输出非空年度观测，保留毛入学率的百分比口径（可以超过 100），不写入预测值、不补零。

| 问题             | 结论 | 依据                                           |
| ---------------- | ---- | ---------------------------------------------- |
| 允许再分发？     | 是   | CC BY 4.0 copy / distribute。                  |
| 允许修改？       | 是   | 只保留观测年份、按指标口径输出，属格式转换。   |
| 署名与改动说明？ | 有   | `data/SOURCES.md` 与 `sources.json` 的 notes。 |
| 商业使用限制？   | 无   | 条款明确 including commercial use。            |

**建议结论：`allowed`（待维护者确认）。**

### 官方下载入口

- 指标页面：<https://data.worldbank.org/indicator/SE.SEC.ENRR>
- API：<https://api.worldbank.org/v2/country/CHN;JPN;PRK;KOR;RUS/indicator/SE.SEC.ENRR?format=json&per_page=20000>
- 版本记录：API `lastupdated: 2026-10-08`。

## `worldbank-wdi:SE.SEC.CUAT.UP.ZS` — 世界银行 WDI 高中完成率

### 条款页面

- 数据目录许可说明：<https://datacatalog.worldbank.org/public-licenses>，访问日期 2026-10-20。
- Summary Terms of Use：<https://data.worldbank.org/summary-terms-of-use>，访问日期 2026-10-20。
- WDI 数据集页面：<https://datacatalog.worldbank.org/search/dataset/0037712>，访问日期 2026-10-20。
- 指标元信息：<https://api.worldbank.org/v2/indicator/SE.SEC.CUAT.UP.ZS?format=json>，访问日期 2026-10-20。

### 结论

条款与 `SP.URB.TOTL.IN.ZS` 相同（CC BY 4.0）。本项目把百分比除以 100 转成 0—1 的 share，只保留非空观测；朝鲜没有观测，因此不生成序列（不以 0 或邻国数据代替）。

| 问题             | 结论 | 依据                                           |
| ---------------- | ---- | ---------------------------------------------- |
| 允许再分发？     | 是   | CC BY 4.0 copy / distribute。                  |
| 允许修改？       | 是   | 百分比→share，须注明改动。                     |
| 署名与改动说明？ | 有   | `data/SOURCES.md` 与 `sources.json` 的 notes。 |
| 商业使用限制？   | 无   | 条款明确 including commercial use。            |

**建议结论：`allowed`（待维护者确认）。**

### 官方下载入口

- 指标页面：<https://data.worldbank.org/indicator/SE.SEC.CUAT.UP.ZS>
- API：<https://api.worldbank.org/v2/country/CHN;JPN;PRK;KOR;RUS/indicator/SE.SEC.CUAT.UP.ZS?format=json&per_page=20000>
- 版本记录：API `lastupdated: 2026-10-08`。

## `worldbank-wdi:SL.TLF.CACT.ZS` — 世界银行 WDI 劳动参与率

### 条款页面

- 数据目录许可说明：<https://datacatalog.worldbank.org/public-licenses>，访问日期 2026-10-20。
- Summary Terms of Use：<https://data.worldbank.org/summary-terms-of-use>，访问日期 2026-10-20。
- WDI 数据集页面：<https://datacatalog.worldbank.org/search/dataset/0037712>，访问日期 2026-10-20。
- 指标元信息：<https://api.worldbank.org/v2/indicator/SL.TLF.CACT.ZS?format=json>，访问日期 2026-10-20。

### 结论

条款与 `SP.URB.TOTL.IN.ZS` 相同（CC BY 4.0）。**注意**：这是 ILO 模型估计（15 岁及以上），不是各国普查值；本项目在来源 notes 与界面上按 B 级数据披露。百分比 ÷ 100 转为 share，只保留非空观测。

| 问题             | 结论 | 依据                                     |
| ---------------- | ---- | ---------------------------------------- |
| 允许再分发？     | 是   | CC BY 4.0 copy / distribute。            |
| 允许修改？       | 是   | 百分比→share，须注明改动。               |
| 署名与改动说明？ | 有   | `sources.json` 的 notes 与统计面板披露。 |
| 商业使用限制？   | 无   | 条款明确 including commercial use。      |

**建议结论：`allowed`（待维护者确认）。**

## `worldbank-wdi:SL.AGR.EMPL.ZS` — 世界银行 WDI 农业就业占比

### 条款页面

- 数据目录许可说明：<https://datacatalog.worldbank.org/public-licenses>，访问日期 2026-10-20。
- Summary Terms of Use：<https://data.worldbank.org/summary-terms-of-use>，访问日期 2026-10-20。
- WDI 数据集页面：<https://datacatalog.worldbank.org/search/dataset/0037712>，访问日期 2026-10-20。
- 指标元信息：<https://api.worldbank.org/v2/indicator/SL.AGR.EMPL.ZS?format=json>，访问日期 2026-10-20。

### 结论

条款与 `SP.URB.TOTL.IN.ZS` 相同（CC BY 4.0）。**注意**：这是 ILO 模型估计，不是各国普查的行业分类；百分比 ÷ 100 转为 share，只保留非空观测。

| 问题             | 结论 | 依据                                     |
| ---------------- | ---- | ---------------------------------------- |
| 允许再分发？     | 是   | CC BY 4.0 copy / distribute。            |
| 允许修改？       | 是   | 百分比→share，须注明改动。               |
| 署名与改动说明？ | 有   | `sources.json` 的 notes 与统计面板披露。 |
| 商业使用限制？   | 无   | 条款明确 including commercial use。      |

**建议结论：`allowed`（待维护者确认）。**

### 官方下载入口

- 指标页面：<https://data.worldbank.org/indicator/SL.TLF.CACT.ZS>、<https://data.worldbank.org/indicator/SL.AGR.EMPL.ZS>
- 版本记录：API `lastupdated: 2026-10-08`。

## `worldbank-wdi:FP.CPI.TOTL` — 世界银行 WDI 消费者价格指数

- 条款页面：<https://datacatalog.worldbank.org/public-licenses>、<https://data.worldbank.org/summary-terms-of-use>、WDI 数据集 <https://datacatalog.worldbank.org/search/dataset/0037712>；访问日期 2026-10-20。
- 结论：CC BY 4.0，允许复制、修改、再分发；本项目只保留非空观测，基期 2010=100。
- **用途边界**：CPI 只用于把名义金额折算成可比购买力，不作为工资或收入；不得用它替代缺失的工资数据。
- 建议结论：`allowed`（待维护者确认）。

## `worldbank-wdi:SH.XPD.OOPC.CH.ZS` — 世界银行 WDI 自付卫生支出占比

- 条款页面：同上；指标元信息 <https://api.worldbank.org/v2/indicator/SH.XPD.OOPC.CH.ZS?format=json>，访问日期 2026-10-20。
- 结论：CC BY 4.0；百分比 ÷ 100 转为 0—1 share，只保留非空观测。朝鲜没有观测，不生成序列。
- 建议结论：`allowed`（待维护者确认）。

## `worldbank-wdi:SH.XPD.CHEX.PC.CD` — 世界银行 WDI 人均卫生支出

- 条款页面：同上；指标元信息 <https://api.worldbank.org/v2/indicator/SH.XPD.CHEX.PC.CD?format=json>，访问日期 2026-10-20。
- 结论：CC BY 4.0；单位为现价美元/人，**不是 PPP**，跨国比较时必须披露这一点；只保留非空观测。
- 建议结论：`allowed`（待维护者确认）。

## 经济周期锚点来源（M3-007）

以下来源只用于**事实引用**（衰退/复苏日期），不再分发原文；与 `sources.json` 中 `redistribution: 'unknown'` 记录对应。

### `cao:business-cycle-dates` — 日本内阁府景气循环参考日期

- 页面：<https://www.esri.cao.go.jp/en/stat/di/rdates.html>，访问日期 2026-10-20。
- 引用事实：1973-11 峰 → 1975-03 谷；1991-02 峰 → 1993-10 谷；2008-02 峰 → 2009-03 谷。
- 结论：官方统计口径，证据等级 A；只引用日期事实，不复制页面文本。

### `nbs:china-2020-gdp` — 中国国家统计局 2020 年季度 GDP

- Q1 发布页：<https://www.stats.gov.cn/english/PressRelease/202004/t20200420_1739811.html>；Q2 发布页：<https://www.stats.gov.cn/english/PressRelease/202007/t20200717_1776596.html>；访问日期 2026-10-20。
- 引用事实：2020Q1 GDP 同比下降 6.8%，Q2 同比增长 3.2%。
- 结论：官方统计口径，证据等级 A；只引用季度增速，不复制原文。

### `brookings:russia-1998` — 俄罗斯 1998 年违约

- 页面：<https://www.brookings.edu/articles/who-lost-greece-parallels-with-russia-in-1998/>，访问日期 2026-10-20。
- 引用事实：1998-08-17 俄罗斯债务违约/卢布贬值；只引用日期与事件，不再分发原文。
- 结论：权威研究机构，证据等级 B。

### `worldbank-wdi:NY.GDP.MKTP.KD.ZG` — 世界银行 GDP 年增长率

- 指标页：<https://data.worldbank.org/indicator/NY.GDP.MKTP.KD.ZG>；API：<https://api.worldbank.org/v2/country/KOR;RUS/indicator/NY.GDP.MKTP.KD.ZG?format=json&per_page=20000>，访问日期 2026-10-20。
- 条款：CC BY 4.0，允许再分发；本项目只用它判断年度衰退/复苏年份（韩国 1998；俄罗斯 1992—1996、1998、2009），不生成序列文件。
- 结论：`allowed`；须署名并注明改动/用途。**日期粒度是年，不是月**；锚点取当年 1 月 1 日，报告里已注明口径。
