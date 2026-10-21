import { execFileSync } from 'node:child_process';
import { readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { SourceRecordSchema } from '../packages/content-schema/src/index.ts';
import { describe, expect, it } from 'vitest';
import type { CountryPack } from '../packages/country-packs/src/index.ts';
import { checkPackSources, renderSourcesMarkdown, validateSources } from './check-data.mjs';

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

/** 测试夹具，非真实国家包；只填 checkPackSources 会读取的字段。 */
const packFixture = {
  manifest: { packId: 'CN' },
  politicalEntities: [{ id: 'polity:test', sourceIds: ['un-wpp:2024'] }],
  adminUnits: [],
  places: [],
  placeAssignments: [],
  anchors: [{ id: 'anchor:test', evidence: { sourceIds: ['adr:0005'] } }],
  breakpoints: [{ id: 'bp:test', sourceIds: ['example:history'] }],
  series: [{ id: 'wpp2024/CN/births', evidence: { sourceIds: ['un-wpp:2024'] } }],
};

/** 测试夹具，非真实来源。 */
const allowedSource = {
  ...sourceA,
  id: 'un-wpp:2024',
  title: 'Example WPP fixture',
} as const;

/** 测试夹具，非真实来源。 */
const historicalSource = {
  ...sourceB,
  id: 'example:history',
  notes: 'historical fact only',
} as const;

const asPack = (pack: unknown): CountryPack => pack as CountryPack;
const asSources = (sources: unknown[]): Parameters<typeof checkPackSources>[1] =>
  sources as Parameters<typeof checkPackSources>[1];

describe('checkPackSources', () => {
  it('accepts registered sources, allowed series data and imported files', () => {
    expect(
      checkPackSources(
        [asPack(packFixture)],
        asSources([allowedSource, historicalSource]),
        ['0005'],
        [],
        new Set(['wpp2024/CN/births']),
      ),
    ).toEqual([]);
  });

  it('reports an unregistered source with its id', () => {
    const pack = structuredClone(packFixture);
    pack.politicalEntities[0]!.sourceIds = ['missing:source'];
    const problems = checkPackSources(
      [asPack(pack)],
      asSources([allowedSource, historicalSource]),
      ['0005'],
      [],
      new Set(),
    );
    expect(problems.some((problem) => problem.includes('missing:source'))).toBe(true);
  });

  it('reports an ADR number that does not exist', () => {
    const pack = structuredClone(packFixture);
    pack.anchors[0]!.evidence.sourceIds = ['adr:9999'];
    const problems = checkPackSources(
      [asPack(pack)],
      asSources([allowedSource, historicalSource]),
      ['0005'],
      [],
      new Set(),
    );
    expect(problems.some((problem) => problem.includes('adr:9999'))).toBe(true);
  });

  it('reports series data from a source that is not allowed to redistribute', () => {
    const pack = structuredClone(packFixture);
    pack.series[0]!.evidence.sourceIds = ['example:history'];
    const problems = checkPackSources(
      [asPack(pack)],
      asSources([allowedSource, historicalSource]),
      ['0005'],
      [],
      new Set(),
    );
    expect(problems.some((problem) => problem.includes('尚未确认可再分发'))).toBe(true);
  });

  it('does not require historical facts to be redistributable', () => {
    expect(
      checkPackSources(
        [asPack(packFixture)],
        asSources([allowedSource, historicalSource]),
        ['0005'],
        [],
        new Set(['wpp2024/CN/births']),
      ),
    ).toEqual([]);
  });

  it('reports a data file that no pack imports', () => {
    const path = join(root, 'packages/country-packs/data/__orphan_fixture.json');
    writeFileSync(path, JSON.stringify({ id: 'wpp2024/CN/orphan' }));
    try {
      const problems = checkPackSources(
        [asPack(packFixture)],
        asSources([allowedSource, historicalSource]),
        ['0005'],
        ['__orphan_fixture.json'],
        new Set(['wpp2024/CN/births']),
      );
      expect(problems.some((problem) => problem.includes('孤立数据文件'))).toBe(true);
    } finally {
      unlinkSync(path);
    }
  });

  it('passes the current repository in command-line mode', () => {
    const output = execFileSync(process.execPath, ['scripts/check-data.mjs'], {
      cwd: root,
      encoding: 'utf8',
    });
    expect(output).toContain('来源登记检查通过');
  });
});
