// M5-001 验收测试：分层批量模拟与报告。
//
// 本文件里的假会话、假快照、假事实与假指标都是**测试夹具**（fixture），不是真实数据；
// 真实数据只来自 @lifesim/real-world 的国家包（集成用例）。
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BIRTH_REGION_IDS,
  type BirthRegionId,
  type SimEventFact,
  type SimulationSnapshot,
} from '@lifesim/content-schema';
import { createRealLifeSimulation, type RealLifeSession } from '@lifesim/real-world';
import {
  SimulationError,
  type AdvanceResult,
  type PendingDecision,
} from '@lifesim/simulation-core';
import { PROTAGONIST_ID, type LifeSummary } from '@lifesim/systems';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { median, percentile, round } from './percentile.ts';
import { HIDDEN_FACT_TYPE, measureLife, type LifeMetrics } from './batch/measure.ts';
import {
  EXPERIENCE_TARGETS,
  buildReport,
  compareReports,
  reportExitCode,
  type BatchReport,
  type LayerRun,
  type LifeRecord,
  type ReportConfig,
} from './batch/report.ts';
import { runBatch, type BatchOptions, type SessionLike } from './batch/run.ts';
import {
  decades,
  enumerateCells,
  seedFor,
  yearFor,
  type BatchConfig,
  type Settlement,
  type Stratum,
} from './batch/strata.ts';

const cliDir = fileURLToPath(new URL('..', import.meta.url));

// ---------------------------------------------------------------- 夹具（fixture）

/** 夹具：一个真实国家包的出生上下文与快照，只用来给指标函数提供合法输入。 */
const FIXTURE_SESSION: RealLifeSession = createRealLifeSimulation({
  seed: 'fixture-birth',
  region: 'CN',
  year: 1970,
});
const FIXTURE_SNAPSHOT: SimulationSnapshot = {
  ...FIXTURE_SESSION.simulation.snapshot(),
  at: '1975-12-31',
};

let fixtureSequence = 0;
/** 夹具事实：只填报告需要的字段，用来测口径，不进入任何国家包。 */
function fixtureFact(type: string, at: string, templateId = type): SimEventFact {
  fixtureSequence += 1;
  return {
    id: `fact:fixture-${fixtureSequence}`,
    sequence: fixtureSequence,
    type,
    at,
    actorIds: [PROTAGONIST_ID],
    causeEventIds: [],
    outcomeCode: 'fixture',
    templateId,
    evidenceIds: ['fixture:test'],
    eventVersion: 1,
  };
}

/** 夹具概要：只提供 measureLife 读取的字段，**不是**真实的人生概要。 */
function fixtureSummary(deathDate: string | null, ageAtDeath: number | null): LifeSummary {
  return {
    birthDate: '1970-05-01',
    deathDate,
    ageAtDeath,
    causeOfDeath: deathDate === null ? null : 'fixture',
    settlement: 'urban',
    familyResources: 'middle',
    education: 'secondary',
    yearsEmployed: 0,
    hadChronicIllness: false,
    finalBalanceMinor: 0,
    currency: 'CNY-1',
    decisions: [],
    factCount: 0,
  };
}

/** 夹具指标：给聚合与分桶测试提供最小可用的 LifeMetrics。 */
function fixtureMetrics(overrides: Partial<LifeMetrics> = {}): LifeMetrics {
  return {
    years: 1,
    visibleFacts: 0,
    emptyYears: 1,
    decisions: { total: 0, selectable: 0 },
    decisionFacts: 0,
    snapshotBytes: 0,
    ageAtDeath: null,
    aliveAtEnd: true,
    byType: {},
    templateCounts: {},
    ...overrides,
  };
}

const FIXTURE_CONFIG: ReportConfig = {
  countries: ['CN'],
  decades: [1970],
  settlements: ['urban'],
  livesPerCell: 1,
  pausePolicy: 'all',
  seedPrefix: 'fixture',
  maxAttemptsPerLife: 200,
};

