/**
 * 姓名表登记与选择（ADR-0010 A2，任务 M3-045）。
 *
 * 表放在 `packages/country-packs/names/<PACK>/`（不是 `data/`：那里的 JSON 都是统计序列）。
 * 本模块只做三件事：把表读进来并校验、锁住表指纹、按年代/性别/城乡抽一个条目。
 * 规则侧（M3-043）如何把条目组合成姓名不在本模块的实现范围内。
 */
import {
  NameTableSchema,
  type BirthRegionId,
  type NameEntry,
  type NameForm,
  type NameTable,
} from '@lifesim/content-schema';
import { canonicalJson, fingerprint, type RandomStream } from '@lifesim/simulation-core';
import cnFamily from '../names/CN/family.json' with { type: 'json' };
import cnGiven from '../names/CN/given.json' with { type: 'json' };
import jpFamily from '../names/JP/family.json' with { type: 'json' };
import jpGiven from '../names/JP/given.json' with { type: 'json' };
import kpFamily from '../names/KP/family.json' with { type: 'json' };
import krFamily from '../names/KR/family.json' with { type: 'json' };
import krGiven from '../names/KR/given.json' with { type: 'json' };
import ruFamily from '../names/RU/family.json' with { type: 'json' };
import ruGiven from '../names/RU/given.json' with { type: 'json' };
import ruPatronymic from '../names/RU/patronymic.json' with { type: 'json' };

/** 文件名与表 ID 必须一致，否则存档里的 `NameRef.table` 会指向不存在的表。 */
const RAW_TABLES = [
  ['cn-family', cnFamily],
  ['cn-given', cnGiven],
  ['jp-family', jpFamily],
  ['jp-given', jpGiven],
  ['kp-family', kpFamily],
  ['kr-family', krFamily],
  ['kr-given', krGiven],
  ['ru-family', ruFamily],
  ['ru-given', ruGiven],
  ['ru-patronymic', ruPatronymic],
] as const;

/** 全部姓名表，键是表 ID。 */
export const NAME_TABLES: Readonly<Record<string, NameTable>> = Object.freeze(
  Object.fromEntries(
    RAW_TABLES.map(([fileName, raw]) => {
      const table = NameTableSchema.parse(raw);
      if (table.id !== fileName) {
        throw new Error(`Name table file ${fileName} declares id ${table.id}`);
      }
      return [table.id, table];
    }),
  ),
);

/** 每个国家包用哪几张表；`null` 表示该地区在该组成部分上有数据缺口（ADR-0010 A2.1）。 */
export interface PackNameTables {
  readonly family: string;
  readonly given: string | null;
  readonly patronymic: string | null;
}

export const PACK_NAME_TABLES: Readonly<Record<BirthRegionId, PackNameTables>> = Object.freeze({
  CN: { family: 'cn-family', given: 'cn-given', patronymic: null },
  JP: { family: 'jp-family', given: 'jp-given', patronymic: null },
  // 朝鲜：只交付有公开惯用汉字写法的姓；名字缺口见 docs/data/NAMES.md。
  KP: { family: 'kp-family', given: null, patronymic: null },
  KR: { family: 'kr-family', given: 'kr-given', patronymic: null },
  RU: { family: 'ru-family', given: 'ru-given', patronymic: 'ru-patronymic' },
});

/** 用 canonical JSON 计算每张表的指纹，与 `NAME_TABLE_FINGERPRINTS` 比对（见测试）。 */
export function computeNameTableFingerprints(): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [id, table] of Object.entries(NAME_TABLES)) {
    result[id] = fingerprint(canonicalJson(table));
  }
  return result;
}

/**
 * 姓名表指纹 —— **高风险常量**：只有名单有意更新、并经维护者抽查后才能改。
 * 条目 ID 只增不删；删条目或改 ID 必须同时升表的 `version`。
 */
export const NAME_TABLE_FINGERPRINTS: Record<string, string> = {
  'cn-family': '7fdb91812029cd91523555d2f0280b16',
  'cn-given': '3871e1eb62d578357fb3e552753bae36',
  'jp-family': '30547519f2fb42299b380e696da89afb',
  'jp-given': '568769298f78fa64b644f0757ecfc097',
  'kp-family': 'dfc8414231c0ca280250d4fe1886ad28',
  'kr-family': '3bf403b05599daa3997490e70fa3d25c',
  'kr-given': 'acff8a2e7c09c776660daf88bc4aaf71',
  'ru-family': '5b20581ef822dcc3c8f029b40116bc3e',
  'ru-given': '2b3a0557cd3a44df4c43ebd0ba75793a',
  'ru-patronymic': 'ca591788bde8c49802ed596628f5fa65',
};

export interface NameSelectionRequest {
  birthYear: number;
  sex: 'female' | 'male';
  settlement: 'urban' | 'rural';
}

function appliesTo(entry: NameEntry, request: NameSelectionRequest): boolean {
  if (entry.sex !== 'any' && entry.sex !== request.sex) return false;
  if (entry.settlement !== undefined && entry.settlement !== request.settlement) return false;
  return entry.born.some(([from, to]) => request.birthYear >= from && request.birthYear <= to);
}

/** 按年代窗口、性别与城乡筛出可用条目（判定顺序即表内顺序，供需要稳定顺序的调用方使用）。 */
export function selectableNameEntries(
  table: NameTable,
  request: NameSelectionRequest,
): NameEntry[] {
  return table.entries.filter((entry) => appliesTo(entry, request));
}

/**
 * 从表里按 `weight` 抽一个条目。只消费一次随机数，因此同表、同输入、同随机流状态给出同一结果。
 * 没有可用条目时返回 `null`：该处显示「姓名待接入」，不回退到其他年代或地区（ADR-0010 A2.1）。
 */
export function selectNameEntry(
  table: NameTable,
  request: NameSelectionRequest,
  random: RandomStream,
): NameEntry | null {
  const candidates = selectableNameEntries(table, request);
  if (candidates.length === 0) return null;
  const byId = new Map(candidates.map((entry) => [entry.id, entry]));
  const chosen = random.weighted(candidates.map((entry) => [entry.id, entry.weight] as const));
  return byId.get(chosen) ?? null;
}

/** 条目的写法：随性别变形的表（ru 的姓与父称）按性别取，其余取基础写法。 */
export function resolveNameForm(entry: NameEntry, sex: 'female' | 'male'): NameForm {
  if (entry.genderedForms === undefined) return entry.forms;
  return sex === 'female' ? entry.genderedForms.feminine : entry.genderedForms.masculine;
}
