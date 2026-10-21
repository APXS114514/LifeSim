// 从 WPP 2024 Demographic Indicators（Medium 方案）提取五地 1950—2100 年出生性别比（SRB）。
//   node data/scripts/wpp2024/srb.mjs --input data/cache/wpp2024/WPP2024_Demographic_Indicators_Medium.csv.gz
//
// 口径：SRB 是「每 100 名女婴对应的男婴数」（ADR-0010 A1）。WPP 的 Demographic Indicators 文件
// 就用这个口径存 SRB（同一文件的 PopSexRatio 也是每 100 名女性的人数），因此数值直接使用，
// 不做任何换算。合理范围 90—130：超出即报错停下，不修正数据。
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { StatSeriesSchema } from '../../../packages/content-schema/src/index.ts';
import { readCsvRecords } from '../lib/csv.mjs';
import { readTextFile, sha256File } from '../lib/files.mjs';

const root = resolve(import.meta.dirname, '../../..');
const inputsPath = join(root, 'data/scripts/wpp2024/inputs.json');

/** @typedef {'CN'|'JP'|'KP'|'KR'|'RU'} PackId */
/** @typedef {import('../../../packages/content-schema/src/index.ts').StatSeries} StatSeries */

/** @type {Record<PackId, { locId: string, name: string }>} */
const REGIONS = {
  CN: { locId: '156', name: 'China' },
  JP: { locId: '392', name: 'Japan' },
  KP: { locId: '408', name: "Dem. People's Republic of Korea" },
  KR: { locId: '410', name: 'Republic of Korea' },
  RU: { locId: '643', name: 'Russian Federation' },
};

const FIRST_YEAR = 1950;
const LAST_YEAR = 2100;
const PROJECTED_FROM = 2024;
/** SRB 的合理范围（每 100 名女婴的男婴数）；超出即数据可疑，报错停下。 */
const MIN_SRB = 90;
const MAX_SRB = 130;

/**
 * 把 WPP Demographic Indicators 的记录转换为一条出生性别比序列。
 * @param {Record<string, string>[]} records
 * @param {PackId} packId
 * @returns {StatSeries}
 */
export function toSrbSeries(records, packId) {
  const region = REGIONS[packId];
  const header = records[0];
  if (!header) throw new Error('WPP CSV 没有数据行');
  for (const column of ['LocID', 'Location', 'Time', 'Variant', 'SRB']) {
    if (!(column in header)) throw new Error(`WPP CSV 缺少列 ${column}`);
  }

  const selected = records.filter(
    (record) => record.LocID === region.locId && record.Variant === 'Medium',
  );
  if (selected.length === 0) {
    throw new Error(`WPP CSV 中没有 ${packId}（LocID ${region.locId}，Medium）的数据`);
  }

  /** @type {Map<number, number>} */
  const values = new Map();
  for (const record of selected) {
    if (record.Location !== region.name) {
      throw new Error(`${packId} 的地点名称不符：期望 "${region.name}"，实际 "${record.Location}"`);
    }
    const year = Number(record.Time);
    if (!Number.isInteger(year)) throw new Error(`${packId} 的年份不是整数：${record.Time}`);
    // WPP 文件另有 2101 年的行（数值为空，用于 2101 年初人口）；项目只覆盖到 2100。
    if (year < FIRST_YEAR || year > LAST_YEAR) continue;
    if (values.has(year)) throw new Error(`${packId} 的 ${year} 年有重复行`);
    const raw = record.SRB ?? '';
    if (raw.trim() === '') {
      throw new Error(`${packId} 的 ${year} 年出生性别比为空；不得用 0 或合计填补`);
    }
    const value = Number(raw);
    if (!Number.isFinite(value)) {
      throw new Error(`${packId} 的 ${year} 年出生性别比不是有限数字：${raw}`);
    }
    if (value < MIN_SRB || value > MAX_SRB) {
      throw new Error(
        `${packId} 的 ${year} 年出生性别比 ${raw} 不在合理范围 [${MIN_SRB}, ${MAX_SRB}]；停止并核对原始文件`,
      );
    }
    values.set(year, value);
  }

  for (let year = FIRST_YEAR; year <= LAST_YEAR; year += 1) {
    if (!values.has(year)) throw new Error(`${packId} 缺少 ${year} 年的出生性别比`);
  }
  if (values.size !== LAST_YEAR - FIRST_YEAR + 1) {
    throw new Error(`${packId} 的年份不是恰好 1950—2100`);
  }

  return StatSeriesSchema.parse({
    id: `wpp2024/${packId}/srb`,
    indicator: 'sex-ratio-at-birth',
    geographyId: `country:${packId}`,
    unit: 'males-per-100-females',
    ageBasis: 'none',
    sex: 'both',
    evidence: {
      grade: 'B',
      sourceIds: ['un-wpp:2024'],
      modelVersion: 'wpp2024-medium',
      geographyId: `country:${packId}`,
      yearRange: [FIRST_YEAR, LAST_YEAR],
      methodId: 'wpp2024-demographic-indicators',
    },
    points: [...values.entries()]
      .sort(([left], [right]) => left - right)
      .map(([year, value]) => ({
        year,
        age: null,
        value,
        projected: year >= PROJECTED_FROM,
      })),
  });
}

/**
 * @param {string} input 输入 CSV 路径
 * @returns {void}
 */
function run(input) {
  const inputs = /** @type {{ id: string, sha256: string }[]} */ (
    JSON.parse(readFileSync(inputsPath, 'utf8'))
  );
  const entry = inputs.find((candidate) => candidate.id === 'demographic-indicators');
  if (!entry) throw new Error('inputs.json 缺少 demographic-indicators');

  const actualHash = sha256File(input);
  if (actualHash !== entry.sha256) {
    console.error(`SHA-256 不符：期望 ${entry.sha256}，实际 ${actualHash}`);
    process.exitCode = 1;
    return;
  }

  const records = readCsvRecords(readTextFile(input));
  for (const packId of /** @type {PackId[]} */ (Object.keys(REGIONS))) {
    const series = toSrbSeries(records, packId);
    const output = join(root, `packages/country-packs/data/${packId}/wpp2024-srb.json`);
    mkdirSync(dirname(output), { recursive: true });
    writeFileSync(output, `${JSON.stringify(series, null, 2)}\n`);
    const sample = [1950, 1990, 2020, 2024].map((year) => {
      const point = series.points.find((candidate) => candidate.year === year);
      return `${year}=${point?.value ?? 'missing'}`;
    });
    console.log(`${packId}: ${series.points.length} 个点；${sample.join(' ')}`);
  }
}

if (import.meta.main) {
  const { values } = parseArgs({ options: { input: { type: 'string' } } });
  if (!values.input) {
    console.error('用法：node data/scripts/wpp2024/srb.mjs --input <文件路径>');
    process.exitCode = 1;
  } else {
    run(values.input);
  }
}
