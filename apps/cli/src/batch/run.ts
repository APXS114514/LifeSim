// 分层批量运行（M5-001）：推进模拟、隔离单局错误、写报告文件、返回报告。
//
// 只读模拟结果：不改规则、数据、内核与契约。给每个决定预设引擎推荐的选项（preset，ADR-0008），
// 与 apps/cli/src/run-real-life.ts 的玩法同类；实测 preset 与 decide 推荐项得到的事实序列相同。
import { writeFileSync } from 'node:fs';
import { cpus, totalmem } from 'node:os';
import type { BirthRegionId } from '@lifesim/content-schema';
import {
  ENGINE_VERSION,
  SimulationError,
  canonicalJson,
  fingerprint,
  type PausePolicy,
  type Simulation,
} from '@lifesim/simulation-core';
import { createRealLifeSimulation, type RealLifeSession } from '@lifesim/real-world';
import { PROTAGONIST_ID, SYSTEMS_VERSION, summarizeLife } from '@lifesim/systems';
import { round } from '../percentile.ts';
import { measureLife } from './measure.ts';
import {
  batchCommand,
  buildReport,
  type BatchReport,
  type ErrorSample,
  type LayerRun,
  type LifeRecord,
  type MachineInfo,
  type ReportConfig,
} from './report.ts';
import { enumerateCells, seedFor, yearFor, type BatchConfig } from './strata.ts';

/** 推进到一个足够远的日期（2026 年出生的人也早已去世）。 */
const TARGET_DATE = '2200-01-01';
const MAX_WORK_UNITS = 200_000;
const MAX_SAMPLES = 10;
const MESSAGE_LIMIT = 200;

/**
 * 运行器只要求这四个成员（结构类型），测试夹具因此不必构造完整的 Simulation。
 * `birth` 用 `RealLifeSession['birth']`：apps/cli 不允许依赖 @lifesim/country-packs
 * （见 scripts/check-boundaries.mjs），索引访问拿到的是同一个 BirthContext。
 */
export interface SessionLike {
  simulation: Pick<Simulation, 'advanceTo' | 'preset' | 'facts' | 'snapshot'>;
  birth: RealLifeSession['birth'];
}

export interface BatchOptions extends BatchConfig {
  pausePolicy: PausePolicy;
  /** 缺省不写文件。 */
  out?: string;
  /** 测试夹具入口：不要从 CLI 参数暴露。 */
  createSession?: (seed: string, country: BirthRegionId, year: number) => SessionLike;
}

interface MutableLayerRun {
  country: BirthRegionId;
  decade: number;
  settlement: LayerRun['settlement'];
  requestedLives: number;
  achievedLives: number;
  completedLives: number;
  unreachableLives: number;
  attempts: number;
  rejectedAttempts: number;
  lives: LifeRecord[];
  acceptedFingerprints: string[];
}

interface Failure {
  code: string;
  message: string;
  eventKey: string | null;
  at: string | null;
}

function defaultCreateSession(seed: string, country: BirthRegionId, year: number): SessionLike {
  return createRealLifeSimulation({ seed, region: country, year });
}

function machineInfo(): MachineInfo {
  const cpu = cpus()[0];
  return {
    node: process.version,
    platform: process.platform,
    arch: process.arch,
    cpu: cpu?.model ?? 'unknown',
    cpuCount: cpus().length,
    memoryGiB: round(totalmem() / 1024 ** 3, 1),
  };
}

function failureOf(error: unknown): Failure {
  if (error instanceof SimulationError) {
    return {
      code: error.code,
      message: error.message.slice(0, MESSAGE_LIMIT),
      eventKey: error.context.eventKey ?? null,
      at: error.context.at ?? null,
    };
  }
  const message = error instanceof Error ? error.message : String(error);
  return { code: 'unknown', message: message.slice(0, MESSAGE_LIMIT), eventKey: null, at: null };
}

