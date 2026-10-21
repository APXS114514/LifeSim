import { canonicalJson, type Simulation } from '@lifesim/simulation-core';
import { MacroStateSchema, restoreLifeSimulation } from '@lifesim/systems';
import { describe, expect, it } from 'vitest';
import { createRealLifeSimulation, createRealNarrator, type RealLifeSession } from './index.ts';

function advanceTo(simulation: Simulation, targetDate: string): void {
  for (let round = 0; round < 10_000; round += 1) {
    const result = simulation.advanceTo({
      targetDate,
      stopAtMajorDecision: false,
      maxWorkUnits: 100_000,
    });
    if (result.stopReason === 'work-budget-exhausted') continue;
    return;
  }
  throw new Error('Simulation did not reach ' + targetDate);
}

function ru1978Session(seed = 'polity-1'): RealLifeSession {
  return createRealLifeSimulation({
    seed,
    region: 'RU',
    year: 1980,
    birthDate: '1980-05-04',
  });
}

function protagonist(session: RealLifeSession) {
  const snapshot = session.simulation.snapshot();
  const actor = snapshot.actors.find((candidate) => candidate.id === snapshot.activeCharacterId);
  if (!actor) throw new Error('missing protagonist');
  return { snapshot, actor };
}

describe('polity-change anchors in a real life', () => {
  it('moves political entity and citizenship, but not residence, on 1991-12-26', () => {
    const session = ru1978Session();
    advanceTo(session.simulation, '1992-01-01');
    const { actor } = protagonist(session);
    expect(actor.vitalStatus.kind).toBe('alive');
    expect(actor.politicalEntityId).toBe('polity:ru-russian-federation');
    expect(actor.citizenshipIds).toEqual(['polity:ru-russian-federation']);
    expect(actor.currentResidenceId).toBe(session.birth.placeId);
    expect(actor.birthPlaceId).toBe(session.birth.placeId);

    const anchor = session.simulation.facts.find(
      (fact) => fact.type === 'history.anchor' && fact.outcomeCode === 'polity-change',
    );
    const identity = session.simulation.facts.find(
      (fact) => fact.type === 'identity.polity-change',
    );
    expect(anchor?.at).toBe('1991-12-26');
    expect(anchor?.evidenceIds).toContain('anchor:ru-polity-change-1991');
    expect(anchor?.evidenceIds).toContain('RU/history');
    expect(identity?.at).toBe('1991-12-26');
    expect(identity?.details).toMatchObject({
      from: 'polity:ussr',
      to: 'polity:ru-russian-federation',
    });
    expect(identity?.causeEventIds).toEqual([anchor?.id]);
  });

  it('does not schedule the anchor for someone born after 1991', () => {
    const session = createRealLifeSimulation({
      seed: 'polity-2',
      region: 'RU',
      year: 2000,
      birthDate: '2000-01-01',
    });
    const { actor } = protagonist(session);
    expect(actor.politicalEntityId).toBe('polity:ru-russian-federation');
    advanceTo(session.simulation, '2200-01-01');
    expect(session.simulation.facts.some((fact) => fact.type === 'identity.polity-change')).toBe(
      false,
    );
  });

  it('leaves countries without the anchor unchanged', () => {
    const session = createRealLifeSimulation({
      seed: 'polity-3',
      region: 'JP',
      year: 1978,
      birthDate: '1978-05-04',
    });
    advanceTo(session.simulation, '2200-01-01');
    const { actor } = protagonist(session);
    expect(actor.politicalEntityId).toBe('polity:jp-japan');
    expect(session.simulation.facts.some((fact) => fact.type === 'identity.polity-change')).toBe(
      false,
    );
  });

  it('does not touch accounts or the currency version at the polity anchor', () => {
    const session = ru1978Session('polity-4');
    advanceTo(session.simulation, '1991-12-25');
    const before = session.simulation.snapshot();
    advanceTo(session.simulation, '1992-01-01');
    const after = session.simulation.snapshot();
    expect(after.householdAccounts).toEqual(before.householdAccounts);
    expect(MacroStateSchema.parse(after.world).currency).toEqual(
      MacroStateSchema.parse(before.world).currency,
    );
    expect(
      session.simulation.facts.filter((fact) => fact.type === 'finance.redenominated'),
    ).toEqual([]);
  });

  it('keeps the 1998 redenomination and birth-time currency baseline intact', () => {
    const born1990 = createRealLifeSimulation({
      seed: 'polity-5',
      region: 'RU',
      year: 1990,
      birthDate: '1990-01-01',
    });
    const before = MacroStateSchema.parse(born1990.simulation.snapshot().world);
    expect(before.currency).toEqual({ code: 'RUB', version: 2 });
    advanceTo(born1990.simulation, '1999-01-01');
    const after = MacroStateSchema.parse(born1990.simulation.snapshot().world);
    expect(after.currency).toEqual({ code: 'RUB', version: 3 });
    expect(born1990.simulation.facts.some((fact) => fact.type === 'finance.redenominated')).toBe(
      true,
    );

    const born2000 = createRealLifeSimulation({
      seed: 'polity-6',
      region: 'RU',
      year: 2000,
      birthDate: '2000-01-01',
    });
    expect(MacroStateSchema.parse(born2000.simulation.snapshot().world).currency).toEqual({
      code: 'RUB',
      version: 3,
    });
  });

  it('is deterministic and restores from a mid-life snapshot', () => {
    const first = ru1978Session('polity-7');
    advanceTo(first.simulation, '2000-01-01');
    const second = ru1978Session('polity-7');
    advanceTo(second.simulation, '2000-01-01');
    expect(canonicalJson(second.simulation.facts)).toBe(canonicalJson(first.simulation.facts));

    const continuous = ru1978Session('polity-7');
    advanceTo(continuous.simulation, '1990-01-01');
    const priorFacts = [...continuous.simulation.facts];
    const snapshot = continuous.simulation.snapshot();
    const restored = restoreLifeSimulation(snapshot, continuous.region);
    advanceTo(restored, '2000-01-01');
    advanceTo(continuous.simulation, '2000-01-01');
    expect(canonicalJson([...priorFacts, ...restored.facts])).toBe(
      canonicalJson(continuous.simulation.facts),
    );
  });

  it('renders the anchor and the personal consequence in both languages', () => {
    const session = ru1978Session('polity-8');
    advanceTo(session.simulation, '1992-01-01');
    const anchor = session.simulation.facts.find(
      (fact) => fact.type === 'history.anchor' && fact.outcomeCode === 'polity-change',
    );
    const identity = session.simulation.facts.find(
      (fact) => fact.type === 'identity.polity-change',
    );
    if (!anchor || !identity) throw new Error('missing polity facts');
    const narrator = createRealNarrator(session.pack, session.birth.birthDate);

    const zhAnchor = narrator.render(anchor, 'zh-Hans');
    const enAnchor = narrator.render(anchor, 'en');
    const zhIdentity = narrator.render(identity, 'zh-Hans');
    const enIdentity = narrator.render(identity, 'en');
    for (const text of [zhAnchor, enAnchor, zhIdentity, enIdentity]) {
      expect(text).not.toContain('{{');
    }
    expect(zhAnchor).toContain('苏联');
    expect(zhAnchor).toContain('俄罗斯联邦');
    expect(enAnchor).toContain('Soviet Union');
    expect(enAnchor).toContain('Russian Federation');
    expect(zhIdentity).toContain('俄罗斯联邦');
    expect(enIdentity).toContain('Russian Federation');
  });

  it('records the systems version used by the new rules', () => {
    const session = ru1978Session('polity-9');
    expect(session.simulation.snapshot().dataPackVersions['systems']).toBe('0.2.0');
  });
});
