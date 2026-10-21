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
