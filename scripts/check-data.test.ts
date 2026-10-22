import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { SourceRecordSchema } from '../packages/content-schema/src/index.ts';
import { describe, expect, it } from 'vitest';
import type { CountryPack } from '../packages/country-packs/src/index.ts';
import {
  checkEducation,
  checkNameTables,
  checkPackSources,
  renderSourcesMarkdown,
  validateSources,
} from './check-data.mjs';

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
/** 测试夹具，非真实国家包：一条教育制度分段。 */
const educationSegment = {
  validFrom: 1950,
  validTo: null,
  primaryStartAge: 6,
  primaryYears: 6,
  secondaryYears: 3,
  tertiaryYears: 4,
  compulsoryYears: 9,
  entranceExam: { kind: 'none' as const },
  feeShare: 0,
  grade: 'D' as const,
  sourceIds: ['adr:0007'],
  note: 'fixture',
};

const educationPack = (segment: unknown) => ({
  manifest: { packId: 'CN' },
  education: [segment],
});

describe('checkEducation（M3-012d）', () => {
  it('accepts a D-grade segment that cites adr:0007 and has a note', () => {
    expect(checkEducation([educationPack(educationSegment)] as never, [], ['0007'])).toEqual([]);
  });

  it('rejects a D-grade segment without adr:0007', () => {
    const problems = checkEducation(
      [educationPack({ ...educationSegment, sourceIds: ['un-wpp:2024'] })] as never,
      [{ ...allowedSource }],
      ['0007'],
    );
    expect(problems.some((problem) => problem.includes('必须引用 adr:0007'))).toBe(true);
  });

  it('rejects a segment without a note', () => {
    const problems = checkEducation(
      [educationPack({ ...educationSegment, note: ' ' })] as never,
      [],
      ['0007'],
    );
    expect(problems.some((problem) => problem.includes('缺少说明'))).toBe(true);
  });

  it('rejects a C-grade segment that only cites an ADR', () => {
    const problems = checkEducation(
      [
        educationPack({
          ...educationSegment,
          grade: 'C',
          note: undefined,
          sourceIds: ['adr:0007'],
        }),
      ] as never,
      [],
      ['0007'],
    );
    expect(problems.some((problem) => problem.includes('没有引用已登记的非 ADR 来源'))).toBe(true);
  });

  it('rejects a C-grade segment whose non-ADR source is not registered', () => {
    const problems = checkEducation(
      [
        educationPack({
          ...educationSegment,
          grade: 'C',
          sourceIds: ['missing:education-law'],
        }),
      ] as never,
      [],
      ['0007'],
    );
    expect(problems.some((problem) => problem.includes('missing:education-law'))).toBe(true);
  });

  it('accepts a C-grade segment backed by a registered non-ADR source', () => {
    expect(
      checkEducation(
        [educationPack({ ...educationSegment, grade: 'C', sourceIds: ['un-wpp:2024'] })] as never,
        [{ ...allowedSource }],
        ['0007'],
      ),
    ).toEqual([]);
  });

  it('rejects an unregistered source even on a D-grade segment', () => {
    const problems = checkEducation(
      [educationPack({ ...educationSegment, sourceIds: ['adr:0007', 'missing:law'] })] as never,
      [],
      ['0007'],
    );
    expect(problems.some((problem) => problem.includes('missing:law'))).toBe(true);
  });

  it('passes every committed country pack', async () => {
    const { PACKS } = await import('../packages/country-packs/src/index.ts');
    const raw: unknown = JSON.parse(readFileSync(join(root, 'data/sources.json'), 'utf8'));
    const records = (raw as unknown[]).map((record) => SourceRecordSchema.parse(record));
    const adrNumbers = readdirSync(join(root, 'docs/adr'))
      .filter((name) => /^\d{4}-[^/]+\.md$/.test(name))
      .map((name) => name.slice(0, 4));
    expect(checkEducation(Object.values(PACKS), records, adrNumbers)).toEqual([]);
  });
});

/** 测试夹具：一张来源未登记的姓名表；只在测试期间写到磁盘，用完删除。 */
const fixtureNamesDir = join(root, 'packages/country-packs/names/fixture-pack');

const fixtureNameTable = {
  id: 'fixture-pack-family',
  scheme: 'zh',
  kind: 'family',
  version: '0.1.0',
  entries: [
    {
      id: 'fixture-entry',
      sex: 'any',
      born: [[1880, 2026]],
      weight: 1,
      grade: 'D',
      forms: { native: '例', 'zh-Hans': '例', en: 'Example' },
      sourceIds: ['fixture-unregistered:names'],
    },
  ],
};