/** 用给定的逐局指标合成一份报告（不经模拟）：用来测聚合、分桶与重复率。 */
function reportFor(
  lifeMetrics: readonly LifeMetrics[],
  overrides: { country?: BirthRegionId; settlement?: Settlement; perLifeMs?: number } = {},
): BatchReport {
  const lives: LifeRecord[] = lifeMetrics.map((metrics) => ({
    perLifeMs: overrides.perLifeMs ?? 1,
    metrics,
    factFingerprint: 'fixture',
  }));
  const layer: LayerRun = {
    country: overrides.country ?? 'CN',
    decade: 1970,
    settlement: overrides.settlement ?? 'urban',
    requestedLives: lives.length,
    achievedLives: lives.length,
    completedLives: lives.length,
    unreachableLives: 0,
    attempts: lives.length,
    rejectedAttempts: 0,
    lives,
    acceptedFingerprints: lives.map(() => 'fixture'),
  };
  return buildReport({
    config: { ...FIXTURE_CONFIG, livesPerCell: Math.max(1, lives.length) },
    command: 'fixture',
    versions: { engine: '0.1.0', systems: '0.5.0', dataPacks: { CN: '0.1.0' } },
    machine: {
      node: 'v24.21.0',
      platform: 'darwin',
      arch: 'arm64',
      cpu: 'fixture',
      cpuCount: 1,
      memoryGiB: 1,
    },
    layers: [layer],
    totalMs: 10,
    invariants: { violations: 0, lives: 0, byCode: {} },
    errors: { count: 0, lives: 0, samples: [] },
  });
}

const BASE_CONFIG: BatchConfig = {
  countries: [...BIRTH_REGION_IDS],
  decades: [...decades()],
  settlements: ['urban', 'rural'],
  livesPerCell: 1,
  seedPrefix: 'm5-001',
  maxAttemptsPerLife: 200,
};

/** 最小批量配置：1 国 × 1 年代 × 2 城乡 × 1 局，避免拖慢 CI。 */
const MINIMAL: BatchOptions = {
  countries: ['CN'],
  decades: [1970],
  settlements: ['urban', 'rural'],
  livesPerCell: 1,
  seedPrefix: 'm5-test',
  maxAttemptsPerLife: 200,
  pausePolicy: 'all',
};

function fixturePending(actorId: string): PendingDecision {
  return {
    key: 'decision:fixture',
    type: 'career.hired',
    at: '1975-01-01',
    actorId,
    options: [
      { id: 'accept', eligible: true, scores: {} },
      { id: 'decline', eligible: true, scores: {} },
    ],
    recommended: { optionId: 'accept', reasons: [] },
  };
}

/** 夹具会话：第一次推进返回给定的待决事项，之后结束。 */
function fakeSession(options: {
  settlement?: Settlement;
  pending?: PendingDecision;
  facts?: readonly SimEventFact[];
}): { session: SessionLike; presetKeys: string[] } {
  const presetKeys: string[] = [];
  let advanced = false;
  const session: SessionLike = {
    birth: { ...FIXTURE_SESSION.birth, settlement: options.settlement ?? 'urban' },
    simulation: {
      advanceTo: (): AdvanceResult => {
        if (!advanced && options.pending !== undefined) {
          advanced = true;
          return {
            reachedDate: FIXTURE_SNAPSHOT.at,
            stopReason: 'major-decision',
            newFacts: [],
            pendingDecision: options.pending,
          };
        }
        return {
          reachedDate: FIXTURE_SNAPSHOT.at,
          stopReason: 'protagonist-died',
          newFacts: [],
          pendingDecision: null,
        };
      },
      preset: (key: string) => {
        presetKeys.push(key);
      },
      facts: options.facts ?? [],
      snapshot: () => FIXTURE_SNAPSHOT,
    },
  };
  return { session, presetKeys };
}

/** 夹具会话：推进时抛指定的 SimulationError，用来验违规与错误的隔离。 */
function throwingSession(code: 'invariant-violation' | 'handler-failed'): SessionLike {
  return {
    birth: { ...FIXTURE_SESSION.birth, settlement: 'urban' },
    simulation: {
      advanceTo: (): AdvanceResult => {
        throw new SimulationError(code, 'fixture failure', { seed: 'fixture' });
      },
      preset: () => undefined,
      facts: [],
      snapshot: () => FIXTURE_SNAPSHOT,
    },
  };
}

