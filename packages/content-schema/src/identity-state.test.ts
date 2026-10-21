import { describe, expect, it } from 'vitest';
import { CharacterStateSchema } from './character-state.ts';

/** 虚构契约夹具，不对应任何真实人物。 */
const fixture = {
  id: 'char:fixture',
  tier: 'protagonist',
  birthDate: '1970-06-15',
  birthPlaceId: 'place:fixture',
  currentResidenceId: 'place:fixture',
  politicalEntityId: 'polity:fixture',
  citizenshipIds: ['polity:fixture'],
  vitalStatus: { kind: 'alive' },
  lifePrinciples: {
    family: 0.5,
    wealth: 0.5,
    health: 0.5,
    knowledge: 0.5,
    risk: 0.5,
    stability: 0.5,
  },
  origin: { settlement: 'urban', familyResources: 'middle' },
  traits: { aptitude: 0.5 },
  education: { completed: 'none', enrolledIn: null, lastFactId: null },
  employment: { status: 'child', wageLevel: null, lastFactId: null },
  health: { conditions: [] },
  finance: { accountId: null, lastSettlementFactId: null },
  sex: 'female',
  name: { scheme: 'zh', family: null, given: null, patronymic: null },
  wellbeing: { stress: 0.3 },
  social: { ties: 0.5 },
  skills: [],
};

describe('identity and fine state (ADR-0010)', () => {
  it('requires identity and all fine-state fields, preserving explicit name gaps', () => {
    expect(CharacterStateSchema.safeParse(fixture).success).toBe(true);
    for (const field of ['sex', 'name', 'wellbeing', 'social', 'skills']) {
      const missing = { ...fixture } as Record<string, unknown>;
      delete missing[field];
      expect(CharacterStateSchema.safeParse(missing).success).toBe(false);
    }
  });

  it('bounds stress, ties and skill levels and rejects invalid or duplicate skills', () => {
    for (const value of [-0.1, 1.1, NaN]) {
      expect(
        CharacterStateSchema.safeParse({ ...fixture, wellbeing: { stress: value } }).success,
      ).toBe(false);
      expect(CharacterStateSchema.safeParse({ ...fixture, social: { ties: value } }).success).toBe(
        false,
      );
    }
    const skill = { id: 'skill:craft', level: 0.5, since: '1980-01-01' };
    expect(CharacterStateSchema.safeParse({ ...fixture, skills: [skill] }).success).toBe(true);
    expect(CharacterStateSchema.safeParse({ ...fixture, skills: [skill, skill] }).success).toBe(
      false,
    );
    expect(
      CharacterStateSchema.safeParse({ ...fixture, skills: [{ ...skill, since: '1960-01-01' }] })
        .success,
    ).toBe(false);
    expect(
      CharacterStateSchema.safeParse({ ...fixture, skills: [{ ...skill, id: 'free text' }] })
        .success,
    ).toBe(false);
    expect(
      CharacterStateSchema.safeParse({
        ...fixture,
        skills: Array.from({ length: 13 }, (_, i) => ({ ...skill, id: `skill:fixture-${i}` })),
      }).success,
    ).toBe(false);
  });
});
