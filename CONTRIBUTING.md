# 参与贡献

感谢关注 LifeSim。项目还在早期阶段（见 [docs/ROADMAP.md](docs/ROADMAP.md)），开工前请先读 [docs/GDD.md](docs/GDD.md)。

## 贡献的授权

- 你提交的代码按本仓库的 [MIT 许可证](LICENSE) 授权（inbound = outbound）。
- 提交即表示你有权以这种方式授权：内容是你自己写的，或者来源许可允许这样做，并且你已经注明了来源。
- 目前不要求 DCO 签名或 CLA。出现较多外部贡献者时会重新评估，结论写成 ADR。

## 先开 issue

- **缺陷**：用「缺陷报告」模板，尽量附上种子、出生设置和重现步骤。
- **新功能或范围变化**：用「功能提案」模板。GDD 的 23 项决定已冻结，改动它们需要公开讨论并发布新的 GDD 版本，不能直接提交代码。
- 小的修正（错别字、明显的 bug）可以直接提 PR。

## 提交流程

1. 外部贡献者从 `main` 拉分支，一个 PR 只做一件事；维护者与本机 Agent 也可以按下面的“本地 Git 提交”流程直接提交。
2. 行为改动要带测试；随机相关的缺陷，测试里要固定种子，失败时输出种子、事件 ID 和日期。
3. 提交前运行 `pnpm verify`；改了界面还要运行 `pnpm test:e2e`，并在 PR 或完成报告里附截图。
4. 新的工程决定写成 ADR（[docs/adr/](docs/adr/)）。
5. 外部 PR 在 CI 全部通过、经过审查后合并。

### 维护者与本机 Agent：本地 Git 提交与推送

本项目**不要求必须走 Pull Request**。维护者可以直接用本地 Git 提交并推送；**AI Agent 只能本地提交，远程推送必须逐次获得人类操作员批准**（见 [AGENTS.md](AGENTS.md)「分支、工作树与推送」）：

```sh
git status -sb
git pull --ff-only
pnpm verify
git add <files>
git commit -m "feat(scope): 简述"
pnpm check:commits origin/main..HEAD
# Agent 到此停止：报告提交内容、SHA、目标分支、测试结果与风险，等待人类批准
# 只有获得当次明确批准后，才执行下一步
git push origin HEAD
```

- 在 `main` 上工作就提交到 `main`；在任务分支上工作就提交到该分支。不需要 PR。
- **推送授权逐次有效**：此前批准过推送，不代表下一次可以自动推送；「继续」「执行下一个任务」等指令不构成推送授权。
- 高风险改动（内核、契约、数据、门禁、CI、Agent 配置等）在 `task/*` 分支上本地提交，在完成报告里列出风险点，由维护者本地审查后合并；推送同样需要当次批准。
- 不要 force push、rebase 已推送的公共分支、amend 已推送的提交，或覆盖别人未提交的修改。
- 如果 GitHub 的 `main` 分支保护要求必须走 PR，直接推送会被拒绝；此时推任务分支，由维护者本地合并，或按维护者要求开 PR。
- 合并后的任务分支先确认 `git branch --merged main`，再删除；用 `git fetch --prune` 清理远程引用。

提交信息建议使用 Conventional Commits 风格，例如 `feat(save): 校验导入文件大小`、`fix(narrative): 英文模板缺少占位符`。

## 数据、素材与内容

- 外部数据先在 [data/SOURCES.md](data/SOURCES.md) 登记来源、版本、许可和再分发条件，规则见 [docs/DATA_POLICY.md](docs/DATA_POLICY.md)。许可未核验的数据不进公开构建。
- 不提交来源不明的图片、字体、地图或文本，也不复制其他游戏的代码、素材、叙事或品牌。
- 新的界面和叙事文本必须同时提供简体中文与英语。
- 战争、饥荒、政治迫害、脱北、暴力等严肃历史题材要尊重当事人的处境：不戏谑，给出内容提示，并且只模拟历史条件下的选择与后果，不写成现实中的行动指南。

## AI 辅助开发

本项目在开发中使用了 AI 编程助手（例如 Claude Code、Codex），这一点不需要隐瞒。但是：

- 提交和 Pull Request 不附加 AI 工具的自动署名（`Co-Authored-By`、`Generated with …`、会话链接等），提交的作者就是实际提交的人。规则与检查方式见 [AGENTS.md](AGENTS.md)「Git 提交规则」。
- 提交者对内容负责：AI 生成的代码同样要经过审查和测试，并满足本文的数据与许可要求。

## 行为准则

参与本项目即表示同意遵守 [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)。
