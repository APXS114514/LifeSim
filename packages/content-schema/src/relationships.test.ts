import { describe, expect, it } from 'vitest';
import {
  RELATIONSHIP_KINDS,
  RelationshipSchema,
  RelationshipsSchema,
  type Relationship,
} from './relationships.ts';
import { SimulationSnapshotSchema } from './snapshot.ts';

/** 测试夹具：虚构人物与关系，不是真实数据。 */
const A = 'char:a';
const B = 'char:b';
const C = 'char:c';

function bonds(from: string, to: string) {
  return {
    [from]: { trust: 0.7, intimacy: 0.6, conflict: 0.1 },
    [to]: { trust: 0.6, intimacy: 0.5, conflict: 0.2 },
  };
}

function relation(overrides: Partial<Relationship> = {}): Relationship {
  const merged = {
    id: 'rel:1',
    kind: 'parent-child' as const,
    fromId: A,
    toId: B,
    since: '1970-01-01',
    until: null,
    biological: true,
    legal: true,
    coResident: true,
    ...overrides,
  };
  return { ...merged, bonds: overrides.bonds ?? bonds(merged.fromId, merged.toId) };
}

function issuePaths(
  schema: typeof RelationshipSchema | typeof RelationshipsSchema,
  value: unknown,
) {
  const result = schema.safeParse(value);
  if (result.success) throw new Error('expected a rejection');
  return result.error.issues.map((issue) => issue.path);
}

describe('RelationshipSchema', () => {
  it('accepts a valid parent-child relationship', () => {
    expect(RelationshipSchema.safeParse(relation()).success).toBe(true);
    expect(RELATIONSHIP_KINDS).toContain('spouse');
  });

  it('rejects the six single-relationship rule violations', () => {
    expect(issuePaths(RelationshipSchema, relation({ toId: A }))).toContainEqual(['toId']);
    expect(issuePaths(RelationshipSchema, relation({ until: '1960-01-01' }))).toContainEqual([
      'until',
    ]);
    expect(
      issuePaths(RelationshipSchema, {
        ...relation(),
        bonds: { ...bonds(A, B), [C]: { trust: 0.5, intimacy: 0.5, conflict: 0 } },
      }),
    ).toContainEqual(['bonds']);
    const missingDirection = bonds(A, B);
    delete (missingDirection as Record<string, unknown>)[B];
    expect(
      issuePaths(RelationshipSchema, { ...relation(), bonds: missingDirection }),
    ).toContainEqual(['bonds']);
    expect(
      issuePaths(
        RelationshipSchema,
        relation({ kind: 'spouse', biological: true, bonds: bonds(A, B) }),
      ),
    ).toContainEqual(['kind']);
    expect(
      issuePaths(
        RelationshipSchema,
        relation({ kind: 'former-spouse', until: null, biological: false, bonds: bonds(A, B) }),
      ),
    ).toContainEqual(['kind']);
  });

  it('rejects unknown fields such as gender', () => {
    expect(RelationshipSchema.safeParse({ ...relation(), gender: 'x' }).success).toBe(false);
  });
});

