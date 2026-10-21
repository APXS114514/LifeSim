// 批量报告的聚合、指纹、退出码与基线比较（M5-001）。纯函数：不读文件、不读时钟、不读机器。
//
// 报告形状见 docs/QA_BATCH_REPORT.md。所有浮点用 round(v, 4)，毫秒用 round(v, 2)，
// 字节与计数保持整数；报告里不放时间戳、绝对路径与主机名，好让两次运行的 diff 干净。
import type { BirthRegionId } from '@lifesim/content-schema';
import { canonicalJson, fingerprint, type PausePolicy } from '@lifesim/simulation-core';
import { median, percentile, round } from '../percentile.ts';
import type { LifeMetrics } from './measure.ts';
import type { Settlement } from './strata.ts';

export const REPORT_KIND = 'lifesim-batch-report';
export const REPORT_SCHEMA_VERSION = 1;

/** 报告里逐局保留的最小信息：计时 + 指标。事实与快照本身不写进报告。 */
export interface LifeRecord {
  perLifeMs: number;
  metrics: LifeMetrics;
  /** `fingerprint(canonicalJson(facts))`；workload 指纹把它按层与局序号串起来。 */
  factFingerprint: string;
}

/** 一个层的运行结果。`lives` 只含跑完的局；`acceptedFingerprints` 含全部被接受的局（含失败的）。 */
export interface LayerRun {
  country: BirthRegionId;
  decade: number;
  settlement: Settlement;
  requestedLives: number;
  achievedLives: number;
  completedLives: number;
  unreachableLives: number;
  attempts: number;
  rejectedAttempts: number;
  lives: readonly LifeRecord[];
  acceptedFingerprints: readonly string[];
}

export interface ReportConfig {
  countries: readonly BirthRegionId[];
  decades: readonly number[];
  settlements: readonly Settlement[];
  livesPerCell: number;
  pausePolicy: PausePolicy;
  seedPrefix: string;
  maxAttemptsPerLife: number;
}

export interface VersionInfo {
  engine: string;
  systems: string;
  /** 国家包版本，键升序；不含 `systems`（它单独在 `versions.systems`）。 */
  dataPacks: Record<string, string>;
}

export interface MachineInfo {
  node: string;
  platform: string;
  arch: string;
  cpu: string;
  cpuCount: number;
  memoryGiB: number;
}

export interface ErrorSample {
  seed: string;
  code: string;
  eventKey: string | null;
  at: string | null;
  message: string;
}

export interface Percentiles {
  p50: number;
  p95: number;
  p99: number;
  max: number;
}

export interface LayerReport {
  country: BirthRegionId;
  decade: number;
  settlement: Settlement;
  requestedLives: number;
  achievedLives: number;
  completedLives: number;
  unreachableLives: number;
  attempts: number;
  rejectedAttempts: number;
}

export interface CountryTiming {
  country: BirthRegionId;
  lives: number;
  p50: number;
  p95: number;
  p99: number;
  max: number;
}

export interface LayerTiming extends CountryTiming {
  decade: number;
  settlement: Settlement;
}

export interface CountByType {
  type: string;
  count: number;
  share: number;
}

export interface TemplateCount {
  templateId: string;
  count: number;
  share: number;
}

export interface HistogramBucket {
  from: number;
  to: number | null;
  count: number;
}

export interface RepetitionStats {
  visibleFacts: number;
  distinctTemplates: number;
  /** 逐局算（该局属于重复模板的可见事实 / 该局可见事实）再取平均。 */
  withinLifeRepeatedShare: number;
  meanDistinctTemplatesPerLife: number;
  topTemplates: readonly TemplateCount[];
}

export interface ExperienceTargets {
  p1: {
    visiblePerYear: number;
    emptyYearRatio: number;
    decisionsMedian: number;
    decisionsZeroShare: number;
  };
  p2: { decisionsMedian: number; decisionsZeroShare: number };
}