function cloneReport(report: BatchReport): BatchReport {
  return JSON.parse(JSON.stringify(report)) as BatchReport;
}

function runBatchCli(args: readonly string[]) {
  return spawnSync(process.execPath, ['src/batch.ts', ...args], {
    cwd: cliDir,
    encoding: 'utf8',
  });
}

let tempDir = '';
beforeAll(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'lifesim-batch-'));
});
afterAll(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------- 1. 层枚举

describe('strata', () => {
  it('enumerates 80 cells in the fixed order', () => {
    const cells = enumerateCells(BASE_CONFIG);
    expect(cells).toHaveLength(80);
    expect(cells.slice(0, 3)).toEqual([
      { country: 'CN', decade: 1950, settlement: 'urban' },
      { country: 'CN', decade: 1950, settlement: 'rural' },
      { country: 'CN', decade: 1960, settlement: 'urban' },
    ]);
    expect(cells[cells.length - 1]).toEqual({ country: 'RU', decade: 2020, settlement: 'rural' });
    expect(cells.filter((cell) => cell.country === 'CN')).toHaveLength(16);
  });

  it('narrows to one cell when country, decade and settlement are all fixed', () => {
    const cells = enumerateCells({
      ...BASE_CONFIG,
      countries: ['CN'],
      decades: [1970],
      settlements: ['rural'],
    });
    expect(cells).toEqual([{ country: 'CN', decade: 1970, settlement: 'rural' }]);
  });

  it('derives birth years inside the decade, wrapping in the 2020s', () => {
    expect(yearFor(1970, 0)).toBe(1970);
    expect(yearFor(1970, 13)).toBe(1973);
    for (let index = 0; index <= 6; index += 1) expect(yearFor(2020, index)).toBe(2020 + index);
    expect(yearFor(2020, 7)).toBe(2020);
  });

  it('derives distinct seeds, with a retry suffix after the first attempt', () => {
    const cell: Stratum = { country: 'CN', decade: 1970, settlement: 'urban' };
    expect(seedFor(cell, 3, 0, 'm5-001')).toBe('m5-001-CN-1970-urban-3');
    expect(seedFor(cell, 3, 2, 'm5-001')).toBe('m5-001-CN-1970-urban-3-r2');
    const seeds = new Set(
      Array.from({ length: 10 }, (_, index) => seedFor(cell, index, 0, 'm5-001')),
    );
    expect(seeds.size).toBe(10);
  });
});

// ---------------------------------------------------------------- 6. 取整与百分位

describe('percentile helpers', () => {
  it('uses the nearest-rank method, matching bench.ts', () => {
    const oneToHundred = Array.from({ length: 100 }, (_, index) => index + 1);
    expect(percentile(oneToHundred, 50)).toBe(50);
    expect(percentile(oneToHundred, 95)).toBe(95);
    expect(percentile(oneToHundred, 99)).toBe(99);
    expect(percentile(oneToHundred, 100)).toBe(100);
    expect(oneToHundred.at(-1)).toBe(100);
    expect(percentile([], 50)).toBe(0);
  });

  it('computes medians and rounds to a fixed number of digits', () => {
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(median([1, 2, 3])).toBe(2);
    expect(median([])).toBe(0);
    expect(round(0.12345, 4)).toBe(0.1235);
  });
});

// ---------------------------------------------------------------- 4/5/7. 单局指标

describe('life metrics', () => {
  it('counts visible facts, life years and empty years', () => {
    const facts = [
      fixtureFact('family.parent', '1970-06-01'),
      fixtureFact(HIDDEN_FACT_TYPE, '1971-12-31'),
      fixtureFact('education.primary-started', '1974-09-01'),
    ];
    const metrics = measureLife({
      facts,
      snapshot: FIXTURE_SNAPSHOT,
      summary: fixtureSummary('1975-02-03', 4),
      birthDate: '1970-05-01',
      decisions: { total: 0, selectable: 0 },
    });
    expect(metrics.years).toBe(6);
    expect(metrics.visibleFacts).toBe(2);
    expect(metrics.emptyYears).toBe(4);
    expect(metrics.emptyYears / metrics.years).toBeCloseTo(4 / 6, 10);
    // 隐藏事实不计入可见事实，但仍计入 byType（facts.byType 是全部事实）。
    expect(metrics.byType[HIDDEN_FACT_TYPE]).toBe(1);
    expect(metrics.byType['family.parent']).toBe(1);
    expect(reportFor([metrics]).experience.overall.emptyYearRatio.pooled).toBeCloseTo(4 / 6, 4);
  });

  it('keeps selectable decisions separate from decision.made facts', () => {
    const facts = [
      fixtureFact('decision.made', '1971-01-01'),
      fixtureFact('decision.made', '1972-01-01'),
    ];
    const metrics = measureLife({
      facts,
      snapshot: FIXTURE_SNAPSHOT,
      summary: fixtureSummary('1975-02-03', 4),
      birthDate: '1970-05-01',
      decisions: { total: 0, selectable: 0 },
    });
    expect(metrics.decisionFacts).toBe(2);
    expect(metrics.decisions.selectable).toBe(0);
    expect(metrics.decisions.total).toBe(0);
  });

  it('measures snapshot bytes exactly', () => {
    const metrics = measureLife({
      facts: [],
      snapshot: FIXTURE_SNAPSHOT,
      summary: fixtureSummary('1975-02-03', 4),
      birthDate: '1970-05-01',
      decisions: { total: 0, selectable: 0 },
    });
    expect(metrics.snapshotBytes).toBe(Buffer.byteLength(JSON.stringify(FIXTURE_SNAPSHOT), 'utf8'));
  });

  it('buckets ages at death into [0,4] … [90,94] and [95,null]', () => {
    const report = reportFor([
      fixtureMetrics({ ageAtDeath: 4, aliveAtEnd: false }),
      fixtureMetrics({ ageAtDeath: 5, aliveAtEnd: false }),
      fixtureMetrics({ ageAtDeath: 94, aliveAtEnd: false }),
      fixtureMetrics({ ageAtDeath: 95, aliveAtEnd: false }),
    ]);
    const counted = report.death.histogram.filter((bucket) => bucket.count > 0);
    expect(counted).toEqual([
      { from: 0, to: 4, count: 1 },
      { from: 5, to: 9, count: 1 },
      { from: 90, to: 94, count: 1 },
      { from: 95, to: null, count: 1 },
    ]);
    expect(report.death.histogram).toHaveLength(20);
  });

  it('computes the within-life repetition share', () => {
    const report = reportFor([
      fixtureMetrics({
        years: 3,
        visibleFacts: 3,
        emptyYears: 0,
        templateCounts: { a: 2, b: 1 },
      }),
    ]);
    expect(report.repetition.overall.withinLifeRepeatedShare).toBeCloseTo(2 / 3, 4);
    expect(report.repetition.overall.distinctTemplates).toBe(2);
  });
});

// ---------------------------------------------------------------- 5. 主角过滤

describe('decision actor scope', () => {
  it('does not count NPC decisions, but still presets them', () => {
    const { session, presetKeys } = fakeSession({ pending: fixturePending('npc:parent') });
    const report = runBatch({ ...MINIMAL, settlements: ['urban'], createSession: () => session });
    expect(report.experience.overall.decisions.totalMean).toBe(0);
    expect(report.experience.overall.decisions.selectableMean).toBe(0);
    expect(report.experience.overall.decisions.selectableZeroShare).toBe(1);
    expect(presetKeys).toEqual(['decision:fixture']);
  });

  it('counts the protagonist decision when it has two eligible options', () => {
    const { session, presetKeys } = fakeSession({ pending: fixturePending(PROTAGONIST_ID) });
    const report = runBatch({ ...MINIMAL, settlements: ['urban'], createSession: () => session });
    expect(report.experience.overall.decisions.totalMean).toBe(1);
    expect(report.experience.overall.decisions.selectableMean).toBe(1);
    expect(report.experience.overall.decisions.selectableMedian).toBe(1);
    expect(presetKeys).toEqual(['decision:fixture']);
  });
});

// ---------------------------------------------------------------- 9. 确定性

/** 报告里与机器、耗时、命令行有关的字段：指纹与逐位比较都不看它们。 */
function deterministicPart(report: BatchReport): unknown {
  const { command: _command, machine: _machine, timing: _timing, ...rest } = report;
  const { totalMs: _totalMs, livesPerSecond: _livesPerSecond, ...workload } = rest.workload;
  return { ...rest, workload };
}

describe('determinism', () => {
  it('produces identical fingerprints for identical parameters', () => {
    const first = runBatch(MINIMAL);
    const second = runBatch(MINIMAL);
    expect(first.fingerprint.workload).toBe(second.fingerprint.workload);
    expect(first.fingerprint.metrics).toBe(second.fingerprint.metrics);
    expect(deterministicPart(first)).toEqual(deterministicPart(second));
  }, 60_000);

  it('changes the workload fingerprint when the parameters change', () => {
    const first = runBatch(MINIMAL);
    const moreLives = runBatch({ ...MINIMAL, livesPerCell: 2 });
    const otherPrefix = runBatch({ ...MINIMAL, seedPrefix: 'm5-test-other' });
    expect(moreLives.fingerprint.workload).not.toBe(first.fingerprint.workload);
    expect(otherPrefix.fingerprint.workload).not.toBe(first.fingerprint.workload);
  }, 60_000);
});

// ---------------------------------------------------------------- 10. 违规与错误

describe('failure isolation', () => {
  it('counts invariant violations, keeps the report and fails the command', () => {
    const out = join(tempDir, 'invariant.json');
    const report = runBatch({
      ...MINIMAL,
      createSession: () => throwingSession('invariant-violation'),
      out,
    });
    expect(report.invariants.violations).toBeGreaterThan(0);
    expect(report.invariants.lives).toBeGreaterThan(0);
    expect(report.invariants.byCode['invariant-violation']).toBe(report.invariants.violations);
    expect(report.errors.count).toBe(0);
    expect(reportExitCode(report)).toBe(1);
    const written = JSON.parse(readFileSync(out, 'utf8')) as BatchReport;
    expect(written.invariants.violations).toBe(report.invariants.violations);
    expect(written.errors.samples).toHaveLength(report.errors.samples.length);
    for (const sample of report.errors.samples)
      expect(sample.message.length).toBeLessThanOrEqual(200);
  });

  it('counts handler failures as errors, not violations', () => {
    const report = runBatch({
      ...MINIMAL,
      createSession: () => throwingSession('handler-failed'),
    });
    expect(report.errors.count).toBeGreaterThan(0);
    expect(report.errors.lives).toBeGreaterThan(0);
    expect(report.invariants.violations).toBe(0);
    expect(report.errors.samples[0]?.code).toBe('handler-failed');
    expect(reportExitCode(report)).toBe(1);
  });

  it('records unreachable cells without failing the command', () => {
    const createSession = (): SessionLike => fakeSession({ settlement: 'urban' }).session;
    const report = runBatch({
      countries: ['CN'],
      decades: [1970],
      settlements: ['rural'],
      livesPerCell: 2,
      seedPrefix: 'm5-unreachable',
      maxAttemptsPerLife: 5,
      pausePolicy: 'all',
      createSession,
    });
    const layer = report.workload.layers[0];
    expect(layer).toBeDefined();
    expect(layer?.unreachableLives).toBe(2);
    expect(layer?.achievedLives).toBe(0);
    expect((layer?.achievedLives ?? 0) + (layer?.unreachableLives ?? 0)).toBe(
      layer?.requestedLives,
    );
    expect(report.errors.count).toBe(0);
    expect(reportExitCode(report)).toBe(0);
  });
});

// ---------------------------------------------------------------- 12. 基线比较

describe('baseline comparison', () => {
  it('compares metrics when only numbers changed', () => {
    const baseline = runBatch(MINIMAL);
    const current = cloneReport(baseline);
    current.facts.meanPerLife += 1;
    const comparison = compareReports(baseline, current);
    expect(comparison.verdict).toBe('comparable');
    expect(comparison.reasons).toEqual([]);
    const metric = comparison.metrics.find((entry) => entry.metric === 'facts.meanPerLife');
    expect(metric?.delta).toBe(1);
    expect(metric?.deltaPct).toBe(round((1 / baseline.facts.meanPerLife) * 100, 2));
  }, 60_000);

  it('refuses to compare when the config or the engine changed', () => {
    const baseline = runBatch(MINIMAL);
    const configChanged = cloneReport(baseline);
    configChanged.config.livesPerCell = 2;
    const first = compareReports(baseline, configChanged);
    expect(first.verdict).toBe('incomparable');
    expect(first.reasons.join(' ')).toContain('config.livesPerCell');

    const engineChanged = cloneReport(baseline);
    engineChanged.versions.engine = '9.9.9';
    const second = compareReports(baseline, engineChanged);
    expect(second.verdict).toBe('incomparable');
    expect(second.reasons.join(' ')).toContain('versions.engine');
  }, 60_000);
});

// ---------------------------------------------------------------- 13. 报告自洽（80 层冒烟）

describe('80-cell smoke run', () => {
  it('keeps every layer and every total self-consistent', () => {
    const report = runBatch({
      countries: [...BIRTH_REGION_IDS],
      decades: [...decades()],
      settlements: ['urban', 'rural'],
      livesPerCell: 1,
      seedPrefix: 'm5-smoke',
      maxAttemptsPerLife: 200,
      pausePolicy: 'all',
    });
    expect(report.workload.layers).toHaveLength(80);
    expect(report.workload.layers.reduce((total, layer) => total + layer.achievedLives, 0)).toBe(
      report.workload.totalLives,
    );
    expect(report.workload.layers.reduce((total, layer) => total + layer.completedLives, 0)).toBe(
      report.workload.completedLives,
    );
    for (const layer of report.workload.layers) {
      expect(layer.requestedLives).toBe(1);
      expect(layer.achievedLives + layer.unreachableLives).toBe(layer.requestedLives);
    }
    for (const timing of report.timing.byLayer) {
      expect(timing.p50).toBeLessThanOrEqual(timing.p95);
      expect(timing.p95).toBeLessThanOrEqual(timing.p99);
      expect(timing.p99).toBeLessThanOrEqual(timing.max);
    }
    expect(report.experience.overall.years).toBe(
      report.experience.byCountry.reduce((total, entry) => total + entry.years, 0),
    );
    expect(report.invariants.violations).toBe(0);
    expect(report.errors.count).toBe(0);
    expect(reportExitCode(report)).toBe(0);
    expect(report.experience.targets).toEqual(EXPERIENCE_TARGETS);
  }, 120_000);
});

// ---------------------------------------------------------------- 14. CLI

describe('batch CLI', () => {
  it('writes a parseable report and prints a one-line summary', () => {
    const out = join(tempDir, 'cli.json');
    const result = runBatchCli([
      '--countries',
      'CN',
      '--decades',
      '1970',
      '--settlements',
      'urban',
      '--lives-per-cell',
      '2',
      '--out',
      out,
    ]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('wrote');
    expect(result.stdout).toContain('lives');
    expect(result.stdout).toContain('evidence');
    const report = JSON.parse(readFileSync(out, 'utf8')) as BatchReport;
    expect(report.report).toBe('lifesim-batch-report');
    expect(report.workload.totalLives).toBe(2);
    expect(report.config.pausePolicy).toBe('all');
  }, 60_000);

  it('prints the whole report when --out is omitted', () => {
    const result = runBatchCli([
      '--countries',
      'CN',
      '--decades',
      '1970',
      '--settlements',
      'urban',
    ]);
    expect(result.status).toBe(0);
    const report = JSON.parse(result.stdout) as BatchReport;
    expect(report.report).toBe('lifesim-batch-report');
    expect(report.workload.totalLives).toBe(1);
  }, 60_000);

  it('exits 2 on usage errors', () => {
    const missingBaseline = join(tempDir, 'does-not-exist.json');
    const cases: readonly string[][] = [
      ['--lives-per-cell', '0'],
      ['--countries', 'XX'],
      ['--decades', '1949'],
      ['--pause-policy', 'foo'],
      ['--baseline', missingBaseline],
    ];
    for (const args of cases) {
      const result = runBatchCli(args);
      expect(result.status, args.join(' ')).toBe(2);
      expect(result.stderr.length, args.join(' ')).toBeGreaterThan(0);
    }
  }, 60_000);

  it('prints usage and exits 0 for --help', () => {
    const result = runBatchCli(['--help']);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('--lives-per-cell');
  }, 30_000);
});
