// 测试基线检查：防止通过删除、跳过测试来「通过」质量门禁。
//
//   node scripts/check-test-baseline.mjs test-results/vitest.json          检查
//   node scripts/check-test-baseline.mjs test-results/vitest.json --write  按当前结果重写基线（仅架构审查后）
//
// 规则：没有失败、跳过或待办的测试；测试总数不少于基线；基线里登记的测试文件一个都不能少。
// 新增测试不需要改基线。`qa/test-baseline.json` 是高风险文件，修改需要架构审查。
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const baselinePath = join(root, 'qa/test-baseline.json');
const [reportPath, flag] = process.argv.slice(2);
if (!reportPath) {
  console.error('用法：node scripts/check-test-baseline.mjs <vitest-json-report> [--write]');
  process.exit(2);
}

/**
 * @typedef {{ numTotalTests: number, numFailedTests: number, numPendingTests: number,
 *   numTodoTests: number, testResults: { name: string }[] }} VitestReport
 */
/** @type {VitestReport} */
const report = JSON.parse(readFileSync(resolve(reportPath), 'utf8'));
const files = report.testResults.map((result) => relative(root, result.name)).sort();

if (flag === '--write') {
  const baseline = { minTests: report.numTotalTests, testFiles: files };
  writeFileSync(baselinePath, `${JSON.stringify(baseline, null, 2)}\n`);
  console.log(
    `已写入 qa/test-baseline.json：${report.numTotalTests} 项测试，${files.length} 个文件。`,
  );
  process.exit(0);
}

/** @type {{ minTests: number, testFiles: string[] }} */
const baseline = existsSync(baselinePath)
  ? JSON.parse(readFileSync(baselinePath, 'utf8'))
  : { minTests: 0, testFiles: [] };
const problems = [];
if (report.numFailedTests > 0) problems.push(`${report.numFailedTests} 项测试失败`);
if (report.numPendingTests > 0) problems.push(`${report.numPendingTests} 项测试被跳过`);
if (report.numTodoTests > 0) problems.push(`${report.numTodoTests} 项测试是 todo`);
if (report.numTotalTests < baseline.minTests) {
  problems.push(`测试总数 ${report.numTotalTests} 少于基线 ${baseline.minTests}`);
}
for (const file of baseline.testFiles) {
  if (!files.includes(file)) problems.push(`基线里的测试文件不见了：${file}`);
}

if (problems.length > 0) {
  console.error('测试基线检查失败：');
  for (const problem of problems) console.error(`  - ${problem}`);
  console.error('不要删除或弱化测试；确有必要调整基线时，需要架构审查（见 AGENTS.md）。');
  process.exit(1);
}
console.log(
  `测试基线检查通过：${report.numTotalTests} 项（基线 ≥ ${baseline.minTests}），${files.length} 个文件，无跳过。`,
);
