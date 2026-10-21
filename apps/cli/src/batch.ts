// 分层批量模拟与报告的命令行入口（M5-001）。
//
//   pnpm --filter @lifesim/cli batch [选项]
//
// 退出码：0 = 报告生成成功且无违规、无错误；1 = 有违规或错误（报告仍然写出）；
// 2 = 用法或配置错误（非法参数、未知国家、年代非法、读不到 --baseline、写报告失败）。
import { readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { BIRTH_REGION_IDS, type BirthRegionId } from '@lifesim/content-schema';
import type { PausePolicy } from '@lifesim/simulation-core';
import {
  compareReports,
  reportExitCode,
  type BatchReport,
  type ReportConfig,
} from './batch/report.ts';
import { runBatch } from './batch/run.ts';
import { SETTLEMENTS, decades, type Settlement } from './batch/strata.ts';

const USAGE = `用法：pnpm --filter @lifesim/cli batch [选项]

  --lives-per-cell <n>        每层局数，默认 1（80 层 → 80 局；2 → 160 局；125 → 10,000 局）
  --countries <CN,JP,...>     默认五国全部；顺序即层顺序
  --decades <1950,1980>       默认 1950,1960,…,2020；取值必须是 1950—2020 之间 10 的倍数
  --settlements <urban,rural> 默认两者
  --pause-policy <all|major>  默认 all
  --seed-prefix <s>           默认 m5-001
  --max-attempts-per-life <n> 默认 200
  --out <path>                把报告写到文件（省略则把完整 JSON 打到 stdout）
  --baseline <path>           读入旧报告并附上 comparison
  --help                      打印用法，退出 0
`;

const MIN_DECADE = 1950;
const MAX_DECADE = 2020;
const DECADE_STEP = 10;

/** 与 apps/cli/src/world.ts 的 cliArgs 同义：忽略开头的 `--`（`pnpm batch -- --x` 与 `pnpm batch --x` 都可以）。
 *  这里不 import world.ts，避免批量入口牵进合成地区与世界资源的组合根。 */
function batchArguments(): string[] {
  const args = process.argv.slice(2);
  return args[0] === '--' ? args.slice(1) : args;
}

function parseInteger(text: string, name: string, min: number): number {
  if (!/^-?\d+$/.test(text)) throw new Error(`${name} 必须是整数：${text}`);
  const value = Number(text);
  if (!Number.isInteger(value) || value < min) {
    throw new Error(`${name} 必须是不小于 ${min} 的整数：${text}`);
  }
  return value;
}

function splitList(text: string): string[] {
  return text
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function parseCountries(text: string | undefined): BirthRegionId[] {
  if (text === undefined) return [...BIRTH_REGION_IDS];
  const ids = splitList(text);
  if (ids.length === 0) throw new Error('--countries 不能为空');
  const countries: BirthRegionId[] = [];
  for (const id of ids) {
    if (!(BIRTH_REGION_IDS as readonly string[]).includes(id)) {
      throw new Error(`未知国家：${id}（可选 ${BIRTH_REGION_IDS.join('、')}）`);
    }
    if (!countries.includes(id as BirthRegionId)) countries.push(id as BirthRegionId);
  }
  return countries;
}

function parseDecades(text: string | undefined): number[] {
  if (text === undefined) return [...decades()];
  const values = splitList(text).map((item) => parseInteger(item, '--decades', MIN_DECADE));
  if (values.length === 0) throw new Error('--decades 不能为空');
  for (const value of values) {
    if (value < MIN_DECADE || value > MAX_DECADE || value % DECADE_STEP !== 0) {
      throw new Error(`--decades 只接受 ${MIN_DECADE}—${MAX_DECADE} 之间 10 的倍数：${value}`);
    }
  }
  return [...new Set(values)].sort((left, right) => left - right);
}

function parseSettlements(text: string | undefined): Settlement[] {
  if (text === undefined) return [...SETTLEMENTS];
  const wanted = splitList(text);
  if (wanted.length === 0) throw new Error('--settlements 不能为空');
  for (const item of wanted) {
    if (item !== 'urban' && item !== 'rural') {
      throw new Error(`--settlements 只接受 urban 或 rural：${item}`);
    }
  }
  // 固定顺序：urban 先于 rural（层顺序与指纹依赖它）。
  return SETTLEMENTS.filter((settlement) => wanted.includes(settlement));
}

function parsePausePolicy(text: string): PausePolicy {
  if (text !== 'all' && text !== 'major') {
    throw new Error(`--pause-policy 只接受 all 或 major：${text}`);
  }
  return text;
}

function readBaseline(path: string): BatchReport {
  const parsed = JSON.parse(readFileSync(path, 'utf8')) as Partial<BatchReport>;
  if (parsed.report !== 'lifesim-batch-report' || typeof parsed.schemaVersion !== 'number') {
    throw new Error(`--baseline 不是 LifeSim 批量报告：${path}`);
  }
  return parsed as BatchReport;
}

function diagnose(report: BatchReport): void {
  if (report.invariants.violations > 0) {
    process.stderr.write(`invariant violations: ${report.invariants.violations}
`);
  }
  if (report.errors.count > 0) {
    process.stderr.write(`errors: ${report.errors.count}
`);
  }
}

function run(argv: readonly string[]): number {
  const { values } = parseArgs({
    args: [...argv],
    options: {
      'lives-per-cell': { type: 'string', default: '1' },
      countries: { type: 'string' },
      decades: { type: 'string' },
      settlements: { type: 'string' },
      'pause-policy': { type: 'string', default: 'all' },
      'seed-prefix': { type: 'string', default: 'm5-001' },
      'max-attempts-per-life': { type: 'string', default: '200' },
      out: { type: 'string' },
      baseline: { type: 'string' },
      help: { type: 'boolean', default: false },
    },
    allowPositionals: false,
  });

  if (values.help === true) {
    process.stdout.write(USAGE);
    return 0;
  }

  const seedPrefix = values['seed-prefix'] ?? 'm5-001';
  if (seedPrefix.trim().length === 0) throw new Error('--seed-prefix 不能为空');

  const config: ReportConfig = {
    countries: parseCountries(values.countries),
    decades: parseDecades(values.decades),
    settlements: parseSettlements(values.settlements),
    livesPerCell: parseInteger(values['lives-per-cell'] ?? '1', '--lives-per-cell', 1),
    pausePolicy: parsePausePolicy(values['pause-policy'] ?? 'all'),
    seedPrefix,
    maxAttemptsPerLife: parseInteger(
      values['max-attempts-per-life'] ?? '200',
      '--max-attempts-per-life',
      1,
    ),
  };

  const baseline = values.baseline === undefined ? null : readBaseline(values.baseline);
  const report = runBatch(config);
  if (baseline !== null) report.comparison = compareReports(baseline, report);

  const out = values.out;
  if (out !== undefined) {
    writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);
    process.stdout.write(
      `wrote ${out} · ${report.workload.totalLives} lives · evidence ${report.fingerprint.workload}\n`,
    );
  } else {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  }

  diagnose(report);
  return reportExitCode(report);
}

try {
  const code = run(batchArguments());
  if (code !== 0) process.exitCode = code;
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n\n${USAGE}`);
  process.exitCode = 2;
}