export interface ExperienceStats {
  lives: number;
  years: number;
  visibleFacts: number;
  visiblePerYear: { pooled: number; meanOfLifeMeans: number };
  emptyYearRatio: { pooled: number; yearsWithoutVisibleFact: number };
  decisions: {
    pausePolicy: PausePolicy;
    totalMean: number;
    totalMedian: number;
    selectableMean: number;
    selectableMedian: number;
    selectableZeroShare: number;
    decisionFactsMean: number;
  };
  met: {
    p1: {
      visiblePerYear: boolean;
      emptyYearRatio: boolean;
      decisionsMedian: boolean;
      decisionsZeroShare: boolean;
    };
    p2: { decisionsMedian: boolean; decisionsZeroShare: boolean };
  };
}

export interface ExperienceStatsByCountry extends ExperienceStats {
  country: BirthRegionId;
}

export interface RepetitionStatsByCountry extends RepetitionStats {
  country: BirthRegionId;
}

export interface ComparisonMetric {
  metric: string;
  current: number | null;
  baseline: number | null;
  delta: number | null;
  deltaPct: number | null;
}

export interface ComparisonReport {
  baseline: {
    schemaVersion: number;
    command: string;
    fingerprint: { workload: string; metrics: string };
  };
  verdict: 'comparable' | 'incomparable';
  reasons: readonly string[];
  metrics: readonly ComparisonMetric[];
}

export interface BatchReport {
  report: typeof REPORT_KIND;
  schemaVersion: number;
  command: string;
  versions: VersionInfo;
  config: ReportConfig;
  machine: MachineInfo;
  workload: {
    totalLives: number;
    completedLives: number;
    totalSimulationRuns: number;
    rejectedRuns: number;
    totalMs: number;
    livesPerSecond: number;
    layers: readonly LayerReport[];
  };
  timing: {
    perLifeMs: Percentiles;
    byCountry: readonly CountryTiming[];
    byLayer: readonly LayerTiming[];
  };
  invariants: {
    violations: number;
    lives: number;
    byCode: Record<string, number>;
  };
  errors: { count: number; lives: number; samples: readonly ErrorSample[] };
  facts: {
    total: number;
    meanPerLife: number;
    visibleTotal: number;
    meanVisiblePerLife: number;
    byType: readonly CountByType[];
  };
  snapshots: { meanBytes: number; p50Bytes: number; p95Bytes: number; maxBytes: number };
  death: {
    lives: number;
    aliveAtEnd: number;
    meanAgeAtDeath: number;
    p50AgeAtDeath: number;
    histogram: readonly HistogramBucket[];
  };
  repetition: {
    overall: RepetitionStats;
    byCountry: readonly RepetitionStatsByCountry[];
  };
  experience: {
    targets: ExperienceTargets;
    byCountry: readonly ExperienceStatsByCountry[];
    overall: ExperienceStats;
  };
  fingerprint: { workload: string; metrics: string };
  comparison: ComparisonReport | null;
}

/**
 * 三个体验指标的 P1/P2 阈值。来源：docs/V0.1_PLAN.md §2 与 D12。
 * 报告只负责算 `met`，退出码**不受**它影响（阈值形式化归 M5-002）。
 */
export const EXPERIENCE_TARGETS: ExperienceTargets = {
  p1: { visiblePerYear: 1.5, emptyYearRatio: 0.1, decisionsMedian: 5, decisionsZeroShare: 0.1 },
  p2: { decisionsMedian: 8, decisionsZeroShare: 0.1 },
};

/** 比较指标：基线回归比较固定看这几项。计时只在同一台机器上有意义（文档里注明）。 */
export const COMPARED_METRICS: readonly string[] = [
  'facts.meanPerLife',
  'facts.meanVisiblePerLife',
  'experience.overall.visiblePerYear.pooled',
  'experience.overall.emptyYearRatio.pooled',
  'experience.overall.decisions.selectableMedian',
  'experience.overall.decisions.selectableZeroShare',
  'snapshots.meanBytes',
  'repetition.overall.withinLifeRepeatedShare',
  'death.meanAgeAtDeath',
  'timing.perLifeMs.p50',
  'timing.perLifeMs.p95',
];

