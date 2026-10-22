/**
 * M3-042 验收测试 26—28（规格：docs/tasks/M3-042.md「验收测试 §B」）。
 *
 * 真实五国 × 24 个种子 = 120 局；出生年 1950—2010 轮转，月日由出生选择器从种子抽。
 * 口径与 M5-001 的批量报告一致：可见事实 = 除 finance.settlement 之外的全部事实，
 * 在世年份 = 出生年…死亡年（含两端）。
 */
import { BIRTH_REGION_IDS, type SimEventFact } from '@lifesim/content-schema';
import { yearOf } from '@lifesim/simulation-core';
import { LIFE_EVENT_CATALOG, lifeEventType, summarizeLife } from '@lifesim/systems';
import { describe, expect, it } from 'vitest';
import { createRealLifeSimulation } from './index.ts';

const SEEDS_PER_COUNTRY = 24;

/** 出生地区 ID（与 BIRTH_REGION_IDS 的元素同类型）。 */
type BirthRegionId = (typeof BIRTH_REGION_IDS)[number];

interface LifeRun {
  country: BirthRegionId;
  seed: string;
  birthYear: number;
  deathYear: number;
  facts: readonly SimEventFact[];
  visible: readonly SimEventFact[];
  /** 没有可见事实的在世年份数。 */
  emptyYears: number;
  aliveYears: number;
}

function play(country: BirthRegionId, seed: string, year: number): LifeRun {
  const session = createRealLifeSimulation({ seed, region: country, year });
  const simulation = session.simulation;
  for (let round = 0; round < 20_000; round += 1) {
    const result = simulation.advanceTo({
      targetDate: '2200-01-01',
      stopAtMajorDecision: true,
      maxWorkUnits: 200_000,
    });
    if (result.stopReason === 'major-decision') {
      const pending = result.pendingDecision;
      if (!pending) throw new Error('major-decision without pending');
      simulation.decide(pending.key, pending.recommended.optionId);
      continue;
    }
    if (result.stopReason === 'target-reached' || result.stopReason === 'protagonist-died') break;
    if (result.stopReason === 'work-budget-exhausted') continue;
    throw new Error('unexpected stop reason ' + result.stopReason);
  }
  const facts = simulation.facts;
  const summary = summarizeLife(simulation.snapshot(), facts);
  const birthYear = yearOf(session.birth.birthDate);
  const deathDate = summary.deathDate;
  if (deathDate === null) throw new Error(`${country}/${seed} did not die`);
  const deathYear = yearOf(deathDate);
  const visible = facts.filter((fact) => fact.type !== 'finance.settlement');
  const yearsWithFacts = new Set(visible.map((fact) => yearOf(fact.at)));
  let emptyYears = 0;
  for (let year = birthYear; year <= deathYear; year += 1) {
    if (!yearsWithFacts.has(year)) emptyYears += 1;
  }
  return {
    country,
    seed,
    birthYear,
    deathYear,
    facts,
    visible,
    emptyYears,
    aliveYears: deathYear - birthYear + 1,
  };
}

const RUNS: LifeRun[] = [];
for (const country of BIRTH_REGION_IDS) {
  for (let index = 0; index < SEEDS_PER_COUNTRY; index += 1) {
    RUNS.push(play(country, `m3-042-${country}-${index}`, 1950 + (index % 61)));
  }
}

function pooled(runs: readonly LifeRun[]): { visiblePerYear: number; emptyYearRatio: number } {
  const visible = runs.reduce((total, run) => total + run.visible.length, 0);
  const years = runs.reduce((total, run) => total + run.aliveYears, 0);
  const empty = runs.reduce((total, run) => total + run.emptyYears, 0);
  return { visiblePerYear: visible / years, emptyYearRatio: empty / years };
}

describe('M3-042 real-world batch', () => {
  it('26. experience: at least 1.5 visible events per year and at most 10% empty years', () => {
    const overall = pooled(RUNS);
    const byCountry = BIRTH_REGION_IDS.map((country) => ({
      country,
      ...pooled(RUNS.filter((run) => run.country === country)),
    }));
    const message = JSON.stringify({ overall, byCountry });

    expect(RUNS.length, message).toBe(BIRTH_REGION_IDS.length * SEEDS_PER_COUNTRY);
    expect(overall.visiblePerYear, message).toBeGreaterThanOrEqual(1.5);
    expect(overall.emptyYearRatio, message).toBeLessThanOrEqual(0.1);
    for (const country of byCountry) {
      expect(country.visiblePerYear, message).toBeGreaterThanOrEqual(1.5);
      expect(country.emptyYearRatio, message).toBeLessThanOrEqual(0.1);
    }
  }, 120_000);

  it('27. volume: every prototype stays under its lifetime cap', () => {
    for (const prototype of LIFE_EVENT_CATALOG) {
      const type = lifeEventType(prototype.id);
      for (const run of RUNS) {
        const hits = run.facts.filter((fact) => fact.type === type).length;
        expect(hits, `${prototype.id} in ${run.country}/${run.seed}`).toBeLessThanOrEqual(
          prototype.lifetimeCap,
        );
      }
    }
    for (const run of RUNS) {
      expect(
        run.facts.filter((fact) => fact.type === 'life.first-playmate').length,
      ).toBeLessThanOrEqual(1);
    }
  }, 120_000);

  it('28. health: every life finishes, and friend contact is reachable', () => {
    for (const run of RUNS) {
      expect(run.facts.length).toBeGreaterThan(0);
      expect(run.aliveYears).toBeGreaterThan(0);
    }
    const withFriends = RUNS.filter((run) =>
      run.facts.some((fact) => fact.type.startsWith('life.friend-contact')),
    );
    expect(withFriends.length).toBeGreaterThan(0);
  }, 120_000);
});
