# third_party：移植的第三方源代码

这里登记**从其他开源项目移植或改写进本仓库的源代码**（npm 依赖不在这里，由 `pnpm notices` 自动列出）。数据、地图、字体、图片与音乐不在这里，见 `data/SOURCES.md`。

- `ported-code.json`：每一处移植一条记录（上游仓库、精确 commit、上游文件与行号及其 SHA-256、许可证、原版权行、本仓库文件、改动摘要、任务编号、访问日期）。
- `<项目>/LICENSE`：上游许可证原文，逐字节复制自登记的 commit。

`pnpm check:licenses` 会检查：许可证在允许名单内；许可证原文存在且含原版权行；每个移植文件以 `/*!` 许可注释开头，并写明原版权行、`SPDX-License-Identifier` 与登记 ID；仓库里每个带 `SPDX-License-Identifier` 的源文件都已登记。`pnpm notices` 把这些条目连同许可证原文写进 `THIRD_PARTY_NOTICES.md`。

流程见 [docs/REFERENCE_REUSE.md](../docs/REFERENCE_REUSE.md) 第 8 节。本目录属于高风险路径，改动需要维护者审查。