describe('RelationshipsSchema', () => {
  it('accepts a blended family and two marriages', () => {
    const divorced = relation({
      id: 'rel:divorce',
      kind: 'former-spouse',
      biological: false,
      until: '1990-01-01',
    });
    const remarried = relation({ id: 'rel:marriage', kind: 'spouse', biological: false });
    const child = relation({ id: 'rel:child', toId: C });
    const adoptive = relation({
      id: 'rel:adoptive',
      kind: 'adoptive-parent-child',
      toId: C,
      biological: false,
    });
    const sibling = relation({ id: 'rel:sibling', kind: 'sibling', fromId: B, toId: C });
    expect(
      RelationshipsSchema.safeParse([divorced, remarried, child, adoptive, sibling]).success,
    ).toBe(true);
  });

  it('rejects duplicate ids and duplicate tuples', () => {
    expect(issuePaths(RelationshipsSchema, [relation(), relation()])).toContainEqual([1, 'id']);
    expect(
      issuePaths(RelationshipsSchema, [relation(), relation({ id: 'rel:1', toId: C })]),
    ).toContainEqual([1, 'id']);
    const second = relation({ id: 'rel:2' });
    expect(issuePaths(RelationshipsSchema, [relation(), second])).toContainEqual([1]);
  });

  it('rejects a sibling pair registered in both directions', () => {
    const first = relation({ id: 'rel:s1', kind: 'sibling', fromId: A, toId: B });
    const second = relation({ id: 'rel:s2', kind: 'sibling', fromId: B, toId: A });
    expect(issuePaths(RelationshipsSchema, [first, second])).toContainEqual([1]);
  });

  it('rejects two active spouses for the same actor', () => {
    const first = relation({ id: 'rel:m1', kind: 'spouse', biological: false });
    const second = relation({
      id: 'rel:m2',
      kind: 'spouse',
      biological: false,
      fromId: A,
      toId: C,
      bonds: bonds(A, C),
    });
    expect(issuePaths(RelationshipsSchema, [first, second])).toContainEqual([1]);
  });

  it('rejects three- and four-node parent-child cycles', () => {
    const three = [
      relation({ id: 'rel:ab', fromId: A, toId: B }),
      relation({ id: 'rel:bc', fromId: B, toId: C }),
      relation({ id: 'rel:ca', fromId: C, toId: A }),
    ];
    expect(issuePaths(RelationshipsSchema, three)).toContainEqual([2]);

    const four = [
      relation({ id: 'rel:ab', fromId: A, toId: B }),
      relation({ id: 'rel:bc', fromId: B, toId: C }),
      relation({ id: 'rel:cd', fromId: C, toId: 'char:d' }),
      relation({ id: 'rel:da', fromId: 'char:d', toId: A }),
    ];
    expect(issuePaths(RelationshipsSchema, four)).toContainEqual([3]);
  });
});

function actor(id: string) {
  return {
    id,
    tier: 'tier1',
    sex: 'female',
    name: { scheme: 'zh', family: null, given: null, patronymic: null },
    wellbeing: { stress: 0.3 },
    social: { ties: 0.5 },
    skills: [],
    birthDate: '1950-01-01',
    birthPlaceId: 'place:x',
    currentResidenceId: 'place:x',
    politicalEntityId: 'polity:x',
    citizenshipIds: ['polity:x'],
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
    employment: { status: 'not-in-labor-force', wageLevel: null, lastFactId: null },
    health: { conditions: [] },
    finance: { accountId: null, lastSettlementFactId: null },
  };
}

function snapshot(relationships: Relationship[]) {
  return {
    schemaVersion: 1,
    engineVersion: '0.0.0',
    dataPackVersions: { TEST: '0.0.0' },
    at: '1980-01-01',
    rootSeed: 'seed-1',
    rngState: {},
    schedulerState: {},
    activeCharacterId: A,
    actors: [actor(A), actor(B)],
    world: {},
    relationships,
    householdAccounts: [],
    lastJournalSequence: 0,
  };
}

describe('SimulationSnapshotSchema relationships', () => {
  it('accepts an empty relationship list and a valid relationship', () => {
    expect(SimulationSnapshotSchema.safeParse(snapshot([])).success).toBe(true);
    expect(SimulationSnapshotSchema.safeParse(snapshot([relation()])).success).toBe(true);
  });

  it('rejects a relationship that references an unknown actor', () => {
    const result = SimulationSnapshotSchema.safeParse(
      snapshot([relation({ fromId: 'char:ghost' })]),
    );
    if (result.success) throw new Error('expected a rejection');
    expect(result.error.issues.map((issue) => issue.path)).toContainEqual([
      'relationships',
      0,
      'fromId',
    ]);
  });
});
