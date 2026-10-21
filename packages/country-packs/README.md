# @lifesim/country-packs

五个首发地区（中国大陆 CN、日本 JP、朝鲜 KP、韩国 KR、俄罗斯 RU，含苏联时期）的国家包：地理、货币、历史锚点、统计断点与派生统计序列，以及出生选择器。

- 派生数据只能来自 [data/sources.json](../../data/sources.json) 中 `redistribution: "allowed"` 的来源；当前为联合国 WPP 2024 与世界银行 WDI。
- 来源与许可结论见 [data/SOURCES.md](../../data/SOURCES.md)、[data/LICENSE_AUDIT.md](../../data/LICENSE_AUDIT.md)。
- 各国家包清单的 `licenseManifestPath` 指向本文件。
- `data/<packId>/` 下的 JSON 由 `data/scripts/` 的脚本生成，不要手改；重新生成后按维护者要求更新数据指纹。
