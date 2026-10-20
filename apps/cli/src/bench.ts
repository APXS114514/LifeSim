// 可复现的性能基准：固定种子与出生日期，跑 N 个完整合成人生，输出 JSON 报告（GDD §14.3）。
//
//   pnpm bench [--lives 1000] [--out bench-report.json]
//
// 计时因机器而异；`workload.fingerprint` 只取决于种子与规则，用来确认两次基准跑的是同一份工作量。
import { writeFileSync } from 'node:fs';
import { cpus, totalmem } from 'node:os';
import { parseArgs } from 'node:util';
import { ENGINE_VERSION, canonicalJson, fingerprint } from '@lifesim/simulation-core';
import { createLifeSimulation, dataPackVersions, summarizeLife } from '@lifesim/systems';
import { cliArgs, region } from './world.ts';

const FOREVER = { targetDate: '2200-01-01', stopAtMajorDecision: false, maxWorkUnits: 1_000_000 };

function birthDateFor(index: number): string {
  const year = 1950 + (index % 77);
  const month = String(1 + (index % 12)).padStart(2, '0');
  return `${year}-${month}-15`;
}

function runLife(seed: string, birthDate: string) {
  const started = performance.now();
  const simulation = createLifeSimulation({ seed, region, birthDate });
  simulation.advanceTo(FOREVER);
  const elapsed = performance.now() - started;
  return { simulation, elapsed };
}

function percentile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, index)] ?? 0;
}

const round = (value: number, digits = 3) => Number(value.toFixed(digits));

const { values } = parseArgs({
  args: cliArgs(),
  options: {
    lives: { type: 'string', default: '1000' },
    out: { type: 'string' },
  },
});
const lives = Number(values.lives);
if (!Number.isInteger(lives) || lives <= 0) throw new Error('--lives must be a positive integer');

// 预热：让 JIT 稳定，不计入结果。
for (let index = 0; index < Math.min(50, lives); index++) {
  runLife(`warmup-${index}`, birthDateFor(index));
}

const durations: number[] = [];
let facts = 0;
let snapshotBytes = 0;
let ageSum = 0;
let workload = '';
const started = performance.now();
for (let index = 0; index < lives; index++) {
  const { simulation, elapsed } = runLife(`bench-${index}`, birthDateFor(index));
  durations.push(elapsed);
  facts += simulation.facts.length;
  const snapshot = simulation.snapshot();
  snapshotBytes += JSON.stringify(snapshot).length;
  ageSum += summarizeLife(snapshot, simulation.facts).ageAtDeath ?? 0;
  workload = fingerprint(workload + fingerprint(canonicalJson(simulation.facts)));
}
const totalMs = performance.now() - started;
const sorted = [...durations].sort((a, b) => a - b);
const cpu = cpus()[0];

const report = {
  benchmark: 'lifesim-m1-synthetic-life',
  command: `pnpm bench --lives ${lives}`,
  engineVersion: ENGINE_VERSION,
  dataPackVersions: dataPackVersions(region),
  seeds: `bench-0 … bench-${lives - 1}`,
  machine: {
    node: process.version,
    platform: process.platform,
    arch: process.arch,
    cpu: cpu?.model ?? 'unknown',
    cpuCount: cpus().length,
    memoryGiB: round(totalmem() / 1024 ** 3, 1),
  },
  timing: {
    totalMs: round(totalMs, 1),
    perLifeMs: {
      p50: round(percentile(sorted, 50)),
      p95: round(percentile(sorted, 95)),
      p99: round(percentile(sorted, 99)),
      max: round(sorted.at(-1) ?? 0),
    },
    livesPerSecond: round((lives / totalMs) * 1000, 1),
    factsPerSecond: round((facts / totalMs) * 1000, 0),
  },
  workload: {
    lives,
    facts,
    meanFactsPerLife: round(facts / lives, 1),
    meanSnapshotBytes: Math.round(snapshotBytes / lives),
    meanAgeAtDeath: round(ageSum / lives, 1),
    fingerprint: workload,
  },
  budget: {
    reference: 'GDD §14.3：无逐帧展示的 80 年模拟，桌面 ≤ 5000 ms（建议目标，非已测承诺）',
    worstLifeMs: round(sorted.at(-1) ?? 0),
    withinDesktopBudget: (sorted.at(-1) ?? 0) <= 5000,
  },
};

const json = `${JSON.stringify(report, null, 2)}\n`;
if (values.out) writeFileSync(values.out, json);
process.stdout.write(json);
