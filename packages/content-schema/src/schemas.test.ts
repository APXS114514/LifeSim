import { describe, expect, it } from 'vitest';
import { CharacterStateSchema } from './character-state.ts';
import { CountryPackManifestSchema } from './country-pack.ts';
import { DataPointSchema, EvidenceMetaSchema, SourceRecordSchema } from './evidence.ts';
import { SimulationSnapshotSchema } from './snapshot.ts';

const evidence = {
  grade: 'D',
  sourceIds: ['adr:0001'],
  modelVersion: 'synthetic-0',
  geographyId: 'place:synthetic',
  yearRange: [1950, 2026],
} as const;

const character = {
  id: 'char:protagonist',
  tier: 'protagonist',
  birthDate: '1978-05-04',
  birthPlaceId: 'place:synthetic-city',
  currentResidenceId: 'place:synthetic-city',
  politicalEntityId: 'polity:synthetic',
  citizenshipIds: ['polity:synthetic'],
  vitalStatus: { kind: 'alive' },
  lifePrinciples: {
    family: 0.8,
    wealth: 0.4,
    health: 0.6,
    knowledge: 0.7,
    risk: 0.2,
    stability: 0.9,
  },
  origin: { settlement: 'urban', familyResources: 'middle' },
  traits: { aptitude: 0.6 },
  education: { completed: 'secondary', enrolledIn: null, lastFactId: null },
  employment: { status: 'employed', wageLevel: 'secondary', lastFactId: null },
  health: { conditions: [] },
  finance: { accountId: null, lastSettlementFactId: null },
} as const;

describe('EvidenceMetaSchema', () => {
  it('accepts a D-grade design assumption that names its ADR', () => {
    expect(EvidenceMetaSchema.safeParse(evidence).success).toBe(true);
  });

  it('requires at least one source, even for D-grade assumptions', () => {
    expect(EvidenceMetaSchema.safeParse({ ...evidence, sourceIds: [] }).success).toBe(false);
  });

  it('rejects reversed year ranges and inverted uncertainty bounds', () => {
    expect(EvidenceMetaSchema.safeParse({ ...evidence, yearRange: [2000, 1990] }).success).toBe(
      false,
    );
    expect(
      EvidenceMetaSchema.safeParse({ ...evidence, uncertainty: { lower: 2, upper: 1 } }).success,
    ).toBe(false);
  });
});

describe('DataPointSchema', () => {
  it('accepts an explicit null with a missing reason', () => {
    const missing = { value: null, missingReason: 'no regional series before 1960' };
    expect(DataPointSchema.safeParse(missing).success).toBe(true);
  });

  it('rejects a null without a reason, so gaps cannot hide', () => {
    expect(DataPointSchema.safeParse({ value: null }).success).toBe(false);
  });

  it('rejects non-finite numbers', () => {
    expect(DataPointSchema.safeParse({ value: Number.NaN, evidence }).success).toBe(false);
    expect(DataPointSchema.safeParse({ value: Infinity, evidence }).success).toBe(false);
  });
});

describe('SourceRecordSchema', () => {
  const source = {
    id: 'un-wpp:2024',
    title: 'World Population Prospects 2024',
    publisher: 'United Nations, Population Division',
    url: 'https://population.un.org/wpp/',
    license: 'NOASSERTION',
    redistribution: 'unknown',
  } as const;

  it('accepts a source whose license is not yet audited', () => {
    expect(SourceRecordSchema.safeParse(source).success).toBe(true);
  });

  it('refuses "allowed" redistribution without a verification date', () => {
    expect(SourceRecordSchema.safeParse({ ...source, redistribution: 'allowed' }).success).toBe(
      false,
    );
    expect(
      SourceRecordSchema.safeParse({
        ...source,
        redistribution: 'allowed',
        verifiedAt: '2026-10-20',
      }).success,
    ).toBe(true);
  });
});

