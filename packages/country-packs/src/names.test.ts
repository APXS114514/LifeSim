import {
  BIRTH_REGION_IDS,
  NameTableSchema,
  type NameEntry,
  type NameTable,
} from '@lifesim/content-schema';
import { RandomStream, deriveStream, hash128 } from '@lifesim/simulation-core';
import { describe, expect, it } from 'vitest';
import {
  NAME_TABLES,
  NAME_TABLE_FINGERPRINTS,
  PACK_NAME_TABLES,
  computeNameTableFingerprints,
  resolveNameForm,
  selectNameEntry,
  selectableNameEntries,
} from './names.ts';

/** 覆盖检查用的年代起点（「1880—2020 每十年」）。 */
const DECADE_STARTS = [
  1880, 1890, 1900, 1910, 1920, 1930, 1940, 1950, 1960, 1970, 1980, 1990, 2000, 2010, 2020,
];
const SEXES = ['female', 'male'] as const;
const SETTLEMENTS = ['urban', 'rural'] as const;
const MIN_GIVEN = 15;
const MIN_FAMILY = 30;

/** 测试夹具：一张只有 1900—1910 有名字的小表，用来验证空集与分布。 */
const fixtureTable: NameTable = NameTableSchema.parse({
  id: 'xx-given',
  scheme: 'zh',
  kind: 'given',
  version: '0.1.0',
  entries: [
    ['a', 1],
    ['b', 2],
    ['c', 3],
    ['d', 4],
    ['e', 5],
  ].map(([id, weight]) => ({
    id: `fixture-${String(id)}`,
    sex: 'female',
    born: [[1900, 1910]],
    weight,
    grade: 'D',
    forms: { native: '例', 'zh-Hans': '例', en: 'Example' },
    sourceIds: ['adr:0010'],
  })),
});

/** 测试夹具：带城乡限定的表。 */
const settlementFixture: NameTable = NameTableSchema.parse({
  id: 'xx-family',
  scheme: 'zh',
  kind: 'family',
  version: '0.1.0',
  entries: [
    {
      id: 'only-urban',
      sex: 'any',
      born: [[1880, 2026]],
      settlement: 'urban',
      weight: 1,
      grade: 'D',
      forms: { native: '例', 'zh-Hans': '例', en: 'Example' },
      sourceIds: ['adr:0010'],
    },
    {
      id: 'everywhere',
      sex: 'any',
      born: [[1880, 2026]],
      weight: 1,
      grade: 'D',
      forms: { native: '例', 'zh-Hans': '例', en: 'Example' },
      sourceIds: ['adr:0010'],
    },
  ],
});

const request = (
  birthYear: number,
  sex: 'female' | 'male' = 'female',
  settlement: 'urban' | 'rural' = 'urban',
) => ({ birthYear, sex, settlement });

const tableOf = (id: string): NameTable => {
  const table = NAME_TABLES[id];
  if (table === undefined) throw new Error(`missing table ${id}`);
  return table;
};

describe('name table registration', () => {
  it('loads and validates every table and locks its fingerprint', () => {
    for (const [id, table] of Object.entries(NAME_TABLES)) {
      expect(id).toBe(table.id);
      expect(NameTableSchema.safeParse(table).success).toBe(true);
    }
    expect(Object.keys(NAME_TABLE_FINGERPRINTS)).toHaveLength(Object.keys(NAME_TABLES).length);
    expect(computeNameTableFingerprints()).toEqual(NAME_TABLE_FINGERPRINTS);
  });

  it('points every pack at tables that exist', () => {
    for (const packId of BIRTH_REGION_IDS) {
      const tables = PACK_NAME_TABLES[packId];
      expect(NAME_TABLES[tables.family]?.kind).toBe('family');
      if (tables.given !== null) expect(NAME_TABLES[tables.given]?.kind).toBe('given');
      if (tables.patronymic !== null)
        expect(NAME_TABLES[tables.patronymic]?.id).toBe(tables.patronymic);
    }
  });
});

describe('name table coverage', () => {
  it('has at least 15 given names and 30 family names for every decade and sex', () => {
    const short: string[] = [];
    for (const packId of BIRTH_REGION_IDS) {
      const tables = PACK_NAME_TABLES[packId];
      for (const decade of DECADE_STARTS) {
        for (const sex of SEXES) {
          for (const settlement of SETTLEMENTS) {
            const family = selectableNameEntries(
              tableOf(tables.family),
              request(decade, sex, settlement),
            );
            if (family.length < MIN_FAMILY)
              short.push(`${packId}/family/${decade}/${sex}/${settlement}=${family.length}`);
            if (tables.given === null) continue;
            const given = selectableNameEntries(
              tableOf(tables.given),
              request(decade, sex, settlement),
            );
            if (given.length < MIN_GIVEN)
              short.push(`${packId}/given/${decade}/${sex}/${settlement}=${given.length}`);
          }
        }
      }
    }
    expect(short).toEqual([]);
  });

  it('leaves exactly the documented gaps: KP has no given-name table', () => {
    const gaps: string[] = [];
    for (const packId of BIRTH_REGION_IDS) {
      const tables = PACK_NAME_TABLES[packId];
      for (const decade of DECADE_STARTS) {
        for (const sex of SEXES) {
          if (tables.given === null) {
            gaps.push(`${packId}/given/${decade}/${sex}`);
            continue;
          }
          const given = selectableNameEntries(tableOf(tables.given), request(decade, sex));
          if (given.length === 0) gaps.push(`${packId}/given/${decade}/${sex}`);
        }
      }
    }
    const expected = DECADE_STARTS.flatMap((decade) =>
      SEXES.map((sex) => `KP/given/${decade}/${sex}`),
    );
    expect(gaps).toEqual(expected);
  });

  it('keeps every birth window inside 1880—2026', () => {
    for (const table of Object.values(NAME_TABLES)) {
      for (const entry of table.entries) {
        for (const [from, to] of entry.born) {
          expect(from).toBeGreaterThanOrEqual(1880);
          expect(to).toBeLessThanOrEqual(2026);
        }
      }
    }
  });
});

