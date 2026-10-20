# 安全策略 / Security policy

## 支持的版本

正式版本发布之前，只修复 `main` 分支上的安全问题。

## 报告漏洞

请**不要**在公开 issue 里报告漏洞。请通过 GitHub 的私密漏洞报告提交：仓库页面 → **Security** → **Report a vulnerability**，或直接打开 <https://github.com/APXS114514/LifeSim/security/advisories/new>。

报告时请说明：影响的版本或 commit、重现步骤，以及可能造成的后果。维护者会尽力在 7 天内确认收到，并在修复后公开致谢（如果你愿意）。

## 我们特别关心的范围

- **存档导入**：恶意构造的存档文件（超大文件、原型污染、校验和绕过、schema 绕过）。
- **注入**：叙事模板或数据包里的内容在界面中被当作 HTML 或脚本执行。
- **数据包加载**：清单里的路径越出包目录。
- **供应链**：依赖被篡改，或依赖许可证违规。
- **未来的 BYOK AI 功能**（不在 v0.1 范围内）：API Key 的存储方式，以及哪些内容会被发送到外部。

v0.1 没有服务器端，也没有账号系统；所有数据都只保存在用户自己的浏览器里。

---

**English:** Please report vulnerabilities privately through GitHub's _Report a vulnerability_ form under the repository's Security tab, not in public issues. Only `main` is supported before the first release.
