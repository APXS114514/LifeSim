# 数据来源登记

> 规则见 [docs/DATA_POLICY.md](../docs/DATA_POLICY.md)。字段与 `SourceRecord` schema（`packages/content-schema/src/evidence.ts`）一一对应。
> 来源只有在许可核验之后才能标记为可再分发（`allowed`）；未核验的来源，其派生数据不得进入公开构建。

> 本文件由 `pnpm data:sources` 根据 `data/sources.json` 生成，请勿手改。

| ID | 标题 | 发布者 | URL | 版本 | 许可证（SPDX） | 再分发 | 核验日期 | 备注 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| un-wpp:2024 | World Population Prospects 2024 | United Nations, Department of Economic and Social Affairs, Population Division | https://population.un.org/wpp/ | 2024 | CC-BY-3.0-IGO | allowed | 2026-10-20 | Attribution: United Nations, DESA, Population Division (2024), World Population Prospects 2024, Online Edition; link the CC BY 3.0 IGO license and indicate that values were extracted and converted to StatSeries. |
| worldbank-wdi:SP.URB.TOTL.IN.ZS | Urban population (% of total population) — World Development Indicators | World Bank | https://data.worldbank.org/indicator/SP.URB.TOTL.IN.ZS | 2026-10-08 | CC-BY-4.0 | allowed | 2026-10-20 | Attribution: World Bank, World Development Indicators, indicator SP.URB.TOTL.IN.ZS, CC BY 4.0; changes: percent values converted to shares (÷100), not-reported values kept as explicit null. |
