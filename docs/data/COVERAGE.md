# 数据覆盖率

> 本文件由 `pnpm data:coverage` 生成，请勿手改。
> 证据等级的含义见 [docs/DATA_POLICY.md](../DATA_POLICY.md)；缺失值不因回退规则而被算作已覆盖。

| 地区 | 指标 | 序列 ID | 来源 | 等级 | 年份范围 | 预测年份 | 年龄范围 | 缺失点数 | 缺失年份 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| CN | births | wpp2024/CN/births | un-wpp:2024 | B | 1950—2100 | 2024—2100 | — | 0 | — |
| CN | life-table-qx | wpp2024/CN/qx | un-wpp:2024 | B | 1950—2100 | 2024—2100 | 0—100 | 0 | — |
| CN | life-table-qx | wpp2024/CN/qx-female | un-wpp:2024 | B | 1950—2100 | 2024—2100 | 0—100 | 0 | — |
| CN | life-table-qx | wpp2024/CN/qx-male | un-wpp:2024 | B | 1950—2100 | 2024—2100 | 0—100 | 0 | — |
| CN | urban-share | wdi/CN/urban-share | worldbank-wdi:SP.URB.TOTL.IN.ZS | B | 1960—2025 | — | — | 0 | — |
| CN | sex-ratio-at-birth | wpp2024/CN/srb | un-wpp:2024 | B | 1950—2100 | 2024—2100 | — | 0 | — |
| JP | births | wpp2024/JP/births | un-wpp:2024 | B | 1950—2100 | 2024—2100 | — | 0 | — |
| JP | life-table-qx | wpp2024/JP/qx | un-wpp:2024 | B | 1950—2100 | 2024—2100 | 0—100 | 0 | — |
| JP | life-table-qx | wpp2024/JP/qx-female | un-wpp:2024 | B | 1950—2100 | 2024—2100 | 0—100 | 0 | — |
| JP | life-table-qx | wpp2024/JP/qx-male | un-wpp:2024 | B | 1950—2100 | 2024—2100 | 0—100 | 0 | — |
| JP | urban-share | wdi/JP/urban-share | worldbank-wdi:SP.URB.TOTL.IN.ZS | B | 1960—2025 | — | — | 0 | — |
| JP | sex-ratio-at-birth | wpp2024/JP/srb | un-wpp:2024 | B | 1950—2100 | 2024—2100 | — | 0 | — |
| KP | births | wpp2024/KP/births | un-wpp:2024 | B | 1950—2100 | 2024—2100 | — | 0 | — |
| KP | life-table-qx | wpp2024/KP/qx | un-wpp:2024 | B | 1950—2100 | 2024—2100 | 0—100 | 0 | — |
| KP | life-table-qx | wpp2024/KP/qx-female | un-wpp:2024 | B | 1950—2100 | 2024—2100 | 0—100 | 0 | — |
| KP | life-table-qx | wpp2024/KP/qx-male | un-wpp:2024 | B | 1950—2100 | 2024—2100 | 0—100 | 0 | — |
| KP | urban-share | wdi/KP/urban-share | worldbank-wdi:SP.URB.TOTL.IN.ZS | B | 1960—2025 | — | — | 0 | — |
| KP | sex-ratio-at-birth | wpp2024/KP/srb | un-wpp:2024 | B | 1950—2100 | 2024—2100 | — | 0 | — |
| KR | births | wpp2024/KR/births | un-wpp:2024 | B | 1950—2100 | 2024—2100 | — | 0 | — |
| KR | life-table-qx | wpp2024/KR/qx | un-wpp:2024 | B | 1950—2100 | 2024—2100 | 0—100 | 0 | — |
| KR | life-table-qx | wpp2024/KR/qx-female | un-wpp:2024 | B | 1950—2100 | 2024—2100 | 0—100 | 0 | — |
| KR | life-table-qx | wpp2024/KR/qx-male | un-wpp:2024 | B | 1950—2100 | 2024—2100 | 0—100 | 0 | — |
| KR | urban-share | wdi/KR/urban-share | worldbank-wdi:SP.URB.TOTL.IN.ZS | B | 1960—2025 | — | — | 0 | — |
| KR | sex-ratio-at-birth | wpp2024/KR/srb | un-wpp:2024 | B | 1950—2100 | 2024—2100 | — | 0 | — |
| RU | births | wpp2024/RU/births | un-wpp:2024 | B | 1950—2100 | 2024—2100 | — | 0 | — |
| RU | life-table-qx | wpp2024/RU/qx | un-wpp:2024 | B | 1950—2100 | 2024—2100 | 0—100 | 0 | — |
| RU | life-table-qx | wpp2024/RU/qx-female | un-wpp:2024 | B | 1950—2100 | 2024—2100 | 0—100 | 0 | — |
| RU | life-table-qx | wpp2024/RU/qx-male | un-wpp:2024 | B | 1950—2100 | 2024—2100 | 0—100 | 0 | — |
| RU | urban-share | wdi/RU/urban-share | worldbank-wdi:SP.URB.TOTL.IN.ZS | B | 1960—2025 | — | — | 0 | — |
| RU | sex-ratio-at-birth | wpp2024/RU/srb | un-wpp:2024 | B | 1950—2100 | 2024—2100 | — | 0 | — |

## 已知缺口

以下是 1950—2026 出生年份范围内没有精确值的区间，以及实际会走的回退规则（ADR-0005 §4）。

- CN urban-share：1950—1957（hold-first-observed），1958—1959（fallback-neighbor-year），2026（fallback-neighbor-year）
- JP urban-share：1950—1957（hold-first-observed），1958—1959（fallback-neighbor-year），2026（fallback-neighbor-year）
- KP urban-share：1950—1957（hold-first-observed），1958—1959（fallback-neighbor-year），2026（fallback-neighbor-year）
- KR urban-share：1950—1957（hold-first-observed），1958—1959（fallback-neighbor-year），2026（fallback-neighbor-year）
- RU urban-share：1950—1957（hold-first-observed），1958—1959（fallback-neighbor-year），2026（fallback-neighbor-year）