describe('selectNameEntry', () => {
  it('is deterministic for the same table, request and random stream state', () => {
    const table = tableOf('jp-given');
    const first = selectNameEntry(
      table,
      request(1955, 'male'),
      deriveStream('seed-a', 'identity.name'),
    );
    const second = selectNameEntry(
      table,
      request(1955, 'male'),
      deriveStream('seed-a', 'identity.name'),
    );
    const other = selectNameEntry(
      table,
      request(1955, 'male'),
      deriveStream('seed-b', 'identity.name'),
    );
    expect(first?.id).toBe(second?.id);
    expect(first).not.toBeNull();
    expect(other).not.toBeNull();
  });

  it('only consumes one draw from the random stream', () => {
    class CountingStream extends RandomStream {
      calls = 0;
      override next(): number {
        this.calls += 1;
        return super.next();
      }
    }
    const stream = new CountingStream(hash128('counting'));
    selectNameEntry(tableOf('kr-given'), request(1995, 'female'), stream);
    expect(stream.calls).toBe(1);
  });

  it('returns null when the birth year is outside every window', () => {
    expect(selectNameEntry(fixtureTable, request(1950), deriveStream('empty', 'name'))).toBeNull();
    expect(selectableNameEntries(fixtureTable, request(1950))).toEqual([]);
  });

  it('filters by sex', () => {
    const ids = selectableNameEntries(tableOf('cn-given'), request(1995, 'male')).map(
      (entry) => entry.id,
    );
    expect(ids.every((id) => id.endsWith('-m-c3'))).toBe(true);
  });

  it('filters by settlement only for entries that declare one', () => {
    expect(selectableNameEntries(settlementFixture, request(1950, 'female', 'urban'))).toHaveLength(
      2,
    );
    expect(
      selectableNameEntries(settlementFixture, request(1950, 'female', 'rural')).map(
        (entry) => entry.id,
      ),
    ).toEqual(['everywhere']);
  });

  it('draws in proportion to weight (2000 fixed seeds, ±20%)', () => {
    const counts = new Map<string, number>();
    const total = 2000;
    for (let index = 0; index < total; index += 1) {
      const stream = deriveStream(`distribution-${index}`, 'name');
      const entry = selectNameEntry(fixtureTable, request(1905), stream);
      expect(entry).not.toBeNull();
      counts.set(String(entry?.id), (counts.get(String(entry?.id)) ?? 0) + 1);
    }
    const weights = fixtureTable.entries.map((entry) => entry.weight);
    const weightTotal = weights.reduce((sum, weight) => sum + weight, 0);
    fixtureTable.entries.forEach((entry) => {
      const expected = (entry.weight / weightTotal) * total;
      const actual = counts.get(entry.id) ?? 0;
      expect(Math.abs(actual - expected) / expected).toBeLessThan(0.2);
    });
  });
});

describe('name writings', () => {
  const allEntries: NameEntry[] = Object.values(NAME_TABLES).flatMap((table) => table.entries);

  it('fills the three writings and never uses a template marker', () => {
    for (const entry of allEntries) {
      for (const writing of [
        entry.forms,
        entry.genderedForms?.feminine,
        entry.genderedForms?.masculine,
      ]) {
        if (writing === undefined) continue;
        expect(writing.native.length).toBeGreaterThan(0);
        expect(writing['zh-Hans'].length).toBeGreaterThan(0);
        expect(writing.en.length).toBeGreaterThan(0);
        expect(`${writing.native}${writing['zh-Hans']}${writing.en}`).not.toContain('{{');
      }
    }
  });

  it('writes zh-Hans with Chinese characters and middle dots only', () => {
    for (const entry of allEntries) {
      for (const writing of [
        entry.forms,
        entry.genderedForms?.feminine,
        entry.genderedForms?.masculine,
      ]) {
        if (writing === undefined) continue;
        expect(writing['zh-Hans']).toMatch(/^[\u4e00-\u9fff·]+$/);
      }
    }
  });

  it('pairs the feminine and masculine forms of every ru family name and patronymic', () => {
    for (const id of ['ru-family', 'ru-patronymic']) {
      for (const entry of tableOf(id).entries) {
        const gendered = entry.genderedForms;
        expect(gendered).toBeDefined();
        expect(entry.forms).toEqual(gendered?.masculine);
        expect(gendered?.feminine.native).toMatch(/[ая]$/);
        expect(gendered?.masculine.native).toMatch(/[^ая]$/);
        expect(gendered?.feminine.native).not.toBe(gendered?.masculine.native);
        expect(gendered?.feminine['zh-Hans']).not.toBe(gendered?.masculine['zh-Hans']);
      }
    }
  });

  it('resolves the form of a gendered entry by sex and keeps others unchanged', () => {
    const ivanov = tableOf('ru-family').entries.find((entry) => entry.id === 'ivanov');
    expect(ivanov).toBeDefined();
    if (ivanov === undefined) return;
    expect(resolveNameForm(ivanov, 'female').native).toBe('Иванова');
    expect(resolveNameForm(ivanov, 'male').native).toBe('Иванов');
    const hanako = tableOf('jp-given').entries[0];
    if (hanako === undefined) return;
    expect(resolveNameForm(hanako, 'female')).toEqual(hanako.forms);
  });
});
