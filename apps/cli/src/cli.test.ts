import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { SUPPORTED_LOCALES, type SimEventFact } from '@lifesim/content-schema';
import { checkLocaleParity, flattenMessages } from '@lifesim/narrative';
import { decodeSave, encodeSave } from '@lifesim/save';
import { addYears, canonicalJson, fromDayNumber, toDayNumber } from '@lifesim/simulation-core';
import {
  afterSecondaryDecisionKey,
  createLifeSimulation,
  restoreLifeSimulation,
} from '@lifesim/systems';
import { createRealLifeSimulation, createRealNarrator } from '@lifesim/real-world';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { narrator, region, resources } from './world.ts';

const FOREVER = { targetDate: '2200-01-01', stopAtMajorDecision: false, maxWorkUnits: 1_000_000 };
const cliDir = fileURLToPath(new URL('..', import.meta.url));

function life(seed: string, birthDate: string, decisions?: Record<string, string>) {
  const simulation = createLifeSimulation({
    seed,
    region,
    birthDate,
    ...(decisions ? { decisions } : {}),
  });
  simulation.advanceTo(FOREVER);
  return simulation;
}

function runCli(script: string, args: string[]) {
  const result = spawnSync(process.execPath, [script, ...args], { cwd: cliDir, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`${script} failed:\n${result.stderr}`);
  return result.stdout;
}

describe('bilingual narrative of synthetic lives', () => {
  it('has the same keys and placeholders in zh-Hans and en', () => {
    expect(checkLocaleParity(resources)).toEqual([]);
  });

  it('renders every fact of many lives in both languages without leftovers', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 8 }),
        fc
          .integer({ min: toDayNumber('1950-01-01'), max: toDayNumber('2026-12-31') })
          .map(fromDayNumber),
        fc.boolean(),
        (seed, birthDate, startWork) => {
          const decisions = startWork ? { [afterSecondaryDecisionKey()]: 'start-work' } : undefined;
          for (const fact of life(seed, birthDate, decisions).facts) {
            for (const locale of SUPPORTED_LOCALES) {
              expect(narrator.render(fact, locale)).not.toMatch(/\{\{|undefined|null|NaN/);
            }
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  // 时间预算（M3-035）：200 局完整人生 + 1 局真实国家包人生，是一次集成扫描而不是单元测试。
  // 本机（Apple M5）单独运行约 1.1 s；GitHub ubuntu-latest 与其他测试文件并行时慢 3.5 倍以上，
  // 默认 5 s 没有余量（提交 713409d 的 CI 在 5 s 处超时）。性能退化由 `pnpm bench` 与
  // simulation-core 的增量校验测试把关，这里的预算只防止误报，不代表性能目标。
  it('reaches every template in a fixed, varied sample of lives (no dead or missing templates)', () => {
    const templates = [...flattenMessages(resources.en).keys()]
      .filter((key) => key.startsWith('templates.'))
      .map((key) => key.slice('templates.'.length));
    const seen = new Set<string>();
    for (let index = 0; index < 200; index++) {
      const wealthWeight = (index % 5) / 4; // 从重视健康到重视财富，覆盖治疗与不治疗
      const simulation = createLifeSimulation({
        seed: `coverage-${index}`,
        region,
        birthDate: `${1950 + (index % 77)}-0${1 + (index % 9)}-10`,
        principles: {
          family: 0.5,
          wealth: wealthWeight,
          health: 1 - wealthWeight,
          knowledge: 0.5,
          risk: 0.5,
          stability: 0.5,
        },
        ...(index % 2 ? { decisions: { [afterSecondaryDecisionKey()]: 'start-work' } } : {}),
      });
      simulation.advanceTo(FOREVER);
      for (const fact of simulation.facts) {
        seen.add(fact.templateId);
        for (const locale of SUPPORTED_LOCALES) narrator.render(fact, locale);
      }
    }
    // 政体更替只存在于真实国家包（合成地区没有 polity-change 锚点）：用一局 RU 人生补齐模板覆盖。
    const real = createRealLifeSimulation({
      seed: 'coverage-real-politics',
      region: 'RU',
      year: 1980,
      birthDate: '1980-05-04',
    });
    real.simulation.advanceTo(FOREVER);
    const realNarrator = createRealNarrator(real.pack, real.birth.birthDate);
    for (const fact of real.simulation.facts) {
      seen.add(fact.templateId);
      for (const locale of SUPPORTED_LOCALES) realNarrator.render(fact, locale);
    }
    expect(templates.filter((templateId) => !seen.has(templateId))).toEqual([]);
    expect([...seen].filter((templateId) => !templates.includes(templateId))).toEqual([]);
  }, 20_000);
});

describe('save files', () => {
  it('round-trip a mid-life save and continue exactly like an uninterrupted life', async () => {
    const whole = life('save-test', '1966-11-30');

    const first = createLifeSimulation({ seed: 'save-test', region, birthDate: '1966-11-30' });
    first.advanceTo({ ...FOREVER, targetDate: addYears('1966-11-30', 40) });
    const bytes = await encodeSave(
      { snapshot: first.snapshot(), facts: [...first.facts] },
      { engineVersion: '0.1.0', exportedAt: '2026-10-20T12:00:00Z' },
    );
    const decoded = await decodeSave(bytes);
    if (!decoded.ok) throw new Error(`decode failed: ${decoded.error}`);

    const resumed = restoreLifeSimulation(decoded.payload.snapshot, region);
    resumed.advanceTo(FOREVER);
    const continued: SimEventFact[] = [...decoded.payload.facts, ...resumed.facts];
    expect(canonicalJson(continued)).toBe(canonicalJson(whole.facts));
  });
});

describe('headless CLI', () => {
  it('runs a whole life in English, applying the player choice', () => {
    const output = runCli('src/run-life.ts', [
      '--seed',
      'graduate-1',
      '--birth',
      '1975-09-01',
      '--locale',
      'en',
      '--choose',
      'start-work',
    ]);
    expect(output).toContain('D-grade design assumption');
    expect(output).toContain('Born into');
    expect(output).toContain('Chose start-work (from --choose)');
    expect(output).toMatch(/Died at \d+/);
  });

  it('prints the same facts as an in-process run of the same seed', () => {
    const output = JSON.parse(
      runCli('src/run-life.ts', ['--seed', 'cli-json', '--birth', '1990-02-28', '--json']),
    ) as {
      facts: SimEventFact[];
    };
    expect(canonicalJson(output.facts)).toBe(canonicalJson(life('cli-json', '1990-02-28').facts));
  });

  it('produces a reproducible benchmark workload', () => {
    const run = () =>
      JSON.parse(runCli('src/bench.ts', ['--lives', '20'])) as {
        timing: { perLifeMs: { p50: number } };
        workload: { fingerprint: string; facts: number };
      };
    const a = run();
    const b = run();
    expect(a.timing.perLifeMs.p50).toBeGreaterThan(0);
    expect(a.workload.fingerprint).toBe(b.workload.fingerprint);
    expect(a.workload.facts).toBe(b.workload.facts);
  });
});
describe('NPC narrative (M3-011)', () => {
  it('renders every NPC fact class with relation terms in both languages', () => {
    const seen = new Set<string>();
    const render = (
      list: readonly SimEventFact[],
      provider: {
        render: (fact: SimEventFact, locale: (typeof SUPPORTED_LOCALES)[number]) => string;
      },
    ) => {
      for (const fact of list) {
        if (!fact.templateId.startsWith('npc.')) continue;
        seen.add(fact.templateId);
        for (const locale of SUPPORTED_LOCALES) {
          const text = provider.render(fact, locale);
          expect(text).not.toContain('{{');
          expect(text).not.toMatch(/undefined|null|NaN/);
        }
      }
    };

    for (let index = 0; index < 40; index += 1) {
      const simulation = createLifeSimulation({
        seed: `npc-narrative-${index}`,
        region,
        birthDate: `${1950 + (index % 20)}-${String(1 + (index % 12)).padStart(2, '0')}-15`,
      });
      simulation.advanceTo(FOREVER);
      render(simulation.facts, narrator);
    }

    // 政体更替只在真实国家包里：用一局 RU 人生补齐 npc.polity-change。
    const real = createRealLifeSimulation({
      seed: 'npc-narrative-real',
      region: 'RU',
      year: 1980,
      birthDate: '1980-05-04',
    });
    real.simulation.advanceTo(FOREVER);
    render(real.simulation.facts, createRealNarrator(real.pack, real.birth.birthDate));

    const templates = [...flattenMessages(resources.en).keys()]
      .filter((key) => key.startsWith('templates.npc.'))
      .map((key) => key.slice('templates.'.length));
    expect(templates.length).toBeGreaterThan(0);
    expect(templates.filter((templateId) => !seen.has(templateId))).toEqual([]);
  }, 20_000);
});
describe('protagonist projection (M3-011)', () => {
  /**
   * 主角投影：只取 `actorIds` 全部是主角（或为空）的事实，把（日期、类型、结果、details）
   * 按序拼接后取 SHA-256。基线值是在实现之前、干净工作区上测得的——NPC 的加入不得改变它。
   */
  function projection(options: {
    readonly seedSet: string;
    readonly firstYear: number;
    readonly span: number;
    readonly includeEmptyActorFacts: boolean;
  }): { hash: string; entries: number } {
    const parts: string[] = [];
    for (let index = 0; index < 300; index += 1) {
      const year = options.firstYear + (index % options.span);
      const month = String(1 + (index % 12)).padStart(2, '0');
      const day = String(1 + (index % 28)).padStart(2, '0');
      const simulation = createLifeSimulation({
        seed: `${options.seedSet}-${index}`,
        region,
        birthDate: `${year}-${month}-${day}`,
        ...(index % 3 === 0 ? { decisions: { [afterSecondaryDecisionKey()]: 'start-work' } } : {}),
      });
      simulation.advanceTo(FOREVER);
      for (const fact of simulation.facts) {
        const own = fact.actorIds.length === 1 && fact.actorIds[0] === 'char:protagonist';
        const empty = fact.actorIds.length === 0;
        if (!own && !(options.includeEmptyActorFacts && empty)) continue;
        // M3-043 deliberately adds sex; validate it separately while retaining every legacy field.
        // The original projection hashes and entry counts remain unchanged.
        const details = { ...fact.details };
        if (fact.type === 'life.birth') {
          expect(['female', 'male']).toContain(details['sex']);
          delete details['sex'];
        }
        parts.push([fact.at, fact.type, fact.outcomeCode, canonicalJson(details)].join('|'));
      }
    }
    return {
      hash: createHash('sha256').update(parts.join('\n')).digest('hex'),
      entries: parts.length,
    };
  }

  it('is byte-identical for 300 seeds across the whole birth-year range', () => {
    // 1970 年之后出生：币制改革已在出生之前完成，投影里只有主角事实与宏观锚点事实。
    expect(
      projection({
        seedSet: 'proj-S2',
        firstYear: 1970,
        span: 57,
        includeEmptyActorFacts: true,
      }),
    ).toEqual({
      hash: '767d9d8f6bb58e71a139a6d5d20fbfde98624775789260d6ecebf2e9cdad7b6c',
      entries: 23275,
    });
    // 1950 年起出生：覆盖 1970 年币制改革之前的人生。这里只取主角本人的事实，
    // 因为 actor 为空的事实里会新增「已故 NPC 存款换算」——本任务要求的新事实。
    expect(
      projection({
        seedSet: 'proj-S1',
        firstYear: 1950,
        span: 77,
        includeEmptyActorFacts: false,
      }),
    ).toEqual({
      hash: '917dffbd45d8a0141daee603b1ea7291e56bd168d41dfd031e779bffaa6408fc',
      entries: 21871,
    });
  }, 120_000);
});
