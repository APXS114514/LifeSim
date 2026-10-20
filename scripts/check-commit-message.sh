#!/bin/sh
# 拒绝 AI 工具自动附加的 Git 署名（AGENTS.md「Git 提交规则」）。
#
#   sh scripts/check-commit-message.sh --file <提交信息文件>   commit-msg 钩子使用
#   sh scripts/check-commit-message.sh --range <rev-range>     CI 检查一段新提交
#
# 只拦截自动署名（trailer、"Generated with …"、会话链接），不拦截在正文里正常提到 AI 工具。
set -eu

pattern='^[[:space:]]*(co-authored-by:.*(claude|anthropic|codex|openai|chatgpt|copilot|cursor|gemini|devin|aider)|claude-session:|.*generated (with|by) \[?(claude|codex|chatgpt|copilot|cursor|gemini)|.*noreply@anthropic\.com)'

# 输出命中的行；没有命中时返回非零。git 的注释行（# 开头）不算。
matches() {
  grep -v '^#' "$1" | grep -Ei "$pattern"
}

case "${1:-}" in
  --file)
    if hits=$(matches "$2"); then
      echo "提交被拒绝：提交信息里包含 AI 工具的自动署名：" >&2
      printf '%s\n' "$hits" | sed 's/^/  /' >&2
      echo "请删除这些行后重新提交（规则见 AGENTS.md「Git 提交规则」）。" >&2
      exit 1
    fi
    ;;
  --range)
    tmp=$(mktemp)
    trap 'rm -f "$tmp"' EXIT
    status=0
    count=0
    for commit in $(git rev-list "$2"); do
      count=$((count + 1))
      git log -1 --format=%B "$commit" > "$tmp"
      if hits=$(matches "$tmp"); then
        echo "✗ $(git log -1 --format='%h %s' "$commit")" >&2
        printf '%s\n' "$hits" | sed 's/^/    /' >&2
        status=1
      fi
    done
    if [ "$status" -eq 0 ]; then
      echo "提交信息检查通过：$count 个提交均无 AI 工具自动署名。"
    else
      echo "以上提交包含 AI 工具的自动署名（规则见 AGENTS.md「Git 提交规则」）。" >&2
    fi
    exit "$status"
    ;;
  *)
    echo "用法：$0 --file <提交信息文件> | --range <rev-range>" >&2
    exit 2
    ;;
esac
