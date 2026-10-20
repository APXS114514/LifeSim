# @lifesim/synthetic-world

虚构的合成地区 `ZZ-SYN`，供 M1 的模拟内核测试、headless 运行与性能基准使用。

- **全部数值都是 D 类游戏设计假设**（GDD §9.1），不对应任何真实国家、地区或统计数据；
  公式与取值理由见 [docs/adr/0003-synthetic-world.md](../../docs/adr/0003-synthetic-world.md)。
- 本包内容为本项目原创，随仓库以 MIT 许可证发布；不含任何第三方数据。
- **不得进入公开构建**：网页应用不能依赖本包（由 `pnpm check:boundaries` 检查）。
