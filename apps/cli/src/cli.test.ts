import { spawnSync } from 'node:child_process';
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
    expect(templates.filter((templateId) => !seen.has(templateId))).toEqual([]);
    expect([...seen].filter((templateId) => !templates.includes(templateId))).toEqual([]);
  });
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