describe('CountryPackManifestSchema', () => {
  const manifest = {
    packId: 'RU',
    role: 'birth',
    schemaVersion: '0.1.0',
    engineRange: '^0.1.0',
    validFrom: '1950-01-01',
    dataVersion: '2026.10.0',
    licenseManifestPath: 'LICENSES.md',
    modules: { population: 'population.json', politicalHistory: 'political-history.json' },
  } as const;

  it('accepts a birth-region manifest', () => {
    expect(CountryPackManifestSchema.safeParse(manifest).success).toBe(true);
  });

  it('rejects module paths that escape the pack directory', () => {
    const escaping = { ...manifest, modules: { population: '../shared/population.json' } };
    expect(CountryPackManifestSchema.safeParse(escaping).success).toBe(false);
  });

  it('rejects unknown modules and fields', () => {
    expect(
      CountryPackManifestSchema.safeParse({ ...manifest, modules: { stocks: 'x.json' } }).success,
    ).toBe(false);
    expect(CountryPackManifestSchema.safeParse({ ...manifest, extra: true }).success).toBe(false);
  });
});

describe('CharacterStateSchema', () => {
  it('accepts a living protagonist', () => {
    expect(CharacterStateSchema.safeParse(character).success).toBe(true);
  });

  it('rejects a death date before the birth date', () => {
    const impossible = {
      ...character,
      vitalStatus: { kind: 'deceased', deathDate: '1970-01-01', deathFactId: 'fact:death' },
    };
    expect(CharacterStateSchema.safeParse(impossible).success).toBe(false);
  });

  it('keeps principle weights within 0–1', () => {
    const extreme = { ...character, lifePrinciples: { ...character.lifePrinciples, risk: 1.5 } };
    expect(CharacterStateSchema.safeParse(extreme).success).toBe(false);
  });
});

describe('SimulationSnapshotSchema', () => {
  const snapshot = {
    schemaVersion: 1,
    engineVersion: '0.0.0',
    dataPackVersions: { SYNTHETIC: '0.0.0' },
    at: '1978-05-04',
    rootSeed: 'seed-1',
    rngState: { streams: {} },
    schedulerState: { queue: [] },
    activeCharacterId: character.id,
    actors: [character],
    world: { economyPhase: 'normal' },
    relationships: [],
    householdAccounts: [
      {
        id: 'acct:protagonist',
        ownerIds: [character.id],
        currency: { code: 'SYN', version: 1 },
        balanceMinor: 0,
      },
    ],
    lastJournalSequence: 0,
  };

  it('accepts a minimal snapshot', () => {
    expect(SimulationSnapshotSchema.safeParse(snapshot).success).toBe(true);
  });

  it('requires the consumed random-stream state, not just the root seed', () => {
    const { rngState: _dropped, ...withoutRng } = snapshot;
    expect(SimulationSnapshotSchema.safeParse(withoutRng).success).toBe(false);
  });

  it('requires the active character to be one of the actors', () => {
    expect(
      SimulationSnapshotSchema.safeParse({ ...snapshot, activeCharacterId: 'char:ghost' }).success,
    ).toBe(false);
  });
});

describe('CharacterStateSchema cross-field rules', () => {
  it('rejects enrolment that skips a stage', () => {
    const skipping = {
      ...character,
      education: { completed: 'primary', enrolledIn: 'tertiary', lastFactId: null },
      employment: { status: 'student', wageLevel: null, lastFactId: null },
    };
    expect(CharacterStateSchema.safeParse(skipping).success).toBe(false);
  });

  it('requires "student" status exactly while enrolled', () => {
    const studentNotEnrolled = {
      ...character,
      employment: { status: 'student', wageLevel: null, lastFactId: null },
    };
    expect(CharacterStateSchema.safeParse(studentNotEnrolled).success).toBe(false);
  });

  it('requires a wage level exactly when employed or retired', () => {
    const unpaid = {
      ...character,
      employment: { status: 'employed', wageLevel: null, lastFactId: null },
    };
    expect(CharacterStateSchema.safeParse(unpaid).success).toBe(false);
  });
});
