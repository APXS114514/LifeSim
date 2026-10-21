import type { BirthRegionId, NameRef } from '@lifesim/content-schema';
import { NAME_TABLES, PACK_NAME_TABLES, selectNameEntry } from '@lifesim/country-packs';
import type { RegionNames } from '@lifesim/systems';

/** 仅映射已交付的父称条目；缺少父名对应项时保留 null，禁止补造数据。 */
const RU_PATRONYMICS: Readonly<Record<string, string>> = {
  ivan: 'ivanovich',
  pyotr: 'petrovich',
  aleksandr: 'aleksandrovich',
  nikolay: 'nikolaevich',
  mikhail: 'mikhaylovich',
  vasily: 'vasilyevich',
  fedor: 'fedorovich',
  dmitry: 'dmitrievich',
  sergey: 'sergeevich',
  aleksey: 'alekseevich',
  andrey: 'andreevich',
  vladimir: 'vladimirovich',
  pavel: 'pavlovich',
  grigory: 'grigoryevich',
  stepan: 'stepanovich',
  egor: 'egorovich',
  viktor: 'viktorovich',
  yury: 'yuryevich',
  oleg: 'olegovich',
  boris: 'borisovich',
};

export function realRegionNames(packId: BirthRegionId): RegionNames {
  const tables = PACK_NAME_TABLES[packId];
  const familyTable = NAME_TABLES[tables.family];
  if (!familyTable) throw new Error(`Missing family name table for ${packId}`);
  return {
    scheme: familyTable.scheme,
    select(part, request, random) {
      const tableId = tables[part];
      if (tableId === null) return null;
      const table = NAME_TABLES[tableId];
      if (!table) throw new Error(`Missing name table ${tableId}`);
      const entry = selectNameEntry(table, request, random);
      return entry === null ? null : { table: table.id, id: entry.id };
    },
    patronymic(given): NameRef | null {
      if (tables.patronymic === null || given?.table !== 'ru-given') return null;
      const root = given.id.replace(/-m-c\d+$/, '');
      const id = RU_PATRONYMICS[root];
      if (id === undefined) return null;
      const table = NAME_TABLES[tables.patronymic];
      if (!table?.entries.some((entry) => entry.id === id)) return null;
      return { table: table.id, id };
    },
  };
}