export function runBatch(options: BatchOptions): BatchReport {
  const createSession = options.createSession ?? defaultCreateSession;
  const layers: MutableLayerRun[] = [];
  const samples: ErrorSample[] = [];
  const invariantByCode: Record<string, number> = {};
  const dataPacks: Record<string, string> = {};
  let invariantViolations = 0;
  let invariantLives = 0;
  let errorCount = 0;
  let errorLives = 0;

  const recordSample = (seed: string, failure: Failure): void => {
    if (samples.length >= MAX_SAMPLES) return;
    samples.push({ seed, ...failure });
  };

  const startedAt = performance.now();

  for (const cell of enumerateCells(options)) {
    const layer: MutableLayerRun = {
      country: cell.country,
      decade: cell.decade,
      settlement: cell.settlement,
      requestedLives: options.livesPerCell,
      achievedLives: 0,
      completedLives: 0,
      unreachableLives: 0,
      attempts: 0,
      rejectedAttempts: 0,
      lives: [],
      acceptedFingerprints: [],
    };

    for (let lifeIndex = 0; lifeIndex < options.livesPerCell; lifeIndex += 1) {
      const year = yearFor(cell.decade, lifeIndex);
      let session: SessionLike | null = null;
      let acceptedSeed = seedFor(cell, lifeIndex, 0, options.seedPrefix);
      let constructionFailed = false;

      // 确定性拒绝抽样：层内城乡必须命中；命中的局本身仍是该种子的一次完整模拟。
      for (let attempt = 0; attempt <= options.maxAttemptsPerLife; attempt += 1) {
        const attemptSeed = seedFor(cell, lifeIndex, attempt, options.seedPrefix);
        layer.attempts += 1;
        try {
          const candidate = createSession(attemptSeed, cell.country, year);
          if (candidate.birth.settlement === cell.settlement) {
            session = candidate;
            acceptedSeed = attemptSeed;
            break;
          }
          layer.rejectedAttempts += 1;
        } catch (error) {
          // 构造失败（例如该年出生权重缺失）：记一条错误，该层计 1 个失败尝试，继续下一局。
          layer.rejectedAttempts += 1;
          errorCount += 1;
          errorLives += 1;
          recordSample(attemptSeed, failureOf(error));
          constructionFailed = true;
          break;
        }
      }

      // 抽不到目标城乡（或构造失败）：记 unreachable，不算运行错误（数据驱动，不是代码缺陷）。
      // 计入 unreachableLives 是为了让「achievedLives + unreachableLives === requestedLives」恒成立。
      if (constructionFailed || session === null) {
        layer.unreachableLives += 1;
        continue;
      }

      layer.achievedLives += 1;
      const decisions = { total: 0, selectable: 0 };
      const lifeStartedAt = performance.now();
      let failure: Failure | null = null;

      try {
        for (;;) {
          const result = session.simulation.advanceTo({
            targetDate: TARGET_DATE,
            stopAtMajorDecision: true,
            pauseOn: options.pausePolicy,
            maxWorkUnits: MAX_WORK_UNITS,
          });
          const pending = result.pendingDecision;
          if (result.stopReason === 'major-decision' && pending) {
            // 只计主角的决定：M3-017 之后 NPC 也可能有决定。NPC 的待决事项仍要 preset，
            // 否则推进不动，但不进入指标（口径见 docs/QA_BATCH_REPORT.md）。
            if (pending.actorId === PROTAGONIST_ID) {
              decisions.total += 1;
              if (pending.options.filter((option) => option.eligible).length >= 2) {
                decisions.selectable += 1;
              }
            }
            session.simulation.preset(pending.key, pending.recommended.optionId);
            continue;
          }
          if (result.stopReason === 'work-budget-exhausted') {
            throw new Error('work-budget-exhausted');
          }
          break;
        }
      } catch (error) {
        failure = failureOf(error);
      }

      // 计时只覆盖推进；快照与指标统计在计时之外（与 bench.ts 一致）。
      const perLifeMs = performance.now() - lifeStartedAt;
      layer.acceptedFingerprints.push(fingerprint(canonicalJson(session.simulation.facts)));

      if (failure !== null) {
        if (failure.code === 'invariant-violation') {
          invariantViolations += 1;
          invariantLives += 1;
          invariantByCode[failure.code] = (invariantByCode[failure.code] ?? 0) + 1;
        } else {
          errorCount += 1;
          errorLives += 1;
        }
        recordSample(acceptedSeed, failure);
        continue;
      }

      const snapshot = session.simulation.snapshot();
      const facts = session.simulation.facts;
      const summary = summarizeLife(snapshot, facts);
      layer.lives.push({
        perLifeMs,
        metrics: measureLife({
          facts,
          snapshot,
          summary,
          birthDate: session.birth.birthDate,
          decisions,
        }),
        factFingerprint: fingerprint(canonicalJson(facts)),
      });
      layer.completedLives += 1;
      for (const [key, value] of Object.entries(snapshot.dataPackVersions)) {
        if (key !== 'systems') dataPacks[key] = value;
      }
    }

    layers.push(layer);
  }

  const totalMs = performance.now() - startedAt;
  const config: ReportConfig = {
    countries: options.countries,
    decades: options.decades,
    settlements: options.settlements,
    livesPerCell: options.livesPerCell,
    pausePolicy: options.pausePolicy,
    seedPrefix: options.seedPrefix,
    maxAttemptsPerLife: options.maxAttemptsPerLife,
  };
  const sortedDataPacks: Record<string, string> = {};
  for (const key of Object.keys(dataPacks).sort()) {
    const value = dataPacks[key];
    if (value !== undefined) sortedDataPacks[key] = value;
  }

  const report = buildReport({
    config,
    command: batchCommand(config),
    versions: { engine: ENGINE_VERSION, systems: SYSTEMS_VERSION, dataPacks: sortedDataPacks },
    machine: machineInfo(),
    layers,
    totalMs,
    invariants: { violations: invariantViolations, lives: invariantLives, byCode: invariantByCode },
    errors: { count: errorCount, lives: errorLives, samples },
  });

  if (options.out !== undefined) {
    writeFileSync(options.out, `${JSON.stringify(report, null, 2)}\n`);
  }

  return report;
}
