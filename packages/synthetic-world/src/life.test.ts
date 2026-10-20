import {
  CountryPackManifestSchema,
  EvidenceMetaSchema,
  HistoricalAnchorSchema,
  checkJournalInvariants,
  type ISODate,
  type LifePrinciples,
  type SimEventFact,
} from '@lifesim/content-schema';
import {
  SimulationError,
  addYears,
  canonicalJson,
  fingerprint,
  fromDayNumber,
  toDayNumber,
  type Simulation,
} from '@lifesim/simulation-core';
import {
  EVENT,
  afterSecondaryDecisionKey,
  createLifeSimulation,
  restoreLifeSimulation,
  summarizeLife,
  type RegionModel,
} from '@lifesim/systems';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { syntheticManifest, syntheticRegion } from './region.ts';

const FOREVER = { targetDate: '2200-01-01', stopAtMajorDecision: false, maxWorkUnits: 1_000_000 };

const seeds = fc.string({ minLength: 1, maxLength: 10 });
const birthDates = fc
  .integer({ min: toDayNumber('1950-01-01'), max: toDayNumber('2026-12-31') })
  .map(fromDayNumber);

interface LifeOptions {
  principles?: LifePrinciples;
  decisions?: Record<string, string>;
  region?: RegionModel;
}

function startLife(seed: string, birthDate: ISODate, options: LifeOptions = {}): Simulation {
  return createLifeSimulation({
    seed,
    region: options.region ?? syntheticRegion,
    birthDate,
    ...(options.principles ? { principles: options.principles } : {}),
    ...(options.decisions ? { decisions: options.decisions } : {}),
  });
}

function wholeLife(seed: string, birthDate: ISODate, options: LifeOptions = {}) {
  const simulation = startLife(seed, birthDate, options);
  const result = simulation.advanceTo(FOREVER);
  return { simulation, result, facts: simulation.facts, snapshot: simulation.snapshot() };
}

/** 一生的跨事实不变量；返回的每条问题都带种子、事实 ID 与日期，便于复现。 */
function lifeIssues(seed: string, facts: readonly SimEventFact[]): string[] {
  const issues: string[] = [];
  const where = (fact: SimEventFact) => `seed=${seed} ${fact.id} at=${fact.at}`;
  for (const issue of checkJournalInvariants(facts, { complete: true })) {
    issues.push(`seed=${seed} journal ${JSON.stringify(issue)}`);
  }
  const birth = facts[0];
  const death = facts.at(-1);
  if (birth?.type !== 'life.birth') issues.push(`seed=${seed} first fact is not the birth`);
  if (death?.type !== 'life.death') issues.push(`seed=${seed} last fact is not the death`);
  if (!birth || !death) return issues;

  for (const fact of facts) {
    if (fact.at < birth.at) issues.push(`${where(fact)} precedes the birth`);
    if (fact.at > death.at) issues.push(`${where(fact)} follows the death`);
    const currency = fact.details?.['currency'];
    if (typeof currency === 'string') {
      const expected = fact.at < '1970-01-01' ? 'SYN-1' : 'SYN-2';
      if (currency !== expected)
        issues.push(`${where(fact)} uses ${currency}, expected ${expected}`);
    }
  }

  // 年度结算不能漏：一旦开始，每个生日恰好一次，直到去世前的最后一个生日。
  const birthYear = Number(birth.at.slice(0, 4));
  const ageOf = (fact: SimEventFact) => Number(fact.at.slice(0, 4)) - birthYear;
  const settlements = facts.filter((fact) => fact.type === 'finance.settlement');
  settlements.forEach((settlement, index) => {
    if (settlement.at !== addYears(birth.at, ageOf(settlement))) {
      issues.push(`${where(settlement)} is not on a birthday`);
    }
    const previous = settlements[index - 1];
    if (previous && ageOf(settlement) !== ageOf(previous) + 1) {
      issues.push(`${where(settlement)} skips a year after ${previous.at}`);
    }
  });
  const lastSettlement = settlements.at(-1);
  if (lastSettlement) {
    const due = addYears(birth.at, ageOf(lastSettlement) + 1);
    if (due <= death.at)
      issues.push(`seed=${seed} missed the settlement due on ${due} (died ${death.at})`);
  }

  // 死因与疾病一致：死于慢性病时，死亡事实必须以发病事实为因。
  if (death.outcomeCode === 'illness') {
    const onset = facts.find((fact) => fact.type === 'health.illness-onset');
    if (!onset || !death.causeEventIds.includes(onset.id)) {
      issues.push(`${where(death)} is attributed to an illness it does not cite`);
    }
  }
  return issues;
}

