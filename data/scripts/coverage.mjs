// 生成数据覆盖率矩阵（阶段 2 的「真正的数据缺口」）。
//
//   node data/scripts/coverage.mjs          检查 docs/data/COVERAGE.md 是否与数据同步
//   node data/scripts/coverage.mjs --write  由当前国家包重新生成
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { BIRTH_REGION_IDS } from '../../packages/content-schema/src/index.ts';
import { PACKS, createPackRegistry } from '../../packages/country-packs/src/index.ts';

const root = resolve(import.meta.dirname, '../..');
const outputPath = join(root, 'docs/data/COVERAGE.md');
/** @type {readonly import('../../packages/content-schema/src/index.ts').Indicator[]} */
const INDICATORS = ['births', 'life-table-qx', 'urban-share', 'sex-ratio-at-birth'];
/**
 * 覆盖率表格的性别口径顺序。既有行都取合计（sex: 'both'），合计放在最前，
 * 因此各既有行与 M3-047 之前逐字节相同；分性别序列与出生性别比的行追加在后面。
 * @type {readonly import('../../packages/content-schema/src/index.ts').Sex[]}
 */
const SERIES_SEXES = ['both', 'female', 'male'];

/**
 * @param {readonly number[]} years
 * @returns {string}
 */
function formatYears(years) {
  if (years.length === 0) return '—';
  const sorted = [...years].sort((left, right) => left - right);
  /** @type {string[]} */
  const parts = [];
  let start = sorted[0];
  let end = sorted[0];
  for (let index = 1; index < sorted.length; index += 1) {
    const year = sorted[index];
    if (year === undefined || start === undefined || end === undefined) continue;
    if (year === end + 1) {
      end = year;
    } else {
      parts.push(start === end ? String(start) : start + '—' + end);
      start = year;
      end = year;
    }
  }
  if (start !== undefined && end !== undefined) {
    parts.push(start === end ? String(start) : start + '—' + end);
  }
  return parts.join(', ');
}

/**
 * @param {import('../../packages/content-schema/src/index.ts').StatSeries} series
 * @returns {string}
 */
function projectedYears(series) {
  const years = series.points.filter((point) => point.projected).map((point) => point.year);
  return formatYears([...new Set(years)]);
}

/**
 * @param {import('../../packages/content-schema/src/index.ts').StatSeries} series
 * @returns {string}
 */
function ageRange(series) {
  if (series.ageBasis === 'none') return '—';
  const ages = series.points.map((point) => point.age).filter((age) => age !== null);
  if (ages.length === 0) return '—';
  return Math.min(...ages) + '—' + Math.max(...ages);
}

/**
 * @param {import('../../packages/content-schema/src/index.ts').StatSeries} series
 * @returns {string}
 */
function missingYears(series) {
  return formatYears(
    series.points.filter((point) => point.value === null).map((point) => point.year),
  );
}

/**
 * @param {import('../../packages/country-packs/src/index.ts').CountryPack} pack
 * @param {import('../../packages/data-registry/src/index.ts').DataRegistry} registry
 * @returns {string[]}
 */
function knownGaps(pack, registry) {
  /** @type {string[]} */
  const lines = [];
  for (const indicator of INDICATORS) {
    const series = pack.series.find((candidate) => candidate.indicator === indicator);
    if (!series) continue;
    /** @type {{ from: number, to: number, method: string }[]} */
    const ranges = [];
    /** @type {{ from: number, to: number, method: string } | null} */
    let current = null;
    for (let year = 1950; year <= 2026; year += 1) {
      const query =
        indicator === 'life-table-qx'
          ? { indicator, geographyId: pack.geographyId, year, age: 0 }
          : { indicator, geographyId: pack.geographyId, year };
      const result = registry.lookup(
        /** @type {import('../../packages/data-registry/src/index.ts').LookupQuery} */ (query),
      );
      const method = result.status === 'found' ? result.method : 'missing';
      if (method === 'exact') {
        current = null;
        continue;
      }
      if (current !== null && current.method === method && current.to === year - 1) {
        current.to = year;
      } else {
        current = { from: year, to: year, method };
        ranges.push(current);
      }
    }
    if (ranges.length > 0) {
      const rendered = ranges
        .map((range) => {
          const span = range.from === range.to ? String(range.from) : range.from + '—' + range.to;
          return span + '（' + (range.method === 'missing' ? '无法回退' : range.method) + '）';
        })
        .join('，');
      lines.push('- ' + pack.manifest.packId + ' ' + indicator + '：' + rendered);
    }
  }
  return lines;
}

/**
 * @param {Readonly<Record<import('../../packages/content-schema/src/index.ts').BirthRegionId, import('../../packages/country-packs/src/index.ts').CountryPack>>} packs
 * @returns {string}
 */
export function renderCoverage(packs) {
  const registry = createPackRegistry(packs);
  /** @type {string[]} */
  const lines = [
    '# 数据覆盖率',
    '',
    '> 本文件由 `pnpm data:coverage` 生成，请勿手改。',
    '> 证据等级的含义见 [docs/DATA_POLICY.md](../DATA_POLICY.md)；缺失值不因回退规则而被算作已覆盖。',
    '',
    '| 地区 | 指标 | 序列 ID | 来源 | 等级 | 年份范围 | 预测年份 | 年龄范围 | 缺失点数 | 缺失年份 |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
  ];

  for (const packId of BIRTH_REGION_IDS) {
    const pack = packs[packId];
    if (!pack) continue;
    for (const indicator of INDICATORS) {
      for (const sex of SERIES_SEXES) {
        const series = pack.series.find(
          (candidate) => candidate.indicator === indicator && candidate.sex === sex,
        );
        if (!series) continue;
        const years = series.points.map((point) => point.year);
        const first = Math.min(...years);
        const last = Math.max(...years);
        const missingCount = series.points.filter((point) => point.value === null).length;
        lines.push(
          '| ' +
            [
              packId,
              indicator,
              series.id,
              series.evidence.sourceIds.join(', '),
              series.evidence.grade,
              first + '—' + last,
              projectedYears(series),
              ageRange(series),
              String(missingCount),
              missingYears(series),
            ].join(' | ') +
            ' |',
        );
      }
    }
  }

  lines.push('', '## 已知缺口', '');
  /** @type {string[]} */
  const gaps = [];
  for (const packId of BIRTH_REGION_IDS) {
    const pack = packs[packId];
    if (!pack) continue;
    gaps.push(...knownGaps(pack, registry));
  }
  if (gaps.length === 0) {
    lines.push('（1950—2026 的出生年份都有精确值。）');
  } else {
    lines.push(
      '以下是 1950—2026 出生年份范围内没有精确值的区间，以及实际会走的回退规则（ADR-0005 §4）。',
      '',
      ...gaps,
    );
  }
  lines.push('');
  return lines.join('\n');
}

/** @returns {void} */
function main() {
  const { values } = parseArgs({ options: { write: { type: 'boolean', default: false } } });
  const rendered = renderCoverage(PACKS);
  if (values.write) {
    mkdirSync(dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, rendered);
    console.log('已生成 docs/data/COVERAGE.md。');
    return;
  }
  if (!existsSync(outputPath) || readFileSync(outputPath, 'utf8') !== rendered) {
    console.error('docs/data/COVERAGE.md 与当前数据不同步；请运行 pnpm data:coverage。');
    process.exitCode = 1;
    return;
  }
  console.log('数据覆盖率检查通过：docs/data/COVERAGE.md 已同步。');
}

if (import.meta.main) main();