export interface BuildReportInput {
  config: ReportConfig;
  command: string;
  versions: VersionInfo;
  machine: MachineInfo;
  layers: readonly LayerRun[];
  /** 墙钟毫秒，含拒绝抽样；不计入任何 perLifeMs。 */
  totalMs: number;
  invariants: { violations: number; lives: number; byCode: Record<string, number> };
  errors: { count: number; lives: number; samples: readonly ErrorSample[] };
}

const sortCounts = (counts: Record<string, number>): { type: string; count: number }[] =>
  Object.entries(counts)
    .map(([type, count]) => ({ type, count }))
    .sort((left, right) => right.count - left.count || (left.type < right.type ? -1 : 1));

const sum = (values: readonly number[]): number => values.reduce((total, v) => total + v, 0);

const mean = (values: readonly number[]): number =>
  values.length === 0 ? 0 : sum(values) / values.length;

function percentilesOf(values: readonly number[], digits: number): Percentiles {
  const sorted = [...values].sort((left, right) => left - right);
  return {
    p50: round(percentile(sorted, 50), digits),
    p95: round(percentile(sorted, 95), digits),
    p99: round(percentile(sorted, 99), digits),
    max: round(sorted.at(-1) ?? 0, digits),
  };
}

/** 死亡年龄分桶：`[0,4] [5,9] … [90,94]`，最后一档 `[95, null]`（`to` 含端点）。 */
function deathHistogram(ages: readonly number[]): HistogramBucket[] {
  const buckets: HistogramBucket[] = [];
  for (let from = 0; from < 95; from += 5) buckets.push({ from, to: from + 4, count: 0 });
  buckets.push({ from: 95, to: null, count: 0 });
  for (const age of ages) {
    if (age < 0) continue;
    const index = age >= 95 ? buckets.length - 1 : Math.floor(age / 5);
    const bucket = buckets[index];
    if (bucket) bucket.count += 1;
  }
  return buckets;
}

/** 基准命令串：固定前缀 + config 各项，不含 `--out` / `--baseline` 的路径（避免绝对路径进报告）。 */
export function batchCommand(config: ReportConfig): string {
  return [
    'pnpm --filter @lifesim/cli batch',
    `--lives-per-cell ${config.livesPerCell}`,
    `--countries ${config.countries.join(',')}`,
    `--decades ${config.decades.join(',')}`,
    `--settlements ${config.settlements.join(',')}`,
    `--pause-policy ${config.pausePolicy}`,
    `--seed-prefix ${config.seedPrefix}`,
    `--max-attempts-per-life ${config.maxAttemptsPerLife}`,
  ].join(' ');
}

function repetitionStats(lives: readonly LifeMetrics[]): RepetitionStats {
  const merged: Record<string, number> = {};
  let visibleFacts = 0;
  let repeatedShareTotal = 0;
  let distinctTotal = 0;
  for (const life of lives) {
    visibleFacts += life.visibleFacts;
    let repeated = 0;
    for (const [templateId, count] of Object.entries(life.templateCounts)) {
      merged[templateId] = (merged[templateId] ?? 0) + count;
      if (count >= 2) repeated += count;
    }
    distinctTotal += Object.keys(life.templateCounts).length;
    if (life.visibleFacts > 0) repeatedShareTotal += repeated / life.visibleFacts;
  }
  const topTemplates = Object.entries(merged)
    .sort((left, right) => right[1] - left[1] || (left[0] < right[0] ? -1 : 1))
    .slice(0, 10)
    .map(([templateId, count]) => ({
      templateId,
      count,
      share: visibleFacts === 0 ? 0 : round(count / visibleFacts, 4),
    }));
  return {
    visibleFacts,
    distinctTemplates: Object.keys(merged).length,
    withinLifeRepeatedShare: lives.length === 0 ? 0 : round(repeatedShareTotal / lives.length, 4),
    meanDistinctTemplatesPerLife: lives.length === 0 ? 0 : round(distinctTotal / lives.length, 4),
    topTemplates,
  };
}