describe('synthetic region data', () => {
  it('declares every table and anchor as D-grade evidence with valid metadata', () => {
    for (const evidence of Object.values(syntheticRegion.evidence)) {
      expect(EvidenceMetaSchema.parse(evidence).grade).toBe('D');
    }
    for (const anchor of syntheticRegion.anchors) {
      expect(HistoricalAnchorSchema.parse(anchor).evidence.grade).toBe('D');
    }
    expect(CountryPackManifestSchema.safeParse(syntheticManifest).success).toBe(true);
  });

  it('returns probabilities in [0, 1] and safe integer money for any year and age', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1950, max: 2200 }),
        fc.integer({ min: 0, max: 120 }),
        (year, age) => {
          const r = syntheticRegion;
          const probabilities = [
            r.mortalityQ(year, age),
            r.illnessOnsetP(year, age),
            r.urbanBirthShare(year),
            r.primaryEnrollmentP(year, 'rural'),
            r.secondaryContinuationP(year, { settlement: 'rural', familyResources: 'low' }),
            r.universityAdmissionP(year, age / 120),
            r.hiringP(year, 'none', 'recession'),
            r.jobLossP(year, 'recession'),
          ];
          for (const p of probabilities) {
            expect(p).toBeGreaterThanOrEqual(0);
            expect(p).toBeLessThanOrEqual(1);
          }
          for (const version of [1, 2]) {
            const currency = { code: 'SYN', version };
            expect(Number.isSafeInteger(r.annualWageMinor(year, 'tertiary', currency))).toBe(true);
            expect(Number.isSafeInteger(r.annualLivingCostMinor(year, 'urban', currency))).toBe(
              true,
            );
          }
        },
      ),
    );
    expect(syntheticRegion.mortalityQ(2000, 110)).toBe(1);
  });
});

