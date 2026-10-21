import { describe, expect, it } from 'vitest';
import { GameSession, parseGameSave } from './session.ts';

const request = {
  seed: 'ui-0',
  region: 'JP' as const,
  year: 1978 as const,
  birthDate: '1978-05-04',
};

describe('GameSession', () => {
  it('advances to a major decision and applies a player choice', () => {
    const session = GameSession.create(request);
    session.advance();
    expect(session.pending?.type).toBe('choice.after-secondary');
    expect(session.pending?.options.map((option) => option.id)).toContain('start-work');
    session.choose('start-work');
    expect(session.facts.some((fact) => String(fact.details?.['option']) === 'start-work')).toBe(
      true,
    );
  });

  it('finishes a complete life and summarizes it', () => {
    const session = GameSession.create(request);
    session.advance();
    session.finish();
    expect(session.isEnded).toBe(true);
    const summary = session.summary;
    expect(summary.ageAtDeath).not.toBeNull();
    expect(summary.factCount).toBeGreaterThan(10);
  });

  it('round-trips through a save without changing the future', () => {
    const original = GameSession.create(request);
    original.advance();
    const saved = parseGameSave(JSON.parse(JSON.stringify(original.serialize())));
    const restored = GameSession.restore(saved);
    expect(restored.facts).toEqual(original.facts);
    expect(restored.pending?.key).toBe(original.pending?.key);

    original.finish();
    restored.finish();
    expect(JSON.stringify(restored.facts)).toBe(JSON.stringify(original.facts));
  });

  it('renders every fact in both UI languages', () => {
    const session = GameSession.create(request);
    session.finish();
    for (const fact of session.facts) {
      expect(session.render(fact, 'zh-Hans').length).toBeGreaterThan(0);
      expect(session.render(fact, 'en').length).toBeGreaterThan(0);
    }
  });
});