/** 写入夹具文件并返回相对 `packages/country-packs/names` 的路径。 */
function writeFixtureNameTable(fileName: string, table: unknown): string {
  mkdirSync(fixtureNamesDir, { recursive: true });
  writeFileSync(join(fixtureNamesDir, fileName), JSON.stringify(table));
  return `fixture-pack/${fileName}`;
}

/** 仓库里真实的姓名表文件（相对路径）。 */
function committedNameFiles(): string[] {
  return readdirSync(join(root, 'packages/country-packs/names'), { recursive: true })
    .map((entry) => String(entry).replaceAll('\\', '/'))
    .filter((entry) => entry.endsWith('.json') && !entry.startsWith('fixture-pack/'))
    .sort();
}

describe('checkNameTables', () => {
  it('reports a name table whose source is not registered', () => {
    const file = writeFixtureNameTable('family.json', fixtureNameTable);
    try {
      const problems = checkNameTables([allowedSource], ['0010'], [file]);
      expect(problems.some((problem) => problem.includes('fixture-unregistered:names'))).toBe(true);
    } finally {
      rmSync(fixtureNamesDir, { recursive: true, force: true });
    }
  });

  it('fails the command-line gate when a name table references an unregistered source', () => {
    writeFixtureNameTable('family.json', fixtureNameTable);
    try {
      execFileSync(process.execPath, ['scripts/check-data.mjs'], { cwd: root, encoding: 'utf8' });
      throw new Error('check-data.mjs should have failed on the fixture name table');
    } catch (error) {
      const stderr = String((error as { stderr?: string }).stderr ?? '');
      expect(stderr).toContain('fixture-unregistered:names');
    } finally {
      rmSync(fixtureNamesDir, { recursive: true, force: true });
    }
  });

  it('reports a name table id that does not match its file name', () => {
    const file = writeFixtureNameTable('family.json', { ...fixtureNameTable, id: 'other-id' });
    try {
      const problems = checkNameTables([], ['0010'], [file]);
      expect(problems.some((problem) => problem.includes('fixture-pack-family'))).toBe(true);
    } finally {
      rmSync(fixtureNamesDir, { recursive: true, force: true });
    }
  });

  it('reports an ADR reference that does not exist', () => {
    const file = writeFixtureNameTable('family.json', {
      ...fixtureNameTable,
      entries: [{ ...fixtureNameTable.entries[0], sourceIds: ['adr:9999'] }],
    });
    try {
      const problems = checkNameTables([], ['0010'], [file]);
      expect(problems.some((problem) => problem.includes('adr:9999'))).toBe(true);
    } finally {
      rmSync(fixtureNamesDir, { recursive: true, force: true });
    }
  });

  it('accepts every committed name table: sources registered and redistributable', () => {
    const raw: unknown = JSON.parse(readFileSync(join(root, 'data/sources.json'), 'utf8'));
    const records = (raw as unknown[]).map((record) => SourceRecordSchema.parse(record));
    const adrNumbers = readdirSync(join(root, 'docs/adr'))
      .filter((name) => /^\d{4}-[^/]+\.md$/.test(name))
      .map((name) => name.slice(0, 4));
    const files = committedNameFiles();
    expect(files).toHaveLength(10);
    expect(checkNameTables(records, adrNumbers, files)).toEqual([]);
  });
});
describe('synthetic names versus real names', () => {
  it('never reuses a real name of the five country packs', async () => {
    const { NAME_TABLES } = await import('../packages/country-packs/src/names.ts');
    const { syntheticFamilyName, syntheticGivenName } =
      await import('../packages/synthetic-world/src/names.ts');
    const { deriveStream } = await import('../packages/simulation-core/src/index.ts');

    const real = new Set<string>();
    for (const table of Object.values(NAME_TABLES)) {
      for (const entry of table.entries) {
        for (const writing of [
          entry.forms,
          entry.genderedForms?.feminine,
          entry.genderedForms?.masculine,
        ]) {
          if (writing === undefined) continue;
          real.add(writing.native.toLowerCase());
          real.add(writing.en.toLowerCase());
          real.add(writing['zh-Hans']);
        }
      }
    }
    expect(real.size).toBeGreaterThan(500);

    for (let index = 0; index < 400; index += 1) {
      const family = syntheticFamilyName(deriveStream(`synthetic-collision-${index}`, 'family'));
      expect(real.has(family.toLowerCase())).toBe(false);
      for (const sex of ['female', 'male'] as const) {
        const given = syntheticGivenName(
          sex,
          deriveStream(`synthetic-collision-${index}-${sex}`, 'given'),
        );
        expect(real.has(given.toLowerCase())).toBe(false);
      }
    }
  });
});
