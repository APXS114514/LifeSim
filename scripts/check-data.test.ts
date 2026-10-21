import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { SourceRecordSchema } from '../packages/content-schema/src/index.ts';
import { describe, expect, it } from 'vitest';
import { renderSourcesMarkdown, validateSources } from './check-data.mjs';

const root = resolve(import.meta.dirname, '..');

/** 测试夹具，非真实来源；URL 指向 example.org。 */
const sourceA = {
  id: 'example-a:dataset',
  title: 'Example dataset A',
  publisher: 'Example Publisher',
  url: 'https://example.org/a',
  version: '1.0',
  license: 'CC-BY-4.0',
  redistribution: 'allowed',
  verifiedAt: '2026-10-20',
  notes: 'attribution required',
} as const;

/** 测试夹具，非真实来源。 */
const sourceB = {
  id: 'example-b:dataset',
  title: 'Example | dataset B',
  publisher: 'Example Publisher B',
  license: 'NOASSERTION',
  redistribution: 'unknown',
} as const;

describe('validateSources', () => {
  it('accepts an empty registry', () => {
    expect(validateSources([])).toEqual([]);
  });

  it('rejects a non-array', () => {
    expect(validateSources({})).toEqual(['data/sources.json 必须是数组']);
  });

  it('reports missing fields with the index', () => {
    const problems = validateSources([{ id: 'example-a:dataset' }]);
    expect(problems.some((problem) => problem.includes('第 0 项'))).toBe(true);
  });

  it('reports "allowed" sources without a verification date', () => {
    const { verifiedAt: _verifiedAt, ...withoutDate } = sourceA;
    const problems = validateSources([withoutDate]);
    expect(problems.some((problem) => problem.includes('verifiedAt'))).toBe(true);
  });

  it('reports duplicate ids', () => {
    const problems = validateSources([sourceA, sourceA]);
    expect(
      problems.some((problem) => problem.includes('重复') && problem.includes(sourceA.id)),
    ).toBe(true);
  });

  it('requires ids in dictionary order', () => {
    const problems = validateSources([sourceB, sourceA]);
    expect(problems.some((problem) => problem.includes('字典序'))).toBe(true);
  });
});

describe('renderSourcesMarkdown', () => {
  it('keeps the introduction and records that there is no external data yet', () => {
    const markdown = renderSourcesMarkdown([]);
    expect(markdown).toContain('目前仓库里还没有任何外部数据');
    expect(markdown).toContain('pnpm data:sources');
    expect(markdown.endsWith('\n')).toBe(true);
  });

  it('renders one row per source, escaping pipes and filling missing fields', () => {
    const markdown = renderSourcesMarkdown([sourceA, sourceB]);
    const rows = markdown.split('\n').filter((line) => line.startsWith('| example-'));
    expect(rows).toHaveLength(2);
    expect(rows[1]).toContain('Example \\| dataset B');
    expect(rows[1]).toContain('| — |');
    expect(markdown).not.toContain('目前仓库里还没有任何外部数据');
  });

  it('matches the committed registry and SOURCES.md', () => {
    const raw: unknown = JSON.parse(readFileSync(join(root, 'data/sources.json'), 'utf8'));
    expect(Array.isArray(raw)).toBe(true);
    const records = (raw as unknown[]).map((record) => SourceRecordSchema.parse(record));
    expect(validateSources(records)).toEqual([]);
    expect(renderSourcesMarkdown(records)).toBe(
      readFileSync(join(root, 'data/SOURCES.md'), 'utf8'),
    );
  });
});
