// 从世界银行 WDI 的 SP.URB.TOTL.IN.ZS（城镇人口占总人口百分比）提取五地序列。
//   node data/scripts/worldbank/urban-share.mjs --input data/cache/worldbank/urban-share.json
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { StatSeriesSchema } from '../../../packages/content-schema/src/index.ts';
import { sha256File } from '../lib/files.mjs';

const root = resolve(import.meta.dirname, '../../..');
const inputsPath = join(root, 'data/scripts/worldbank/inputs.json');
const INDICATOR = 'SP.URB.TOTL.IN.ZS';

/** @typedef {'CN'|'JP'|'KP'|'KR'|'RU'} PackId */
/** @typedef {import('../../../packages/content-schema/src/index.ts').StatSeries} StatSeries */

/** @type {Record<PackId, string>} */
const COUNTRY_CODES = { CN: 'CHN', JP: 'JPN', KP: 'PRK', KR: 'KOR', RU: 'RUS' };

/**
 * 把世界银行 API 的响应转换为一条城镇人口比例序列。
 * @param {unknown} response
 * @param {PackId} packId
 * @returns {StatSeries}
 */
export function toUrbanShareSeries(response, packId) {
  if (!Array.isArray(response) || response.length !== 2 || !Array.isArray(response[1])) {
    throw new Error('世界银行响应必须是长度为 2 的数组，第二项是记录数组');
  }

  const code = COUNTRY_CODES[packId];
  /** @type {Map<number, number | null>} */
  const values = new Map();

  for (const record of response[1]) {
    if (typeof record !== 'object' || record === null) {
      throw new Error('世界银行记录不是对象');
    }
    const row = /** @type {Record<string, unknown>} */ (record);
    if (row.countryiso3code !== code) continue;
    if (
      typeof row.indicator !== 'object' ||
      row.indicator === null ||
      /** @type {Record<string, unknown>} */ (row.indicator).id !== INDICATOR
    ) {
      throw new Error(`世界银行记录缺少指标 ID ${INDICATOR}`);
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

  if (values.size === 0) throw new Error(`世界银行响应中没有 ${packId}（${code}）的数据`);

  const years = [...values.keys()].sort((left, right) => left - right);
  for (let index = 1; index < years.length; index += 1) {
    const previous = years[index - 1];
    const current = years[index];
    if (previous === undefined || current === undefined || current !== previous + 1) {
      throw new Error(`${packId} 的年份不连续：${String(previous)} → ${String(current)}`);
    }
  }
  const firstYear = years[0];
  const lastYear = years[years.length - 1];
  if (firstYear === undefined || lastYear === undefined) {
    throw new Error(`${packId} 没有可用年份`);
  }

  const points = years.map((year) => {
    const value = values.get(year);
    if (value === null || value === undefined) {
      return {
        year,
        age: null,
        value: null,
        missingReason: 'not reported in World Bank WDI',
        projected: false,
      };
    }
    return { year, age: null, value: value / 100, projected: false };
  });

  return StatSeriesSchema.parse({
    id: `wdi/${packId}/urban-share`,
    indicator: 'urban-share',
    geographyId: `country:${packId}`,
    unit: 'share',
    ageBasis: 'none',
    sex: 'both',
    evidence: {
      grade: 'B',
      sourceIds: ['worldbank-wdi:SP.URB.TOTL.IN.ZS'],
      modelVersion: 'wdi-2026-10-20',
      geographyId: `country:${packId}`,
      yearRange: [firstYear, lastYear],
      methodId: 'wdi-urban-share-percent-to-share',
    },
    points,
  });
}

/**
 * @param {string} input
 * @returns {void}
 */
function run(input) {
  const inputs = /** @type {{ id: string, sha256: string }[]} */ (
    JSON.parse(readFileSync(inputsPath, 'utf8'))
  );
  const entry = inputs.find((candidate) => candidate.id === 'urban-share');
  if (!entry) throw new Error('inputs.json 缺少 urban-share');
  const actualHash = sha256File(input);
  if (actualHash !== entry.sha256) {
    console.error(`SHA-256 不符：期望 ${entry.sha256}，实际 ${actualHash}`);
    process.exitCode = 1;
    return;
  }

  const response = JSON.parse(readFileSync(input, 'utf8'));
  for (const packId of /** @type {PackId[]} */ (Object.keys(COUNTRY_CODES))) {
    const series = toUrbanShareSeries(response, packId);
    const output = join(root, `packages/country-packs/data/${packId}/wdi-urban-share.json`);
    mkdirSync(dirname(output), { recursive: true });
    writeFileSync(output, `${JSON.stringify(series, null, 2)}\n`);
    const missing = series.points.filter((point) => point.value === null).length;
    const sample = [1960, 2000].map((year) => {
      const point = series.points.find((candidate) => candidate.year === year);
      return `${year}=${point?.value ?? 'missing'}`;
    });
    const first = series.points[0]?.year;
    const last = series.points[series.points.length - 1]?.year;
    console.log(
      `${packId}: ${first}—${last}，${series.points.length} 个点，缺失 ${missing}；${sample.join(' ')}`,
    );
  }
}

if (import.meta.main) {
  const { values } = parseArgs({ options: { input: { type: 'string' } } });
  if (!values.input) {
    console.error('用法：node data/scripts/worldbank/urban-share.mjs --input <文件路径>');
    process.exitCode = 1;
  } else {
    run(values.input);
  }
}