function experienceStats(lives: readonly LifeMetrics[], pausePolicy: PausePolicy): ExperienceStats {
  const years = sum(lives.map((life) => life.years));
  const visibleFacts = sum(lives.map((life) => life.visibleFacts));
  const emptyYears = sum(lives.map((life) => life.emptyYears));
  const totals = lives.map((life) => life.decisions.total);
  const selectables = lives.map((life) => life.decisions.selectable);
  const pooledVisiblePerYear = years === 0 ? 0 : visibleFacts / years;
  const pooledEmptyYearRatio = years === 0 ? 0 : emptyYears / years;
  const selectableMedian = median(selectables);
  const selectableZeroShare =
    lives.length === 0 ? 0 : selectables.filter((value) => value === 0).length / lives.length;
  const met = {
    p1: {
      visiblePerYear: pooledVisiblePerYear >= EXPERIENCE_TARGETS.p1.visiblePerYear,
      emptyYearRatio: pooledEmptyYearRatio <= EXPERIENCE_TARGETS.p1.emptyYearRatio,
      decisionsMedian: selectableMedian >= EXPERIENCE_TARGETS.p1.decisionsMedian,
      decisionsZeroShare: selectableZeroShare <= EXPERIENCE_TARGETS.p1.decisionsZeroShare,
    },
    p2: {
      decisionsMedian: selectableMedian >= EXPERIENCE_TARGETS.p2.decisionsMedian,
      decisionsZeroShare: selectableZeroShare <= EXPERIENCE_TARGETS.p2.decisionsZeroShare,
    },
  };
  return {
    lives: lives.length,
    years,
    visibleFacts,
    visiblePerYear: {
      pooled: round(pooledVisiblePerYear, 4),
      meanOfLifeMeans: round(
        mean(lives.map((life) => (life.years === 0 ? 0 : life.visibleFacts / life.years))),
        4,
      ),
    },
    emptyYearRatio: {
      pooled: round(pooledEmptyYearRatio, 4),
      yearsWithoutVisibleFact: emptyYears,
    },
    decisions: {
      pausePolicy,
      totalMean: round(mean(totals), 4),
      totalMedian: round(median(totals), 4),
      selectableMean: round(mean(selectables), 4),
      selectableMedian: round(selectableMedian, 4),
      selectableZeroShare: round(selectableZeroShare, 4),
      decisionFactsMean: round(mean(lives.map((life) => life.decisionFacts)), 4),
    },
    met,
  };
}

/** 报告去掉 `command` / `machine` / `timing` / `comparison` / `fingerprint`
 *  以及 `workload.totalMs` / `workload.livesPerSecond` 之后的投影的指纹。 */
function metricsFingerprint(report: BatchReport): string {
  const {
    command: _command,
    machine: _machine,
    timing: _timing,
    comparison: _comparison,
    fingerprint: _fingerprint,
    ...rest
  } = report;
  const { totalMs: _totalMs, livesPerSecond: _livesPerSecond, ...workload } = report.workload;
  return fingerprint(canonicalJson({ ...rest, workload }));
}

