// 从世界银行 WDI 提取五地的 CPI、自付卫生支出占比与人均卫生支出。
//   node data/scripts/worldbank/prices-health.mjs --input data/cache/worldbank/cpi.json
//   node data/scripts/worldbank/prices-health.mjs --input data/cache/worldbank/health-out-of-pocket.json
//   node data/scripts/worldbank/prices-health.mjs --input data/cache/worldbank/health-expenditure.json
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { StatSeriesSchema } from '../../../packages/content-schema/src/index.ts';
import { sha256File } from '../lib/files.mjs';

const root = resolve(import.meta.dirname, '../../..');
const inputsPath = join(root, 'data/scripts/worldbank/inputs.json');

/** @typedef {'CN'|'JP'|'KP'|'KR'|'RU'} PackId */
/** @typedef {'cpi-index'|'health-out-of-pocket-share'|'health-expenditure-per-capita'} Indicator */
/** @typedef {import('../../../packages/content-schema/src/index.ts').StatSeries} StatSeries */
/** @typedef {'index'|'share'|'usd-per-capita'} Unit */

/** @type {Record<PackId, string>} */
const COUNTRY_CODES = { CN: 'CHN', JP: 'JPN', KP: 'PRK', KR: 'KOR', RU: 'RUS' };

/** @type {Record<'cpi'|'health-out-of-pocket'|'health-expenditure', { id: 'cpi'|'health-out-of-pocket'|'health-expenditure', indicator: Indicator, code: string, output: string, unit: Unit, method: string }>} */
const DEFINITIONS = {
  cpi: {
    id: 'cpi',
    indicator: 'cpi-index',
    code: 'FP.CPI.TOTL',
    output: 'wdi-cpi.json',
    unit: 'index',
    method: 'wdi-cpi-index-2010-100',
  },
  'health-out-of-pocket': {
    id: 'health-out-of-pocket',
    indicator: 'health-out-of-pocket-share',
    code: 'SH.XPD.OOPC.CH.ZS',
    output: 'wdi-health-out-of-pocket.json',
    unit: 'share',
    method: 'wdi-oop-health-percent-to-share',
  },
  'health-expenditure': {
    id: 'health-expenditure',
    indicator: 'health-expenditure-per-capita',
    code: 'SH.XPD.CHEX.PC.CD',
    output: 'wdi-health-expenditure.json',
    unit: 'usd-per-capita',
    method: 'wdi-health-expenditure-current-usd-per-capita',
  },
};

/**
 * @param {unknown} response
 * @param {PackId} packId
 * @param {'cpi'|'health-out-of-pocket'|'health-expenditure'} definitionId
 * @returns {StatSeries | null}
 */
