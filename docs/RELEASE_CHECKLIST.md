# 发布检查清单

> 依据 [GDD.md](GDD.md) §14.4 与 M5 的退出条件。v0.1 公开 Alpha 之前**全部**勾选；任何一项做不到，就只发布候选版本，并列出剩余的阻碍。

## 门禁

- [ ] 没有 P0；没有影响关键路径的 P1（定义见 GDD §14.1）
- [ ] CI 全绿：checks 与 e2e，外加 M5 新增的三浏览器与批量模拟任务
- [ ] 五个地区均可从出生玩到死亡，桌面与手机都覆盖
- [ ] 校准指标满足事先声明的逐项标准；做不到的已缩小可验证功能并公开披露

## 必须留档

- [ ] `qa/release-candidate-report.json`：测试数量、失败用例、机器与浏览器、性能分布、统计误差、随机种子
- [ ] `docs/KNOWN_LIMITATIONS.md`：所有保留的 P2/P3 以及数据局限
- [ ] `data/LICENSE_AUDIT.md`：所有公开构建内的数据与素材均已通过许可审计
- [ ] `THIRD_PARTY_NOTICES.md` 与依赖同步（`pnpm check:licenses`），并随构建产物一起分发
- [ ] 翻译覆盖率报告：zh-Hans 与 en 100%
- [ ] 导入导出往返样本；自动备份提示可见
- [ ] `CHANGELOG.md` 已更新

## 构建与发布

- [ ] 固定的数据包版本；可以从同一个 git commit 重新构建出相同的产物
- [ ] 扫描密钥与个人数据，没有发现问题
- [ ] 打 git tag（`v0.1.0-alpha.N`），并记录构建与部署日志
- [ ] 部署到 GitHub Pages（`LIFESIM_BASE=/LifeSim/`），并在已缓存后实际验证离线可玩
