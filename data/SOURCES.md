# 数据来源登记

> 规则见 [docs/DATA_POLICY.md](../docs/DATA_POLICY.md)。字段与 `SourceRecord` schema（`packages/content-schema/src/evidence.ts`）一一对应。
> 来源只有在许可核验之后才能标记为可再分发（`allowed`）；未核验的来源，其派生数据不得进入公开构建。

> 本文件由 `pnpm data:sources` 根据 `data/sources.json` 生成，请勿手改。

| ID | 标题 | 发布者 | URL | 版本 | 许可证（SPDX） | 再分发 | 核验日期 | 备注 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| e-gov:local-autonomy-act | 地方自治法（昭和二十二年法律第六十七号） | 日本国 政府（e-Gov 法令検索） | https://laws.e-gov.go.jp/law/322AC0000000067 | — | NOASSERTION | unknown | 2026-10-20 | 只引用法律事实，不再分发文本。第一条の三：普通地方公共団体は、都道府県及び市町村とする。第二条：都道府県は、市町村を包括する広域の地方公共団体。访问日期 2026-10-20。 |
| osaka-pref:statistical-yearbook | 令和7年度 大阪府統計年鑑 — 大阪府の沿革 | 大阪府 | https://www.pref.osaka.lg.jp/documents/128538/hp_all_r7nenkan.pdf | — | NOASSERTION | unknown | 2026-10-20 | 只引用史实，不再分发文档。沿革段：明治4年(1871年)の廃藩置県を経て、大阪府は大阪市街地と摂津七郡…を管轄することとなった；说明大阪府自 1871 年起存在，覆盖 1950 年起点。访问日期 2026-10-20。 |
| shugiin:denomination-2008 | デノミネーション実施に関する質問に対する答弁書（第169回国会 答弁第二一四号） | 衆議院（内閣答弁） | https://www.shugiin.go.jp/internet/itdb_shitsumon.nsf/html/shitsumon/b169214.htm | — | NOASSERTION | unknown | 2026-10-20 | 只引用史实，不再分发文本。政府答弁：御指摘の「新円切り替え」後現在までに、デノミの具体的な実施についての検討をしたことはない；支持 1950 年后日元没有币制重定值。访问日期 2026-10-20。 |
| tokyo-metro:assembly-history | 都議会の沿革（東京都議会） | 東京都議会 | https://www.gikai.metro.tokyo.lg.jp/outline/history.html | — | NOASSERTION | unknown | 2026-10-20 | 只引用史实，不再分发文本。原文：昭和18年（1943年）6月1日 東京都制制定（7月1日施行）；说明东京都在 1950 年前已是第一级地方公共团体。访问日期 2026-10-20。 |
| un-wpp:2024 | World Population Prospects 2024 | United Nations, Department of Economic and Social Affairs, Population Division | https://population.un.org/wpp/ | 2024 | CC-BY-3.0-IGO | allowed | 2026-10-20 | Attribution: United Nations, DESA, Population Division (2024), World Population Prospects 2024, Online Edition; link the CC BY 3.0 IGO license and indicate that values were extracted and converted to StatSeries. |
| worldbank-wdi:SP.URB.TOTL.IN.ZS | Urban population (% of total population) — World Development Indicators | World Bank | https://data.worldbank.org/indicator/SP.URB.TOTL.IN.ZS | 2026-10-08 | CC-BY-4.0 | allowed | 2026-10-20 | Attribution: World Bank, World Development Indicators, indicator SP.URB.TOTL.IN.ZS, CC BY 4.0; changes: percent values converted to shares (÷100), not-reported values kept as explicit null. |
