# 旗帜素材来源与许可

> 本文件记录进入网页构建的旗帜 SVG。所有文件均为**公有领域**，来源为 Wikimedia Commons 的文件页；不包含 1injp 或任何未核实许可的素材。
> 检索/下载日期：2026-10-20。代码仓库中的文件位于 `apps/web/public/flags/`。

## 文件清单

| 文件                        | 政体 / 时期                     | 来源文件页                                                                               | 作者（Commons 元数据）                                                             | 许可          | SHA-256                                                            |
| --------------------------- | ------------------------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ------------- | ------------------------------------------------------------------ |
| `cn-prc.svg`                | 中华人民共和国（1949—）         | https://commons.wikimedia.org/wiki/File:Flag_of_the_People%27s_Republic_of_China.svg     | Zeng Liansong                                                                      | Public domain | `5fce7409cd290e6b3c5ecd09c0d2c400ae459e3d59c6c0539793ac0e803d0179` |
| `jp-japan.svg`              | 日本（1950—）                   | https://commons.wikimedia.org/wiki/File:Flag_of_Japan.svg                                | Various                                                                            | Public domain | `35e785339e19d1ec1987cb9c3d8e66fc97f29a287db0b0b590b8dfdd96d4766b` |
| `kp-dprk.svg`               | 朝鲜民主主义人民共和国（1948—） | https://commons.wikimedia.org/wiki/File:Flag_of_North_Korea.svg                          | Original: Unknown author; Vector: Zscout370                                        | Public domain | `0facdb3b7f4028e3ab0ce5457983ff62b22e77177e896cf472654ae6b2f9ebeb` |
| `kr-rok.svg`                | 大韩民国（1948—）               | https://commons.wikimedia.org/wiki/File:Flag_of_South_Korea.svg                          | Original: Government of the Republic of Korea; Vector: Great Brightstar and others | Public domain | `d8ec2a77a317c28617cbd5e7114c3ec9697120670e343ede5ee5bd0b1b4cd110` |
| `ru-russian-federation.svg` | 俄罗斯联邦（1991—）             | https://commons.wikimedia.org/wiki/File:Flag_of_Russia.svg                               | Peter the Great                                                                    | Public domain | `eb1dbd977fdb824dcae7767ce9ec3a023e41158e81b5f524772609ddcb622025` |
| `ussr-1936.svg`             | 苏联（1936—1955）               | https://commons.wikimedia.org/wiki/File:Flag_of_the_Soviet_Union_(1936%E2%80%931955).svg | created by rotemliss from Image:Flag of the Soviet Union.svg                       | Public domain | `9fc2fc6b08f67c22dd6c2176d274fb5ba58042ca1fd5404f1548c56a1ec1e5d4` |
| `ussr-1955.svg`             | 苏联（1955—1991）               | https://commons.wikimedia.org/wiki/File:Flag_of_the_Soviet_Union.svg                     | СССР                                                                               | Public domain | `f6741b67fcf8934c47f2482a54440ab406ae82763c9c7676b9972f476232127f` |

## 使用规则

- 映射键是**政治实体 ID**（`polity:ussr` 等），不是国家代码；苏联旗帜在 `1955-08-19` 切换版本（见 `apps/web/src/game/flags.ts`）。
- 旗帜只作辅助识别：`aria-hidden`，旁边始终有文字名称；未登记政体显示中性占位，不用现代国旗顶替历史政体。
- 浅色旗帜在界面中统一加 1px 描边与圆角容器，保证浅色背景可辨。
- 更新或新增旗帜时：先核验 Commons 文件页的许可与作者，下载后计算 SHA-256，更新本表与 `flags.ts`，再运行 `pnpm verify` 与 E2E。
- 不得放入 CC BY-NC、未标注许可或来源不明的文件；不得从 1injp 或其他项目复制旗帜。
