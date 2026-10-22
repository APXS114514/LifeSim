import { canonicalJson } from '@lifesim/simulation-core';
import { describe, expect, it, vi } from 'vitest';
import { GameSession } from './session.ts';
import { loadPreferences, savePreferences, PREFS_KEY } from './prefs.ts';

describe('M3-037B intervention preferences', () => {
  it('uses the six birth principles in the actual automatic recommendation', () => {
    const request = {
      seed: 'ui-0',
      region: 'JP' as const,
      year: 1978 as const,
      birthDate: '1978-05-04',
    };
    const knowledge = { family: 0, wealth: 0, health: 0, knowledge: 1, risk: 0, stability: 0 };
    const earning = GameSession.create({
      ...request,
      principles: { family: 0, wealth: 1, health: 0, knowledge: 0, risk: 0, stability: 0 },
    });
    const studying = GameSession.create({ ...request, principles: knowledge });
    earning.advanceToNextDecision();
    studying.advanceToNextDecision();
    expect(studying.pending?.type).toBe('choice.after-secondary');
    expect(studying.pending?.key).toBe(earning.pending?.key);
    expect(earning.pending?.recommended.optionId).toBe('start-work');
    expect(studying.pending?.recommended.optionId).toBe('apply-university');
    const restored = GameSession.restore(studying.serialize());
    expect(
      restored.simulation.state.actors.find((actor) => actor.tier === 'protagonist')
        ?.lifePrinciples,
    ).toEqual(knowledge);
  });
  it('round-trips both pause policies and tolerates an invalid optional value without touching a save', () => {
    const values = new Map<string, string>();
    const store = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => {
        expect(key).toBe(PREFS_KEY);
        values.set(key, value);
      },
      removeItem: (key: string) => {
        throw new Error('Unexpected removal: ' + key);
      },
    };
    for (const pauseOn of ['major', 'all'] as const) {
      expect(savePreferences({ ...loadPreferences(store), pauseOn }, store)).toBe(true);
      expect(loadPreferences(store).pauseOn).toBe(pauseOn);
    }
    values.set(
      PREFS_KEY,
      JSON.stringify({ ...loadPreferences(store), pauseOn: 'fixture-invalid' }),
    );
    expect(loadPreferences(store).pauseOn ?? 'major').toBe('major');
  });

  it('pauses at an ordinary decision on its date and stores only the eventual choice', () => {
    const session = GameSession.create({
      seed: 'fixture-intervention',
      region: 'JP',
      year: 1978,
      birthDate: '1978-05-04',
    });
    // Fictional health fixture guarantees an ordinary birth-day decision without waiting decades.
    vi.spyOn(session.region, 'illnessOnsetP').mockReturnValue(1);
    vi.spyOn(session.region, 'mortalityQ').mockReturnValue(0);
    const before = canonicalJson(session.serialize());
    session.setPausePolicy('all');
    expect(canonicalJson(session.serialize())).toBe(before);
    session.settleBirthDay();
    expect(session.pending?.type).toBe('choice.treatment');
    expect(session.pending?.at).toBe(session.clock);
    session.choose('forgo');
    expect(session.pending).toBeNull();
    expect(
      session.facts.find(
        (fact) =>
          fact.type === 'decision.made' && fact.details?.['decision'] === 'choice.treatment',
      )?.details,
    ).toMatchObject({
      option: 'forgo',
      decidedBy: 'player',
    });
    expect(JSON.stringify(session.serialize())).not.toContain('pauseOn');
  });

  it('finishes identically in both modes, including an already pending ordinary choice', () => {
    const make = (pauseOn: 'major' | 'all') => {
      const session = GameSession.create({
        seed: 'fixture-intervention-finish',
        region: 'JP',
        year: 1978,
        birthDate: '1978-05-04',
      });
      vi.spyOn(session.region, 'illnessOnsetP').mockReturnValue(1);
      vi.spyOn(session.region, 'mortalityQ').mockImplementation((_year, age) =>
        age >= 60 ? 1 : 0,
      );
      session.setPausePolicy(pauseOn);
      session.settleBirthDay();
      session.finish();
      return session;
    };
    const a = make('major');
    const b = make('all');
    expect(b.isEnded).toBe(true);
    expect(canonicalJson(b.facts)).toBe(canonicalJson(a.facts));
    expect(canonicalJson(b.serialize())).toBe(canonicalJson(a.serialize()));
  });
});
