import { describe, expect, it } from 'vitest';
import { NameEntrySchema, NameRefSchema, NameTableSchema, PersonNameSchema } from './names.ts';

// 本文件所有数据都是测试夹具，不是真实姓名数据。

/** 测试夹具：一条合法的姓条目。 */
const familyEntry = {
  id: 'example-family',
  sex: 'any',
  born: [[1880, 2026]],
  weight: 10,
  grade: 'D',
  forms: { native: '例', 'zh-Hans': '例', en: 'Example' },
  sourceIds: ['fixture:names'],
} as const;

/** 测试夹具：一张合法的姓表。 */
const familyTable = {
  id: 'xx-family',
  scheme: 'zh',
  kind: 'family',
  version: '0.1.0',
  entries: [familyEntry],
} as const;

/** 测试夹具：ru 表的阴阳性两套写法。 */
const genderedForms = {
  feminine: { native: 'Примерова', 'zh-Hans': '普里梅罗娃', en: 'Primerova' },
  masculine: { native: 'Примеров', 'zh-Hans': '普里梅罗夫', en: 'Primerov' },
} as const;

const parseTable = (overrides: Record<string, unknown>) =>
  NameTableSchema.safeParse({ ...familyTable, ...overrides });

const parseEntry = (overrides: Record<string, unknown>) =>
  NameEntrySchema.safeParse({ ...familyEntry, ...overrides });

type ParseFailure = {
  success: false;
  error: { issues: readonly { message: string; path: readonly PropertyKey[] }[] };
};

const messages = (result: { success: true } | ParseFailure): string =>
  result.success
    ? ''
    : result.error.issues
        .map((issue) => `${issue.path.map((part) => String(part)).join('.')}: ${issue.message}`)
        .join(' | ');

