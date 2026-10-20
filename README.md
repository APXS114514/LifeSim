# LifeSim · 人生模拟器

在真实的历史时间线里，过完一个人的一生。

可溯源的历史统计和可解释的概率模型构成现实约束；个人选择、NPC 的自主意愿和家庭因果改变个人命运，但不改写已经发生的宏观历史。

> **当前状态：M0（仓库地基）。** 仓库里只有类型契约、校验器、角色创建页草图和质量门禁，**还不能游玩**。进度见 [docs/ROADMAP.md](docs/ROADMAP.md)。

## v0.1 目标（公开 Alpha）

- 五个可出生地区：中国大陆、日本、朝鲜、韩国、俄罗斯（含苏联时期）
- 1950—2026 年任选出生年；人生可以推进到 2026 年以后，未来年份使用明确标注的预测
- 主角死亡，本局即结束，不接管后代
- 简体中文与英语完整双语；首次加载后可离线游玩；存档保存在本地浏览器
- 不需要账号，不强制联网，也不依赖 AI

完整设计基线见 [docs/GDD.md](docs/GDD.md)，其中 23 项产品决定已冻结。

## 透明声明

- 这是受历史统计启发的交互式模拟，不是对个人命运的科学预测。
- 宏观历史事件与个人的虚构经历属于不同层级；前者固定，后者由模拟产生。
- 数据按证据等级 A/B/C/D 标注（见 [docs/DATA_POLICY.md](docs/DATA_POLICY.md)）；未来年份使用预测或游戏假设。
- 朝鲜、较早年份和省级统计的资料有明显局限。
- 「随机出生」只在五个首发地区之间按出生人数加权抽样，不代表全球出生分布。
- 本地存档可能被浏览器清理，请定期导出备份。
- 默认不连接服务器、不调用模型 API，不会把你没有选择发送的内容或密钥发给外部服务。

## 开发

需要 Node 24。pnpm 的版本固定在 `package.json` 的 `packageManager` 字段：执行一次 `corepack enable`，之后就会自动使用这个版本。pnpm 运行脚本时，会按 `devEngines.runtime` 使用固定版本的 Node（24.21.0）。

```bash
pnpm install
pnpm dev          # 本地开发服务器
pnpm verify       # 格式、lint、依赖边界、许可证、类型检查、单元测试、构建
pnpm test:e2e     # Playwright 冒烟测试（桌面 + 手机视口）
```

| 命令                    | 作用                                                         |
| ----------------------- | ------------------------------------------------------------ |
| `pnpm typecheck`        | 所有工作区包的 TypeScript 严格模式检查                       |
| `pnpm test`             | Vitest 单元测试与 fast-check 性质测试                        |
| `pnpm check:boundaries` | 包依赖方向与源码导入检查                                     |
| `pnpm check:licenses`   | 生产依赖许可证白名单，以及 `THIRD_PARTY_NOTICES.md` 是否同步 |
| `pnpm notices`          | 重新生成 `THIRD_PARTY_NOTICES.md`                            |

## 仓库结构

```text
apps/web/                  React + Vite 网页应用（M0：角色创建页草图）
packages/content-schema/   共享类型契约与运行时校验
packages/simulation-core/  模拟引擎契约（M1 实现）
packages/save/             存档仓库接口与导入导出校验
packages/narrative/        双语叙事渲染契约与文本一致性检查
docs/                      设计基线、架构、数据政策、质量门禁、ADR
data/                      外部数据来源登记（目前没有外部数据）
```

## 文档

- [docs/GDD.md](docs/GDD.md)：设计基线（冻结）
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)：仓库实际架构与依赖规则
- [docs/DATA_POLICY.md](docs/DATA_POLICY.md)：证据等级、来源登记与许可审计
- [docs/QA_GATE.md](docs/QA_GATE.md)：质量门禁与自动化对应关系
- [docs/ROADMAP.md](docs/ROADMAP.md)：里程碑进度
- [docs/adr/](docs/adr/)：架构决策记录
- [docs/AGENT_PROMPTS.md](docs/AGENT_PROMPTS.md)：分阶段开发任务
- [AGENTS.md](AGENTS.md)：给开发 Agent 的仓库约定
- [CONTRIBUTING.md](CONTRIBUTING.md) · [SECURITY.md](SECURITY.md) · [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)

## 许可

本项目的原创代码以 [MIT 许可证](LICENSE) 发布。外部数据、地图、字体、图片等第三方内容各有各的许可，见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) 与 [data/SOURCES.md](data/SOURCES.md)，它们不会因为本仓库采用 MIT 而变成 MIT。

本项目参考同类人生模拟游戏的通用品类思路，不复制任何其他作品的代码、素材、叙事或品牌。

本项目的开发使用了 AI 编程助手（例如 Claude Code、Codex）；提交不附加 AI 工具的自动署名，详见 [CONTRIBUTING.md](CONTRIBUTING.md#ai-辅助开发)。

---

## English

LifeSim is a single-player life simulation set inside real history. Births can be chosen in Mainland China, Japan, North Korea, South Korea or Russia (including the Soviet era) between 1950 and 2026. Macro history stays fixed, while your life and family are shaped by choices, other people's own decisions and calibrated probabilities. When the protagonist dies, the run ends.

**Status: stage M0 (repository foundation).** The repo contains type contracts, validators, a UI sketch and quality gates only. It is **not playable yet**.

Original code is released under the [MIT License](LICENSE). Third-party data and assets keep their own licenses.