export function toPricesHealthSeries(response, packId, definitionId) {
  const definition = DEFINITIONS[definitionId];
  if (!definition) throw new Error(`未知指标定义 ${definitionId}`);
  if (!Array.isArray(response) || response.length !== 2 || !Array.isArray(response[1])) {
    throw new Error('世界银行响应必须是长度为 2 的数组，第二项是记录数组');
  }
  const code = COUNTRY_CODES[packId];
  /** @type {Map<number, number | null>} */
  const values = new Map();

  for (const record of response[1]) {
    if (typeof record !== 'object' || record === null) throw new Error('世界银行记录不是对象');
    const row = /** @type {Record<string, unknown>} */ (record);
    if (row.countryiso3code !== code) continue;
    if (
      typeof row.indicator !== 'object' ||
      row.indicator === null ||
      /** @type {Record<string, unknown>} */ (row.indicator).id !== definition.code
    ) {
      throw new Error(`世界银行记录缺少指标 ID ${definition.code}`);
    }
    if (typeof row.date !== 'string') throw new Error('世界银行记录缺少 date 字段');
    const year = Number(row.date);
    if (!Number.isInteger(year)) throw new Error(`世界银行年份不是整数：${row.date}`);
    if (values.has(year)) throw new Error(`${packId} 的 ${year} 年有重复记录`);
    const value = row.value;
    if (value !== null && typeof value !== 'number') {
      throw new Error(`${packId} 的 ${year} 年值不是数字或 null`);
    }
    if (value !== null) {
      if (definition.unit === 'index' && value <= 0) {
        throw new Error(`${packId} 的 ${year} 年 CPI 不是正数：${value}`);
      }
      if (definition.unit === 'share' && (value < 0 || value > 100)) {
        throw new Error(`${packId} 的 ${year} 年百分比超出 [0, 100]：${value}`);
      }
      if (definition.unit === 'usd-per-capita' && value < 0) {
        throw new Error(`${packId} 的 ${year} 年人均支出为负：${value}`);
      }
    }
    values.set(year, value);
  }

  const observed = [...values.entries()]
    .filter((entry) => entry[1] !== null)
    .sort((left, right) => left[0] - right[0]);
  if (observed.length === 0) return null;

  const points = observed.map(([year, value]) => ({
    year,
    age: null,
    value:
      definition.unit === 'share'
        ? /** @type {number} */ (value) / 100
        : /** @type {number} */ (value),
    projected: false,
  }));
  const firstYear = points[0]?.year;
  const lastYear = points[points.length - 1]?.year;
  if (firstYear === undefined || lastYear === undefined) throw new Error(`${packId} 没有可用年份`);
  const lastupdated =
    typeof response[0] === 'object' && response[0] !== null
      ? /** @type {Record<string, unknown>} */ (response[0]).lastupdated
      : undefined;

  return StatSeriesSchema.parse({
    id: `wdi/${packId}/${definition.indicator}`,
    indicator: definition.indicator,
    geographyId: `country:${packId}`,
    unit: definition.unit,
    ageBasis: 'none',
    sex: 'both',
    evidence: {
      grade: 'B',
      sourceIds: [`worldbank-wdi:${definition.code}`],
      modelVersion: `wdi-${typeof lastupdated === 'string' ? lastupdated : 'unknown'}`,
      geographyId: `country:${packId}`,
      yearRange: [firstYear, lastYear],
      methodId: definition.method,
    },
    points,
  });
}

function loadInputs() {
  return /** @type {{ id: string, file: string, sha256: string }[]} */ (
    JSON.parse(readFileSync(inputsPath, 'utf8'))
  );
}

/**
 * @param {string} input
 * @returns {void}
 */
function run(input) {
  const name = input.split('/').pop() ?? '';
  const definition = Object.values(DEFINITIONS).find((candidate) => name.includes(candidate.id));
  if (!definition) throw new Error(`无法从文件名判断指标：${input}`);
  const entry = loadInputs().find((candidate) => candidate.id === definition.id);
  if (!entry) throw new Error(`inputs.json 缺少 ${definition.id}`);
  const actualHash = sha256File(input);
  if (actualHash !== entry.sha256) {
    console.error(`SHA-256 不符：期望 ${entry.sha256}，实际 ${actualHash}`);
    process.exitCode = 1;
    return;
  }

  const response = JSON.parse(readFileSync(input, 'utf8'));
  for (const packId of /** @type {PackId[]} */ (Object.keys(COUNTRY_CODES))) {
    const series = toPricesHealthSeries(response, packId, definition.id);
    if (series === null) {
      console.log(`${packId}: 无观测，跳过 ${definition.output}`);
      continue;
    }
    const output = join(root, `packages/country-packs/data/${packId}/${definition.output}`);
    mkdirSync(dirname(output), { recursive: true });
    writeFileSync(output, `${JSON.stringify(series, null, 2)}\n`);
    const first = series.points[0]?.year;
    const last = series.points[series.points.length - 1]?.year;
    console.log(`${packId}: ${first}—${last}，${series.points.length} 个点`);
  }
}

if (import.meta.main) {
  const { values } = parseArgs({ options: { input: { type: 'string' } } });
  if (!values.input) {
    console.error('用法：node data/scripts/worldbank/prices-health.mjs --input <文件路径>');
    process.exitCode = 1;
  } else {
    run(values.input);
  }
}
