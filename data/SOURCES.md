# 数据来源登记

> 规则见 [docs/DATA_POLICY.md](../docs/DATA_POLICY.md)。字段与 `SourceRecord` schema（`packages/content-schema/src/evidence.ts`）一一对应。
> 来源只有在许可核验之后才能标记为可再分发（`allowed`）；未核验的来源，其派生数据不得进入公开构建。

> 本文件由 `pnpm data:sources` 根据 `data/sources.json` 生成，请勿手改。

| ID | 标题 | 发布者 | URL | 版本 | 许可证（SPDX） | 再分发 | 核验日期 | 备注 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| bok:currency-1953 | Currency Timeline 1953~1962（Bank of Korea） | Bank of Korea | https://www.bok.or.kr/eng/main/contents.do?menuNo=400117 | — | NOASSERTION | unknown | 2026-10-20 | 只引用史实，不再分发文本。原文：the Currency Reform was carried out on February 15, 1953, on a 100-won to one hwan basis；同页写 second currency reform implemented (put into effect on February 17)。访问日期 2026-10-20。 |
| bok:currency-1962 | Currency Timeline 1962~1970（Bank of Korea） | Bank of Korea | https://www.bok.or.kr/eng/main/contents.do?menuNo=400118 | — | NOASSERTION | unknown | 2026-10-20 | 只引用史实，不再分发文本。原文：Another Currency Reform was carried out on June 10, 1962 ... New won-denominated currency, which had a face value ten times higher than that of the hwan-denominated currency。访问日期 2026-10-20。 |
| e-gov:local-autonomy-act | 地方自治法（昭和二十二年法律第六十七号） | 日本国 政府（e-Gov 法令検索） | https://laws.e-gov.go.jp/law/322AC0000000067 | — | NOASSERTION | unknown | 2026-10-20 | 只引用法律事实，不再分发文本。第一条の三：普通地方公共団体は、都道府県及び市町村とする。第二条：都道府県は、市町村を包括する広域の地方公共団体。访问日期 2026-10-20。 |
| kr-archives:busan-1963 | 오늘의 기록：부산시, 직할시로 승격（国家记录院） | National Archives of Korea | https://theme.archives.go.kr/next/daily/viewMain.do?selectDay=20140101 | — | NOASSERTION | unknown | 2026-10-20 | 只引用史实，不再分发文本。原文：1963년 1월 1일 대한민국 제2의 도시 부산시가 직할시(현 광역시)로 승격되었다。访问日期 2026-10-20。 |
| kr-history:rok-1948 | 광복 후 대한민국 정부 수립（国史编纂委员会  우리역사넷） | National Institute of Korean History | https://contents.history.go.kr/mobile/eh/view.do?levelId=eh_r0382_0010&code=ganada | — | NOASSERTION | unknown | 2026-10-20 | 只引用史实，不再分发文本。原文：1948년 8월 15일, 대한민국 정부 수립을 국내외에 선포하였어요。访问日期 2026-10-20。 |
| kr-law:local-autonomy | 지방자치법 제2조（地方自治法 第2条，国家法令信息中心） | 법제처 국가법령정보센터（韩国法制处） | https://www.law.go.kr/LSW//lsLawLinkInfo.do?chrClsCd=010202&lsJoLnkSeq=1000915639&lsId=001656&print=print | — | NOASSERTION | unknown | 2026-10-20 | 只引用法律事实，不再分发文本。第2条：지방자치단체는 ... 1. 특별시, 통합특별시, 광역시, 특별자치시, 도, 특별자치도 2. 시, 군, 구。访问日期 2026-10-20。 |
| osaka-pref:statistical-yearbook | 令和7年度 大阪府統計年鑑 — 大阪府の沿革 | 大阪府 | https://www.pref.osaka.lg.jp/documents/128538/hp_all_r7nenkan.pdf | — | NOASSERTION | unknown | 2026-10-20 | 只引用史实，不再分发文档。沿革段：明治4年(1871年)の廃藩置県を経て、大阪府は大阪市街地と摂津七郡…を管轄することとなった；说明大阪府自 1871 年起存在，覆盖 1950 年起点。访问日期 2026-10-20。 |
| shugiin:denomination-2008 | デノミネーション実施に関する質問に対する答弁書（第169回国会 答弁第二一四号） | 衆議院（内閣答弁） | https://www.shugiin.go.jp/internet/itdb_shitsumon.nsf/html/shitsumon/b169214.htm | — | NOASSERTION | unknown | 2026-10-20 | 只引用史实，不再分发文本。政府答弁：御指摘の「新円切り替え」後現在までに、デノミの具体的な実施についての検討をしたことはない；支持 1950 年后日元没有币制重定值。访问日期 2026-10-20。 |
| tokyo-metro:assembly-history | 都議会の沿革（東京都議会） | 東京都議会 | https://www.gikai.metro.tokyo.lg.jp/outline/history.html | — | NOASSERTION | unknown | 2026-10-20 | 只引用史实，不再分发文本。原文：昭和18年（1943年）6月1日 東京都制制定（7月1日施行）；说明东京都在 1950 年前已是第一级地方公共团体。访问日期 2026-10-20。 |
| un-wpp:2024 | World Population Prospects 2024 | United Nations, Department of Economic and Social Affairs, Population Division | https://population.un.org/wpp/ | 2024 | CC-BY-3.0-IGO | allowed | 2026-10-20 | Attribution: United Nations, DESA, Population Division (2024), World Population Prospects 2024, Online Edition; link the CC BY 3.0 IGO license and indicate that values were extracted and converted to StatSeries. |
| worldbank-wdi:SP.URB.TOTL.IN.ZS | Urban population (% of total population) — World Development Indicators | World Bank | https://data.worldbank.org/indicator/SP.URB.TOTL.IN.ZS | 2026-10-08 | CC-BY-4.0 | allowed | 2026-10-20 | Attribution: World Bank, World Development Indicators, indicator SP.URB.TOTL.IN.ZS, CC BY 4.0; changes: percent values converted to shares (÷100), not-reported values kept as explicit null. |