describe('NameTableSchema', () => {
  it('accepts a minimal valid table', () => {
    expect(NameTableSchema.safeParse(familyTable).success).toBe(true);
  });

  it('accepts entries that apply only to one sex and to a part of the birth years', () => {
    const result = NameTableSchema.safeParse({
      ...familyTable,
      entries: [
        {
          ...familyEntry,
          sex: 'female',
          born: [
            [1880, 1935],
            [1950, 2026],
          ],
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('rejects a table without entries', () => {
    expect(parseTable({ entries: [] }).success).toBe(false);
  });

  it('rejects a missing writing', () => {
    const { 'zh-Hans': _zhHans, ...withoutZhHans } = familyEntry.forms;
    const result = parseEntry({ forms: withoutZhHans });
    expect(result.success).toBe(false);
    expect(messages(result)).toContain('zh-Hans');
  });

  it('rejects an empty writing and the template marker', () => {
    expect(parseEntry({ forms: { native: '', 'zh-Hans': '例', en: 'Example' } }).success).toBe(
      false,
    );
    expect(
      parseEntry({ forms: { native: '{{name}}', 'zh-Hans': '例', en: 'Example' } }).success,
    ).toBe(false);
  });

  it('rejects a zh-Hans writing that is not Chinese characters', () => {
    const result = parseEntry({ forms: { native: 'Ex', 'zh-Hans': 'Example', en: 'Example' } });
    expect(result.success).toBe(false);
    expect(messages(result)).toContain('zh-Hans');
  });

  it('accepts a middle dot in the zh-Hans writing', () => {
    const result = parseEntry({
      forms: { native: 'Ex', 'zh-Hans': '玛丽亚·伊万诺娃', en: 'Example' },
    });
    expect(result.success).toBe(true);
  });

  it('rejects a birth year outside the supported span', () => {
    expect(parseEntry({ born: [[1799, 1900]] }).success).toBe(false);
    expect(parseEntry({ born: [[1900, 2101]] }).success).toBe(false);
  });

  it('rejects a birth range whose bounds are reversed or empty', () => {
    expect(parseEntry({ born: [[1950, 1935]] }).success).toBe(false);
    expect(parseEntry({ born: [] }).success).toBe(false);
  });

  it('rejects zero and negative weights', () => {
    expect(parseEntry({ weight: 0 }).success).toBe(false);
    expect(parseEntry({ weight: -1 }).success).toBe(false);
  });

  it('rejects duplicate entry ids', () => {
    const result = parseTable({ entries: [familyEntry, familyEntry] });
    expect(result.success).toBe(false);
    expect(messages(result)).toContain('example-family');
  });

  it('rejects an entry id that is not lowercase alphanumeric with hyphens', () => {
    expect(parseEntry({ id: 'Example_Family' }).success).toBe(false);
  });

  it('rejects a source id that is not a registered-source reference', () => {
    expect(parseEntry({ sourceIds: [] }).success).toBe(false);
    expect(parseEntry({ sourceIds: ['wikidata'] }).success).toBe(false);
  });

  it('rejects a grade outside A—D', () => {
    expect(parseEntry({ grade: 'E' }).success).toBe(false);
  });

  it('rejects unknown fields', () => {
    expect(parseEntry({ kind: 'family' }).success).toBe(false);
  });
});

describe('NameTableSchema gendered forms', () => {
  it('requires both gender forms for a ru entry that serves both sexes', () => {
    const result = NameTableSchema.safeParse({
      ...familyTable,
      scheme: 'ru',
      entries: [familyEntry],
    });
    expect(result.success).toBe(false);
    expect(messages(result)).toContain('genderedForms');
  });

  it('accepts a ru family table whose entries carry both gender forms', () => {
    const result = NameTableSchema.safeParse({
      ...familyTable,
      scheme: 'ru',
      entries: [{ ...familyEntry, genderedForms }],
    });
    expect(result.success).toBe(true);
  });

  it('requires both halves of the gender forms', () => {
    const result = NameTableSchema.safeParse({
      ...familyTable,
      scheme: 'ru',
      entries: [{ ...familyEntry, genderedForms: { masculine: genderedForms.masculine } }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects gender forms on a ru entry that is already sex specific', () => {
    const result = NameTableSchema.safeParse({
      ...familyTable,
      scheme: 'ru',
      kind: 'given',
      entries: [{ ...familyEntry, sex: 'female', genderedForms }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects gender forms outside the ru scheme', () => {
    const result = NameTableSchema.safeParse({
      ...familyTable,
      scheme: 'ja',
      entries: [{ ...familyEntry, genderedForms }],
    });
    expect(result.success).toBe(false);
  });
});

describe('NameRefSchema and PersonNameSchema', () => {
  it('accepts a reference and a full ru person name', () => {
    expect(NameRefSchema.safeParse({ table: 'jp-given', id: 'hanako-f-c1' }).success).toBe(true);
    const person = {
      scheme: 'ru',
      family: { table: 'ru-family', id: 'ivanov' },
      given: { table: 'ru-given', id: 'ivan-m-c1' },
      patronymic: { table: 'ru-patronymic', id: 'ivanovich' },
    };
    expect(PersonNameSchema.safeParse(person).success).toBe(true);
  });

  it('accepts null references to express a data gap', () => {
    expect(
      PersonNameSchema.safeParse({ scheme: 'zh', family: null, given: null, patronymic: null })
        .success,
    ).toBe(true);
  });

  it('rejects a patronymic outside the ru scheme', () => {
    const result = PersonNameSchema.safeParse({
      scheme: 'ko',
      family: null,
      given: null,
      patronymic: { table: 'ru-patronymic', id: 'ivanovich' },
    });
    expect(result.success).toBe(false);
    expect(messages(result)).toContain('patronymic');
  });

  it('rejects an unknown scheme and a malformed reference', () => {
    expect(
      PersonNameSchema.safeParse({ scheme: 'xx', family: null, given: null, patronymic: null })
        .success,
    ).toBe(false);
    expect(NameRefSchema.safeParse({ table: 'JP-given', id: 'Hanako' }).success).toBe(false);
    expect(NameRefSchema.safeParse({ table: 'jp-given' }).success).toBe(false);
  });
});
