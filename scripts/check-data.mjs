// 机器可读的来源登记（docs/DATA_POLICY.md「流程」第 1 步）。
//
//   node scripts/check-data.mjs          检查 sources.json、排序与 SOURCES.md 是否同步
//   node scripts/check-data.mjs --write  校验通过后由 sources.json 重新生成 SOURCES.md
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { SourceRecordSchema } from '../packages/content-schema/src/index.ts';

const root = resolve(import.meta.dirname, '..');
const sourcesPath = join(root, 'data/sources.json');
const markdownPath = join(root, 'data/SOURCES.md');

const INTRO = [
  '# 数据来源登记',
  '',
  '> 规则见 [docs/DATA_POLICY.md](../docs/DATA_POLICY.md)。字段与 `SourceRecord` schema（`packages/content-schema/src/evidence.ts`）一一对应。',
  '> 来源只有在许可核验之后才能标记为可再分发（`allowed`）；未核验的来源，其派生数据不得进入公开构建。',
  '',
  '> 本文件由 `pnpm data:sources` 根据 `data/sources.json` 生成，请勿手改。',
  '',
];

const EMPTY_NOTICE =
  '**目前仓库里还没有任何外部数据。** M1 只使用标注为 D 类的合成数据；真实来源从 M2 开始登记。';

const COLUMNS = [
  'ID',
  '标题',
  '发布者',
  'URL',
  '版本',
  '许可证（SPDX）',
  '再分发',
  '核验日期',
  '备注',
];

/**
 * @param {unknown} records sources.json 的解析结果
 * @returns {string[]} 问题列表；空数组表示通过
 */
export function validateSources(records) {
  if (!Array.isArray(records)) return ['data/sources.json 必须是数组'];

  /** @type {string[]} */
  const problems = [];
  /** @type {string[]} */
  const ids = [];

  records.forEach((record, index) => {
    const result = SourceRecordSchema.safeParse(record);
    if (!result.success) {
      const detail = result.error.issues
        .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
        .join('; ');
      problems.push(`data/sources.json 第 ${index} 项不合法：${detail}`);
      return;
    }
    ids.push(result.data.id);
  });

  const seen = new Set();
  for (const id of ids) {
    if (seen.has(id)) problems.push(`data/sources.json 的来源 ID 重复：${id}`);
    seen.add(id);
  }

  for (let index = 1; index < ids.length; index += 1) {
    const previous = ids[index - 1];
    const current = ids[index];
    if (previous !== undefined && current !== undefined && current < previous) {
      problems.push(`data/sources.json 必须按 id 字典序排列：${previous} 排在 ${current} 之前`);
    }
  }

  return problems;
}

/**
 * @param {import('../packages/content-schema/src/index.ts').SourceRecord[]} records
 * @returns {string} 完整的 SOURCES.md 文本
 */
export function renderSourcesMarkdown(records) {
  /** @type {string[]} */
  const lines = [...INTRO];

  if (records.length === 0) lines.push(EMPTY_NOTICE, '');

  lines.push(`| ${COLUMNS.join(' | ')} |`);
  lines.push(`| ${COLUMNS.map(() => '---').join(' | ')} |`);

  const sorted = [...records].sort((left, right) =>
    left.id < right.id ? -1 : left.id > right.id ? 1 : 0,
  );
  for (const record of sorted) {
    const cells = [
      record.id,
      record.title,
      record.publisher,
      record.url,
      record.version,
      record.license,
      record.redistribution,
      record.verifiedAt,
      record.notes,
    ].map((value) => {
      if (value === undefined || value === null || value === '') return '—';
      return String(value).replaceAll('|', '\\|').replaceAll(/\r?\n/g, ' ');
    });
    lines.push(`| ${cells.join(' | ')} |`);
  }

  lines.push('');
  return lines.join('\n');
}

/** @returns {void} */
function main() {
  const { values } = parseArgs({ options: { write: { type: 'boolean', default: false } } });

  /** @type {unknown} */
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(sourcesPath, 'utf8'));
  } catch (error) {
    console.error(
      `无法读取 data/sources.json：${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
    return;
  }

  const problems = validateSources(parsed);
  if (problems.length > 0) {
    for (const problem of problems) console.error(`- ${problem}`);
    process.exitCode = 1;
    return;
  }

  const records = /** @type {import('../packages/content-schema/src/index.ts').SourceRecord[]} */ (
    parsed
  );
  const rendered = renderSourcesMarkdown(records);

  if (values.write) {
    writeFileSync(markdownPath, rendered);
    console.log(`已生成 data/SOURCES.md（${records.length} 条来源）。`);
    return;
  }

  const current = readFileSync(markdownPath, 'utf8');
  if (current !== rendered) {
    console.error('data/SOURCES.md 与 data/sources.json 不同步；请运行 pnpm data:sources。');
    process.exitCode = 1;
    return;
  }

  console.log(`来源登记检查通过：${records.length} 条来源，SOURCES.md 已同步。`);
}

if (import.meta.main) main();