describe('a whole synthetic life', () => {
  it('always runs from birth to death without breaking any invariant', () => {
    fc.assert(
      fc.property(seeds, birthDates, (seed, birthDate) => {
        const { result, facts } = wholeLife(seed, birthDate);
        expect(result.stopReason).toBe('protagonist-died');
        expect(lifeIssues(seed, facts)).toEqual([]);
      }),
      { numRuns: 150 },
    );
  });

  it('is byte-identical for fast-forward, year-by-year and one-event steps', () => {
    fc.assert(
      fc.property(seeds, birthDates, (seed, birthDate) => {
        const fast = wholeLife(seed, birthDate);

        const yearly = startLife(seed, birthDate);
        for (let year = Number(birthDate.slice(0, 4)) + 1; !yearly.ended; year++) {
          yearly.advanceTo({ ...FOREVER, targetDate: `${year}-01-01` });
        }
        const tiny = startLife(seed, birthDate);
        while (!tiny.ended) tiny.advanceTo({ ...FOREVER, maxWorkUnits: 1 });

        expect(canonicalJson(yearly.facts)).toBe(canonicalJson(fast.facts));
        expect(canonicalJson(tiny.facts)).toBe(canonicalJson(fast.facts));
        expect(canonicalJson(yearly.snapshot())).toBe(canonicalJson(fast.snapshot));
      }),
      { numRuns: 25 },
    );
  });

  it('continues identically after a JSON round-trip of a mid-life snapshot', () => {
    fc.assert(
      fc.property(seeds, birthDates, fc.integer({ min: 1, max: 90 }), (seed, birthDate, years) => {
        const whole = wholeLife(seed, birthDate);
        const first = startLife(seed, birthDate);
        first.advanceTo({ ...FOREVER, targetDate: addYears(birthDate, years) });
        const saved = JSON.parse(JSON.stringify(first.snapshot())) as ReturnType<
          Simulation['snapshot']
        >;
        const resumed = restoreLifeSimulation(saved, syntheticRegion);
        resumed.advanceTo(FOREVER);
        expect(canonicalJson([...first.facts, ...resumed.facts])).toBe(canonicalJson(whole.facts));
      }),
      { numRuns: 25 },
    );
  });

  it('has invariant checks that really catch a skipped settlement', () => {
    const { facts } = wholeLife('golden-1', '1960-03-15');
    const settlements = facts.filter((fact) => fact.type === 'finance.settlement');
    const removed = settlements[3];
    expect(removed).toBeDefined();
    const tampered = facts.filter((fact) => fact !== removed);
    expect(lifeIssues('golden-1', tampered).join('\n')).toContain('skips a year');
    const truncated = facts.filter((fact) => fact !== settlements.at(-1));
    expect(lifeIssues('golden-1', truncated).join('\n')).toContain('missed the settlement');
  });

  it('matches the recorded golden fingerprint (update deliberately when rules change)', () => {
    const { facts } = wholeLife('golden-1', '1960-03-15');
    expect(facts.length).toBe(GOLDEN.factCount);
    expect(fingerprint(canonicalJson(facts))).toBe(GOLDEN.fingerprint);
  });

  it('reports seed, event and date when the region data is broken', () => {
    const broken: RegionModel = { ...syntheticRegion, mortalityQ: () => Number.NaN };
    let error: unknown;
    try {
      wholeLife('broken-data', '1980-01-01', { region: broken });
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(SimulationError);
    expect((error as SimulationError).message).toMatch(
      /\[handler-failed\].*seed=broken-data event=health\.check\|char:protagonist\|age:0 at=1980-01-01/,
    );
  });
});

/** 黄金指纹：规则或数据有意变化时，确认差异合理后更新这里（并在提交说明里写明原因）。 */
const GOLDEN = { factCount: 68, fingerprint: '34074d0f36a15e13bcf05c8e14d11772' };

describe('the major decision after secondary school', () => {
  /** 找一个能读完中学、在 18 岁面临决定的种子。 */
  function graduateSeed(birthDate: ISODate): string {
    for (let index = 0; index < 400; index++) {
      const seed = `graduate-${index}`;
      const simulation = startLife(seed, birthDate);
      const result = simulation.advanceTo({ ...FOREVER, stopAtMajorDecision: true });
      if (result.stopReason === 'major-decision') return seed;
    }
    throw new Error('no seed reached the decision');
  }
  const birthDate = '1975-09-01';
  const seed = graduateSeed(birthDate);
  const key = afterSecondaryDecisionKey();

  it('pauses with both options and an explained recommendation', () => {
    const simulation = startLife(seed, birthDate);
    const result = simulation.advanceTo({ ...FOREVER, stopAtMajorDecision: true });
    expect(result.reachedDate).toBe('1993-09-01');
    expect(result.pendingDecision).toMatchObject({
      key,
      type: EVENT.afterSecondary,
      recommended: { optionId: 'apply-university', reasons: ['knowledge', 'risk'] },
    });
    expect(result.pendingDecision?.options.map((option) => [option.id, option.eligible])).toEqual([
      ['apply-university', true],
      ['start-work', true],
    ]);
  });

  it('follows the player choice, and the choice changes the life', () => {
    const work = startLife(seed, birthDate);
    work.advanceTo({ ...FOREVER, stopAtMajorDecision: true });
    work.decide(key, 'start-work');
    work.advanceTo(FOREVER);
    const decision = work.facts.find((fact) => fact.type === 'decision.made');
    expect(decision?.details).toMatchObject({ option: 'start-work', decidedBy: 'player' });
    const afterDecision = work.facts.filter((fact) => fact.at === '1993-09-01');
    expect(afterDecision.some((fact) => fact.type.startsWith('career.'))).toBe(true);
    expect(work.facts.some((fact) => fact.type === 'education.admitted')).toBe(false);

    const university = startLife(seed, birthDate, { decisions: { [key]: 'apply-university' } });
    university.advanceTo(FOREVER);
    expect(canonicalJson(university.facts)).not.toBe(canonicalJson(work.facts));
  });

  it('gives the same life for interactive play and the same pre-recorded action sequence', () => {
    const interactive = startLife(seed, birthDate);
    interactive.advanceTo({ ...FOREVER, stopAtMajorDecision: true });
    interactive.decide(key, 'start-work');
    while (!interactive.ended) interactive.advanceTo({ ...FOREVER, stopAtMajorDecision: true });

    const scripted = wholeLife(seed, birthDate, { decisions: { [key]: 'start-work' } });
    expect(canonicalJson(interactive.facts)).toBe(canonicalJson(scripted.facts));
  });

  it('lets life principles decide when nobody intervenes', () => {
    const pragmatic: LifePrinciples = {
      family: 0.6,
      wealth: 0.9,
      health: 0.5,
      knowledge: 0.1,
      risk: 0.1,
      stability: 0.9,
    };
    const { facts } = wholeLife(seed, birthDate, { principles: pragmatic });
    const decision = facts.find((fact) => fact.type === 'decision.made');
    expect(decision?.details).toMatchObject({ option: 'start-work', decidedBy: 'principles' });
  });
});

describe('the ordinary treatment decision', () => {
  it('follows life principles: health-minded people treat, wealth-minded people forgo', () => {
    const healthMinded: LifePrinciples = {
      family: 0.5,
      wealth: 0.1,
      health: 1,
      knowledge: 0.5,
      risk: 0.5,
      stability: 0.5,
    };
    const wealthMinded: LifePrinciples = {
      family: 0.5,
      wealth: 1,
      health: 0.1,
      knowledge: 0.5,
      risk: 0.5,
      stability: 0.5,
    };
    let compared = 0;
    for (let index = 0; index < 300 && compared < 3; index++) {
      const seed = `treatment-${index}`;
      const healthLife = wholeLife(seed, '1960-01-01', { principles: healthMinded });
      const choice = healthLife.facts.find(
        (fact) => fact.type === 'decision.made' && fact.details?.['decision'] === EVENT.treatment,
      );
      if (choice?.details?.['option'] !== 'treat') continue; // 没有发病，或治疗不可得/负担不起
      const wealthLife = wholeLife(seed, '1960-01-01', { principles: wealthMinded });
      const wealthChoice = wealthLife.facts.find(
        (fact) => fact.type === 'decision.made' && fact.details?.['decision'] === EVENT.treatment,
      );
      if (wealthChoice) expect(wealthChoice.details?.['option']).toBe('forgo');
      compared++;
    }
    expect(compared).toBeGreaterThan(0);
  });
});

describe('life summary', () => {
  it('summarises a life from its facts and final snapshot', () => {
    const { facts, snapshot } = wholeLife('golden-1', '1960-03-15');
    const summary = summarizeLife(snapshot, facts);
    expect(summary.birthDate).toBe('1960-03-15');
    expect(summary.deathDate).toBe(facts.at(-1)?.at);
    expect(summary.factCount).toBe(facts.length);
    expect(summary.currency).toBe('SYN-2');
  });
});