export function buildReport(input: BuildReportInput): BatchReport {
  const lives = input.layers.flatMap((layer) =>
    layer.lives.map((record) => ({ country: layer.country, record })),
  );
  const metrics = lives.map((entry) => entry.record.metrics);
  const perLifeMs = lives.map((entry) => entry.record.perLifeMs);

  const byTypeMerged: Record<string, number> = {};
  for (const life of metrics) {
    for (const [type, count] of Object.entries(life.byType)) {
      byTypeMerged[type] = (byTypeMerged[type] ?? 0) + count;
    }
  }
  const factTotal = sum(Object.values(byTypeMerged));
  const visibleTotal = sum(metrics.map((life) => life.visibleFacts));

  const snapshotBytes = metrics.map((life) => life.snapshotBytes).sort((l, r) => l - r);
  const ages = metrics.flatMap((life) => (life.ageAtDeath === null ? [] : [life.ageAtDeath]));

  const countriesInOrder = [...new Set(input.layers.map((layer) => layer.country))];
  const livesOf = (country: BirthRegionId) =>
    lives.filter((entry) => entry.country === country).map((entry) => entry.record);
  const metricsOf = (country: BirthRegionId) => livesOf(country).map((record) => record.metrics);

  const timingByCountry: CountryTiming[] = countriesInOrder.map((country) => {
    const durations = livesOf(country).map((record) => record.perLifeMs);
    return { country, lives: durations.length, ...percentilesOf(durations, 2) };
  });
  const timingByLayer: LayerTiming[] = input.layers.map((layer) => ({
    country: layer.country,
    decade: layer.decade,
    settlement: layer.settlement,
    lives: layer.lives.length,
    ...percentilesOf(
      layer.lives.map((record) => record.perLifeMs),
      2,
    ),
  }));

  const totalLives = sum(input.layers.map((layer) => layer.achievedLives));
  const completedLives = sum(input.layers.map((layer) => layer.completedLives));
  const totalSimulationRuns = sum(input.layers.map((layer) => layer.attempts));
  const rejectedRuns = sum(input.layers.map((layer) => layer.rejectedAttempts));

  let workloadFingerprint = '';
  for (const layer of input.layers) {
    for (const fact of layer.acceptedFingerprints) {
      workloadFingerprint = fingerprint(workloadFingerprint + fact);
    }
  }

  const report: BatchReport = {
    report: REPORT_KIND,
    schemaVersion: REPORT_SCHEMA_VERSION,
    command: input.command,
    versions: input.versions,
    config: input.config,
    machine: input.machine,
    workload: {
      totalLives,
      completedLives,
      totalSimulationRuns,
      rejectedRuns,
      totalMs: round(input.totalMs, 2),
      livesPerSecond: round(input.totalMs === 0 ? 0 : (totalLives / input.totalMs) * 1000, 2),
      layers: input.layers.map((layer) => ({
        country: layer.country,
        decade: layer.decade,
        settlement: layer.settlement,
        requestedLives: layer.requestedLives,
        achievedLives: layer.achievedLives,
        completedLives: layer.completedLives,
        unreachableLives: layer.unreachableLives,
        attempts: layer.attempts,
        rejectedAttempts: layer.rejectedAttempts,
      })),
    },
    timing: {
      perLifeMs: percentilesOf(perLifeMs, 2),
      byCountry: timingByCountry,
      byLayer: timingByLayer,
    },
    invariants: input.invariants,
    errors: input.errors,
    facts: {
      total: factTotal,
      meanPerLife: round(completedLives === 0 ? 0 : factTotal / completedLives, 4),
      visibleTotal,
      meanVisiblePerLife: round(completedLives === 0 ? 0 : visibleTotal / completedLives, 4),
      byType: sortCounts(byTypeMerged).map((entry) => ({
        ...entry,
        share: factTotal === 0 ? 0 : round(entry.count / factTotal, 4),
      })),
    },
    snapshots: {
      meanBytes: Math.round(mean(snapshotBytes)),
      p50Bytes: Math.round(percentile(snapshotBytes, 50)),
      p95Bytes: Math.round(percentile(snapshotBytes, 95)),
      maxBytes: snapshotBytes.at(-1) ?? 0,
    },
    death: {
      lives: ages.length,
      aliveAtEnd: metrics.filter((life) => life.aliveAtEnd).length,
      meanAgeAtDeath: round(mean(ages), 4),
      p50AgeAtDeath: round(median(ages), 4),
      histogram: deathHistogram(ages),
    },
    repetition: {
      overall: repetitionStats(metrics),
      byCountry: countriesInOrder.map((country) => ({
        country,
        ...repetitionStats(metricsOf(country)),
      })),
    },
    experience: {
      targets: EXPERIENCE_TARGETS,
      byCountry: countriesInOrder.map((country) => ({
        country,
        ...experienceStats(metricsOf(country), input.config.pausePolicy),
      })),
      overall: experienceStats(metrics, input.config.pausePolicy),
    },
    fingerprint: { workload: workloadFingerprint, metrics: '' },
    comparison: null,
  };
  report.fingerprint = {
    workload: workloadFingerprint,
    metrics: metricsFingerprint(report),
  };
  return report;
}

