import { BIRTH_REGION_IDS } from '@lifesim/content-schema';
import { describe, expect, it } from 'vitest';
import { summarizeLife } from '@lifesim/systems';
import {
  createRealNarrator,
  createRealLifeSimulation,
  createRealRegion,
  realDataRegistry,
} from './index.ts';

function runToDeath(session: ReturnType<typeof createRealLifeSimulation>): void {
  const simulation = session.simulation;
  for (let round = 0; round < 10_000; round += 1) {
    const result = simulation.advanceTo({
      targetDate: '2200-01-01',
      stopAtMajorDecision: false,
      maxWorkUnits: 100_000,
    });
    if (result.stopReason === 'major-decision') {
      const pending = result.pendingDecision;
      if (!pending) throw new Error('major-decision without pending decision');
      simulation.decide(pending.key, pending.recommended.optionId);
      continue;
    }
    if (result.stopReason === 'target-reached' || result.stopReason === 'protagonist-died') return;
    if (result.stopReason === 'work-budget-exhausted') continue;
    throw new Error('unexpected stop reason ' + result.stopReason);
  }
  throw new Error('life did not finish');
}

describe('real-world region adapter', () => {
  it('adapts all five packs with real mortality and D-grade rule tables', () => {
    for (const packId of BIRTH_REGION_IDS) {
      const region = createRealRegion(packId, '1950-01-01');
      expect(region.packId).toBe(packId);
      expect(region.evidence.mortality.grade).toBe('B');
      expect(region.evidence.labor.grade).toBe('D');
      expect(region.mortalityQ(1950, 0)).toBeGreaterThan(0);
      expect(region.mortalityQ(1950, 0)).toBeLessThanOrEqual(1);
      expect(region.mortalityQ(1950, 100)).toBe(1);
      expect(region.urbanBirthShare(2000)).toBeGreaterThan(0);
      expect(region.urbanBirthShare(2000)).toBeLessThanOrEqual(1);
      expect(
        region.annualWageMinor(1950, 'secondary', {
          code: region.initialMacro.currency.code,
          version: 1,
        }),
      ).toBeGreaterThan(0);
    }
  });

  it('matches the WPP qx and WDI urban share values', () => {
    const registry = realDataRegistry();
    const qx = registry.lookup({
      indicator: 'life-table-qx',
      geographyId: 'country:CN',
      year: 1950,
      age: 0,
    });
    expect(qx.status).toBe('found');
    if (qx.status !== 'found') return;
    expect(createRealRegion('CN', '1950-01-01').mortalityQ(1950, 0)).toBe(qx.value);

    const urban = registry.lookup({
      indicator: 'urban-share',
      geographyId: 'country:CN',
      year: 2000,
    });
    expect(urban.status).toBe('found');
    if (urban.status !== 'found') return;
    expect(createRealRegion('CN', '1950-01-01').urbanBirthShare(2000)).toBe(urban.value);
  });

  it('converts the same nominal wage through the currency versions', () => {
    const region = createRealRegion('CN', '1950-01-01');
    const old = region.annualWageMinor(1955, 'secondary', { code: 'CNY', version: 1 });
    const current = region.annualWageMinor(1955, 'secondary', { code: 'CNY', version: 2 });
    expect(old).toBeGreaterThan(current * 1000);
    expect(current).toBeGreaterThan(0);
  });

  it('keeps the place and polity at birth for the USSR/Russia boundary', () => {
    const before = createRealLifeSimulation({
      seed: 'ru-boundary',
      region: 'RU',
      year: 1991,
      birthDate: '1991-12-25',
    });
    const after = createRealLifeSimulation({
      seed: 'ru-boundary',
      region: 'RU',
      year: 1991,
      birthDate: '1991-12-26',
    });
    expect(before.birth.politicalEntityId).toBe('polity:ussr');
    expect(after.birth.politicalEntityId).toBe('polity:ru-russian-federation');
    expect(before.birth.placeId).toBe(after.birth.placeId);
  });
});

describe('real-world complete lives', () => {
  it.each(BIRTH_REGION_IDS)('runs a complete life in %s and renders both languages', (packId) => {
    const session = createRealLifeSimulation({
      seed: 'complete-' + packId,
      region: packId,
      year: 1978,
      birthDate: '1978-05-04',
    });
    runToDeath(session);
    const facts = [...session.simulation.facts];
    expect(facts.some((fact) => fact.type === 'life.death')).toBe(true);
    expect(facts.some((fact) => fact.type === 'life.birth')).toBe(true);
    const summary = summarizeLife(session.simulation.snapshot(), facts);
    expect(summary.ageAtDeath).not.toBeNull();
    expect(summary.factCount).toBeGreaterThan(5);

    const narrator = createRealNarrator(session.pack, session.birth.birthDate);
    for (const fact of facts) {
      expect(narrator.render(fact, 'zh-Hans').length).toBeGreaterThan(0);
      expect(narrator.render(fact, 'en').length).toBeGreaterThan(0);
    }
  });

  it('is deterministic for the same request', () => {
    const request = {
      seed: 'repeat',
      region: 'JP' as const,
      year: 1978 as const,
      birthDate: '1978-05-04',
    };
    const first = createRealLifeSimulation(request);
    const second = createRealLifeSimulation(request);
    runToDeath(first);
    runToDeath(second);
    expect(JSON.stringify(first.simulation.facts)).toBe(JSON.stringify(second.simulation.facts));
  });

  it('handles births in 1950 and 2026 in every region', () => {
    for (const packId of BIRTH_REGION_IDS) {
      for (const year of [1950, 2026]) {
        const birthDate = year + '-06-15';
        const session = createRealLifeSimulation({
          seed: 'edge-' + packId + '-' + year,
          region: packId,
          year,
          birthDate,
        });
        runToDeath(session);
        expect([...session.simulation.facts].some((fact) => fact.type === 'life.death')).toBe(true);
      }
    }
  });
});
