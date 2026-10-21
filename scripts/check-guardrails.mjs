// PR 护栏：改动高风险路径、或删除测试文件的 PR，必须带 `arch-approved` 标签（由维护者审查后添加）。
//
//   node scripts/check-guardrails.mjs --base <sha> --head <sha> [--labels a,b]
//
// 高风险 = 模拟内核、公共契约、系统版本与优先级、黄金指纹、数据、质量门禁本身、CI 与规范文档。
// 清单与 .github/CODEOWNERS、docs/AGENT_HANDOFF.md「高风险变更」保持一致。
import { execFileSync } from 'node:child_process';
import { parseArgs } from 'node:util';

/** @type {readonly [RegExp, string][]} */
export const HIGH_RISK = [
  [/^packages\/simulation-core\/src\/(?!.*\.test\.ts$)/, '模拟内核'],
  [/^packages\/content-schema\/src\/(?!.*\.test\.ts$)/, '公共契约'],
  [/^packages\/systems\/src\/(region|shared|module)\.ts$/, 'RegionModel、系统版本与优先级、不变量'],
  [/^packages\/synthetic-world\/src\/golden\.ts$/, '黄金指纹'],
  // data/scripts/lib/ 是带测试的通用工具（CSV 读取等），不算高风险；其余数据与脚本都算。
  [/^data\/(?!scripts\/lib\/)/, '数据、来源登记与数据脚本'],
  [/^packages\/country-packs\/data\//, '国家包数据'],
  [/^packages\/country-packs\/src\/(?!.*\.test\.ts$)/, '国家包定义、校验与出生选择'],
  [/^packages\/data-registry\/src\/(?!.*\.test\.ts$)/, '数据查询与回退规则'],
  [/^qa\//, '测试基线'],
  [/^third_party\//, '移植代码登记与第三方许可证'],
  [/^scripts\/check-/, '质量门禁脚本'],
  [/^\.github\//, 'CI 与代码所有者'],
  [/^\.githooks\//, '提交钩子'],
  [/^\.claude\//, 'Agent 配置'],
  [
    /^(eslint\.config\.js|vitest\.config\.ts|tsconfig\.base\.json|package\.json|pnpm-workspace\.yaml)$/,
    '工具链配置',
  ],
  [/^docs\/(GDD\.md|AGENT_PROMPTS\.md|FLASH_AGENT_PROMPT\.md|adr\/)/, '规范与决策文档'],
  [/^AGENTS\.md$/, 'Agent 规则'],
];

const TEST_FILE = /(\.test\.tsx?|\.spec\.ts)$/;
export const APPROVAL_LABEL = 'arch-approved';

/**
 * @param {readonly { status: string, path: string }[]} changes
 * @returns {{ path: string, reason: string }[]}
 */
export function highRiskChanges(changes) {
  const flagged = [];
  for (const { status, path } of changes) {
    const match = HIGH_RISK.find(([pattern]) => pattern.test(path));
    if (match) flagged.push({ path, reason: match[1] });
    else if (status.startsWith('D') && TEST_FILE.test(path)) {
      flagged.push({ path, reason: '删除测试文件' });
    }
  }
  return flagged;
}

/**
 * @param {string} base
 * @param {string} head
 */
function changedFiles(base, head) {
  const output = execFileSync(
    'git',
    ['diff', '--name-status', '--no-renames', `${base}...${head}`],
    {
      encoding: 'utf8',
    },
  );
  return output
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [status = '', path = ''] = line.split('\t');
      return { status, path };
    });
}

if (import.meta.main) {
  const { values } = parseArgs({
    options: {
      base: { type: 'string' },
      head: { type: 'string' },
      labels: { type: 'string', default: '' },
    },
  });
  if (!values.base || !values.head) {
    console.error(
      '用法：node scripts/check-guardrails.mjs --base <sha> --head <sha> [--labels a,b]',
    );
    process.exit(2);
  }
  const labels = values.labels.split(',').map((label) => label.trim());
  const flagged = highRiskChanges(changedFiles(values.base, values.head));
  if (flagged.length === 0) {
    console.log('护栏检查通过：没有改动高风险路径。');
    process.exit(0);
  }
  const list = flagged.map(({ path, reason }) => `  - ${path}（${reason}）`).join('\n');
  if (labels.includes(APPROVAL_LABEL)) {
    console.log(`护栏检查通过：以下高风险改动已由维护者标记 ${APPROVAL_LABEL}：\n${list}`);
    process.exit(0);
  }
  console.error(
    `护栏检查失败：以下改动属于高风险，需要架构审查后由维护者加上 ${APPROVAL_LABEL} 标签：\n${list}`,
  );
  process.exit(1);
}