/** 退出码：0 = 无违规无错误；1 = 有违规或错误（报告仍然写出，见 batch.ts）。 */
export function reportExitCode(report: BatchReport): number {
  return report.invariants.violations === 0 && report.errors.count === 0 ? 0 : 1;
}

function readPath(value: unknown, path: string): number | null {
  let cursor: unknown = value;
  for (const key of path.split('.')) {
    if (cursor === null || typeof cursor !== 'object') return null;
    cursor = (cursor as Record<string, unknown>)[key];
  }
  return typeof cursor === 'number' ? cursor : null;
}

const describeValue = (value: unknown): string =>
  Array.isArray(value)
    ? value.join(',')
    : typeof value === 'string'
      ? value
      : JSON.stringify(value);

/** 报告可比性要求 schemaVersion、三个版本号与 config 全部相同。 */
export function compareReports(baseline: BatchReport, current: BatchReport): ComparisonReport {
  const reasons: string[] = [];
  const compare = (path: string, left: unknown, right: unknown): void => {
    if (canonicalJson(left) === canonicalJson(right)) return;
    reasons.push(`${path}: ${describeValue(left)} → ${describeValue(right)}`);
  };

  compare('schemaVersion', baseline.schemaVersion, current.schemaVersion);
  compare('versions.engine', baseline.versions.engine, current.versions.engine);
  compare('versions.systems', baseline.versions.systems, current.versions.systems);
  compare('versions.dataPacks', baseline.versions.dataPacks, current.versions.dataPacks);
  compare('config.countries', baseline.config.countries, current.config.countries);
  compare('config.decades', baseline.config.decades, current.config.decades);
  compare('config.settlements', baseline.config.settlements, current.config.settlements);
  compare('config.livesPerCell', baseline.config.livesPerCell, current.config.livesPerCell);
  compare('config.pausePolicy', baseline.config.pausePolicy, current.config.pausePolicy);
  compare('config.seedPrefix', baseline.config.seedPrefix, current.config.seedPrefix);
  compare(
    'config.maxAttemptsPerLife',
    baseline.config.maxAttemptsPerLife,
    current.config.maxAttemptsPerLife,
  );

  const comparisonMetrics: ComparisonMetric[] = COMPARED_METRICS.map((metric) => {
    const currentValue = readPath(current, metric);
    const baselineValue = readPath(baseline, metric);
    const delta =
      currentValue === null || baselineValue === null
        ? null
        : round(currentValue - baselineValue, 4);
    return {
      metric,
      current: currentValue,
      baseline: baselineValue,
      delta,
      deltaPct:
        delta === null || baselineValue === null || baselineValue === 0
          ? null
          : round((delta / baselineValue) * 100, 2),
    };
  });

  return {
    baseline: {
      schemaVersion: baseline.schemaVersion,
      command: baseline.command,
      fingerprint: { ...baseline.fingerprint },
    },
    verdict: reasons.length === 0 ? 'comparable' : 'incomparable',
    reasons,
    metrics: comparisonMetrics,
  };
}
