// 从世界银行 WDI 提取五地的中学毛入学率与高中完成率。
//   node data/scripts/worldbank/education.mjs --input data/cache/worldbank/education-enrollment.json
//   node data/scripts/worldbank/education.mjs --input data/cache/worldbank/education-completion.json
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { StatSeriesSchema } from '../../../packages/content-schema/src/index.ts';
import { sha256File } from '../lib/files.mjs';

const root = resolve(import.meta.dirname, '../../..');
const inputsPath = join(root, 'data/scripts/worldbank/inputs.json');

/** @typedef {'CN'|'JP'|'KP'|'KR'|'RU'} PackId */
/** @typedef {'education-enrollment-secondary'|'education-completion-upper-secondary'} Indicator */
/** @typedef {import('../../../packages/content-schema/src/index.ts').StatSeries} StatSeries */
/** @typedef {{ id: 'education-enrollment'|'education-completion', indicator: Indicator, code: string, output: string }} Definition */

/** @type {Record<PackId, string>} */
const COUNTRY_CODES = { CN: 'CHN', JP: 'JPN', KP: 'PRK', KR: 'KOR', RU: 'RUS' };

/** @type {Record<'education-enrollment'|'education-completion', Definition>} */
const DEFINITIONS = {
  'education-enrollment': {
    id: 'education-enrollment',
    indicator: 'education-enrollment-secondary',
    code: 'SE.SEC.ENRR',
    output: 'wdi-education-enrollment.json',
  },
  'education-completion': {
    id: 'education-completion',
    indicator: 'education-completion-upper-secondary',
    code: 'SE.SEC.CUAT.UP.ZS',
    output: 'wdi-education-completion.json',
  },
};

/**
 * @param {unknown} response
 * @param {PackId} packId
 * @param {'education-enrollment'|'education-completion'} definitionId
 * @returns {StatSeries | null}
 */
export function toEducationSeries(response, packId, definitionId) {
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
    values.set(year, value);
  }

  const observed = [...values.entries()]
    .filter((entry) => entry[1] !== null)
    .sort((left, right) => left[0] - right[0]);
  if (observed.length === 0) return null;

  const points = observed.map(([year, value]) => ({
    year,
    age: null,
    // 毛入学率保留百分比（可超过 100）；高中完成率转换成 0—1 的 share。
    value:
      definition.indicator === 'education-completion-upper-secondary'
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
    unit:
      definition.indicator === 'education-completion-upper-secondary' ? 'share' : 'percent-gross',
    ageBasis: 'none',
    sex: 'both',
    evidence: {
      grade: 'B',
      sourceIds: [`worldbank-wdi:${definition.code}`],
      modelVersion: `wdi-${typeof lastupdated === 'string' ? lastupdated : 'unknown'}`,
      geographyId: `country:${packId}`,
      yearRange: [firstYear, lastYear],
      methodId:
        definition.indicator === 'education-completion-upper-secondary'
          ? 'wdi-upper-secondary-completion-percent-to-share'
          : 'wdi-gross-secondary-enrollment-percent',
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
    const series = toEducationSeries(response, packId, definition.id);
    if (series === null) {
      console.log(`${packId}: 无观测，跳过 ${definition.output}`);
      continue;
    }
    const output = join(root, `packages/country-packs/data/${packId}/${definition.output}`);
    mkdirSync(dirname(output), { recursive: true });
    writeFileSync(output, `${JSON.stringify(series, null, 2)}\n`);
    const first = series.points[0]?.year;
    const last = series.points[series.points.length - 1]?.year;
    const sample = series.points
      .slice(0, 2)
      .map((point) => `${point.year}=${point.value}`)
      .join(' ');
    console.log(`${packId}: ${first}—${last}，${series.points.length} 个点；${sample}`);
  }
}

if (import.meta.main) {
  const { values } = parseArgs({ options: { input: { type: 'string' } } });
  if (!values.input) {
    console.error('用法：node data/scripts/worldbank/education.mjs --input <文件路径>');
    process.exitCode = 1;
  } else {
    run(values.input);
  }
}
