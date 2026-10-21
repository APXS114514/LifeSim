// 从 WPP 2024 单岁生命表（Medium）提取五地 1950—2100 年、0—100 岁的 qx，按性别分别输出。
//   node data/scripts/wpp2024/qx.mjs --estimates <1950-2023 文件> --projections <2024-2100 文件>
//   node data/scripts/wpp2024/qx.mjs --female-estimates <…> --female-projections <…> \
//     --male-estimates <…> --male-projections <…>
// 只给合计参数时输出 `wpp2024-qx.json`（与 M2 起的数据逐字节相同）；给分性别参数时另外输出
// `wpp2024-qx-female.json`、`wpp2024-qx-male.json`（ADR-0010 A3、M3-047）。
//
// 每个源文件解压后超过 1 GB，CLI 先按 LocID 流式筛选，再交给 toQxSeries 做纯转换。
import { createReadStream, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { dirname, join, resolve } from 'node:path';
import { createGunzip } from 'node:zlib';
import { parseArgs } from 'node:util';
import { StatSeriesSchema } from '../../../packages/content-schema/src/index.ts';
import { readCsvRecords } from '../lib/csv.mjs';
import { sha256File } from '../lib/files.mjs';

const root = resolve(import.meta.dirname, '../../..');
const inputsPath = join(root, 'data/scripts/wpp2024/inputs.json');

/** @typedef {'CN'|'JP'|'KP'|'KR'|'RU'} PackId */
/** @typedef {'both'|'female'|'male'} QxSex */
/** @typedef {import('../../../packages/content-schema/src/index.ts').StatSeries} StatSeries */

/** @type {Record<PackId, { locId: string, name: string }>} */
const REGIONS = {
  CN: { locId: '156', name: 'China' },
  JP: { locId: '392', name: 'Japan' },
  KP: { locId: '408', name: "Dem. People's Republic of Korea" },
  KR: { locId: '410', name: 'Republic of Korea' },
  RU: { locId: '643', name: 'Russian Federation' },
};

/**
 * WPP 文件里每个性别口径的行标记。WPP2024 生命表的 SexID：1 = Male、2 = Female、3 = Total，
 * 与 Sex 列的取值一一对应（已对原始文件逐值核实）。
 * @type {Record<QxSex, { sexLabel: string, sexId: string, suffix: string, methodId: string }>}
 */
const SEX_SPECS = {
  both: {
    sexLabel: 'Total',
    sexId: '3',
    suffix: '',
    methodId: 'wpp2024-life-table-single-age-both',
  },
  female: {
    sexLabel: 'Female',
    sexId: '2',
    suffix: '-female',
    methodId: 'wpp2024-life-table-single-age-female',
  },
  male: {
    sexLabel: 'Male',
    sexId: '1',
    suffix: '-male',
    methodId: 'wpp2024-life-table-single-age-male',
  },
};

const FIRST_YEAR = 1950;
const LAST_YEAR = 2100;
const PROJECTED_FROM = 2024;

/**
 * 把两个生命表文件的记录合并转换为一条 qx 序列。
 * @param {Record<string, string>[]} records
 * @param {PackId} packId
 * @param {QxSex} [sex] 性别口径，缺省为合计（与改动前的输出保持一致）
 * @returns {StatSeries}
 */
export function toQxSeries(records, packId, sex = 'both') {
  const spec = SEX_SPECS[sex];
  if (!spec) throw new Error(`未知的性别口径：${sex}`);
  const region = REGIONS[packId];
  const header = records[0];
  if (!header) throw new Error('WPP 生命表没有数据行');
  for (const column of [
    'LocID',
    'Location',
    'Time',
    'Variant',
    'AgeGrpStart',
    'AgeGrpSpan',
    'qx',
  ]) {
    if (!(column in header)) throw new Error(`WPP 生命表缺少列 ${column}`);
  }
  const hasSex = 'Sex' in header || 'SexID' in header;

  /** @type {Map<number, Map<number, number>>} */
  const byYear = new Map();
  for (const record of records) {
    if (record.LocID !== region.locId) continue;
    if (record.Variant !== 'Medium') continue;
    if (hasSex && record.Sex !== spec.sexLabel && record.SexID !== spec.sexId) continue;

    const year = Number(record.Time);
    if (!Number.isInteger(year)) throw new Error(`${packId} 的年份不是整数：${record.Time}`);
    if (year < FIRST_YEAR || year > LAST_YEAR) continue;

    if (record.Location !== region.name) {
      throw new Error(`${packId} 的地点名称不符：期望 "${region.name}"，实际 "${record.Location}"`);
    }

    const age = Number(record.AgeGrpStart);
    const span = Number(record.AgeGrpSpan);
    if (!Number.isInteger(age) || age < 0 || age > 100) {
      throw new Error(`${packId} 的 ${year} 年年龄不合法：${record.AgeGrpStart}`);
    }
    if (age === 100 ? span !== -1 : span !== 1) {
      throw new Error(`${packId} 的 ${year} 年 ${age} 岁年龄跨度不合法：${record.AgeGrpSpan}`);
    }

    const value = Number(record.qx);
    if (!Number.isFinite(value) || value < 0 || value > 1) {
      throw new Error(`${packId} 的 ${year} 年 ${age} 岁 qx 不在 [0, 1]：${record.qx}`);
    }
    if (age === 100 && value !== 1) {
      throw new Error(`${packId} 的 ${year} 年 100 岁 qx 必须为 1，实际 ${record.qx}`);
    }

    let ages = byYear.get(year);
    if (!ages) {
      ages = new Map();
      byYear.set(year, ages);
    }
    if (ages.has(age)) throw new Error(`${packId} 的 ${year} 年 ${age} 岁有重复行`);
    ages.set(age, value);
  }

  for (let year = FIRST_YEAR; year <= LAST_YEAR; year += 1) {
    const ages = byYear.get(year);
    if (!ages) throw new Error(`${packId} 缺少 ${year} 年`);
    for (let age = 0; age <= 100; age += 1) {
      if (!ages.has(age)) throw new Error(`${packId} 的 ${year} 年缺少 ${age} 岁`);
    }
    if (ages.size !== 101) {
      throw new Error(`${packId} 的 ${year} 年有 ${ages.size} 个年龄，应为 101`);
    }
  }

  const points = [];
  for (let year = FIRST_YEAR; year <= LAST_YEAR; year += 1) {
    const ages = byYear.get(year);
    if (!ages) throw new Error(`${packId} 缺少 ${year} 年`);
    for (let age = 0; age <= 100; age += 1) {
      const value = ages.get(age);
      if (value === undefined) throw new Error(`${packId} 的 ${year} 年缺少 ${age} 岁`);
      points.push({ year, age, value, projected: year >= PROJECTED_FROM });
    }
  }

  return StatSeriesSchema.parse({
    id: `wpp2024/${packId}/qx${spec.suffix}`,
    indicator: 'life-table-qx',
    geographyId: `country:${packId}`,
    unit: 'probability',
    ageBasis: 'single-year',
    sex,
    evidence: {
      grade: 'B',
      sourceIds: ['un-wpp:2024'],
      modelVersion: 'wpp2024-medium',
      geographyId: `country:${packId}`,
      yearRange: [FIRST_YEAR, LAST_YEAR],
      methodId: spec.methodId,
    },
    points,
  });
}

/**
 * 流式读取 gz CSV，只保留表头与五个地区的行，避免把 1 GB 以上的文本全部放进内存。
 * @param {string} path
 * @returns {Promise<Record<string, string>[]>}
 */
async function readFilteredRecords(path) {
  const locIds = Object.values(REGIONS).map((region) => region.locId);
  const pattern = new RegExp(`^[^,]*,(${locIds.join('|')}),`);
  const lines = [];
  const input = createReadStream(path).pipe(createGunzip());
  const reader = createInterface({ input, crlfDelay: Infinity });
  for await (const rawLine of reader) {
    const line = rawLine.replace(/^\uFEFF/, '');
    if (line.startsWith('SortOrder') || pattern.test(line)) lines.push(line);
  }
  return readCsvRecords(lines.join('\n'));
}

/** @type {Record<QxSex, [string, string]>} */
const SEX_TABLE_IDS = {
  both: ['life-table-both-1950-2023', 'life-table-both-2024-2100'],
  female: ['life-table-female-1950-2023', 'life-table-female-2024-2100'],
  male: ['life-table-male-1950-2023', 'life-table-male-2024-2100'],
};

/**
 * @param {{ id: string, sha256: string }[]} inputs
 * @param {string} id
 * @param {string} path
 * @returns {void}
 */
function verifyInput(inputs, id, path) {
  const entry = inputs.find((candidate) => candidate.id === id);
  if (!entry) throw new Error(`inputs.json 缺少 ${id}`);
  const actualHash = sha256File(path);
  if (actualHash !== entry.sha256) {
    throw new Error(`${id} 的 SHA-256 不符：期望 ${entry.sha256}，实际 ${actualHash}`);
  }
}

/**
 * 逐个性别处理：读该性别的两个文件、转换五地、写数据文件。
 * @param {Record<QxSex, { estimates?: string | undefined, projections?: string | undefined }>} sexInputs
 * @returns {Promise<void>}
 */
async function run(sexInputs) {
  const inputs = /** @type {{ id: string, sha256: string }[]} */ (
    JSON.parse(readFileSync(inputsPath, 'utf8'))
  );
  let processed = 0;
  for (const [
    sex,
    files,
  ] of /** @type {[QxSex, { estimates?: string | undefined, projections?: string | undefined }][]} */ (
    Object.entries(sexInputs)
  )) {
    if (!files.estimates && !files.projections) continue;
    if (!files.estimates || !files.projections) {
      throw new Error(`${sex} 的估算与预测文件必须同时提供`);
    }
    const [estimatesId, projectionsId] = SEX_TABLE_IDS[sex];
    verifyInput(inputs, estimatesId, files.estimates);
    verifyInput(inputs, projectionsId, files.projections);

    const records = [
      ...(await readFilteredRecords(files.estimates)),
      ...(await readFilteredRecords(files.projections)),
    ];
    for (const packId of /** @type {PackId[]} */ (Object.keys(REGIONS))) {
      const series = toQxSeries(records, packId, sex);
      const output = join(
        root,
        `packages/country-packs/data/${packId}/wpp2024-qx${SEX_SPECS[sex].suffix}.json`,
      );
      mkdirSync(dirname(output), { recursive: true });
      writeFileSync(output, `${JSON.stringify(series, null, 2)}\n`);
      const samples = [1950, 2023, 2024]
        .map((year) => {
          const zero = series.points.find((point) => point.year === year && point.age === 0);
          const sixty = series.points.find((point) => point.year === year && point.age === 60);
          return `${year}:q0=${zero?.value ?? 'missing'},q60=${sixty?.value ?? 'missing'}`;
        })
        .join(' ');
      console.log(`${sex} ${packId}: ${series.points.length} 个点；${samples}`);
    }
    processed += 1;
  }
  if (processed === 0) {
    throw new Error('没有提供任何性别的输入文件；见文件头的用法说明');
  }
}

if (import.meta.main) {
  const { values } = parseArgs({
    options: {
      estimates: { type: 'string' },
      projections: { type: 'string' },
      'female-estimates': { type: 'string' },
      'female-projections': { type: 'string' },
      'male-estimates': { type: 'string' },
      'male-projections': { type: 'string' },
    },
  });
  /** @type {Record<QxSex, { estimates?: string | undefined, projections?: string | undefined }>} */
  const sexInputs = {
    both: { estimates: values.estimates, projections: values.projections },
    female: {
      estimates: values['female-estimates'],
      projections: values['female-projections'],
    },
    male: { estimates: values['male-estimates'], projections: values['male-projections'] },
  };
  if (!values.estimates && !values['female-estimates'] && !values['male-estimates']) {
    console.error(
      '用法：node data/scripts/wpp2024/qx.mjs --estimates <1950-2023 文件> --projections <2024-2100 文件>\n' +
        '      可选 --female-estimates/--female-projections、--male-estimates/--male-projections',
    );
    process.exitCode = 1;
  } else {
    await run(sexInputs);
  }
}
