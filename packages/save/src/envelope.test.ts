import type { SimEventFact } from '@lifesim/content-schema';
import { describe, expect, it } from 'vitest';
import { decodeSave, encodeSave, type SavePayload } from './envelope.ts';

const birth: SimEventFact = {
  id: 'fact:0',
  sequence: 0,
  type: 'life.birth',
  at: '1978-05-04',
  actorIds: ['char:protagonist'],
  causeEventIds: [],
  outcomeCode: 'born',
  templateId: 'life.birth',
  evidenceIds: [],
  eventVersion: 1,
};

const payload: SavePayload = {
  snapshot: {
    schemaVersion: 1,
    engineVersion: '0.0.0',
    dataPackVersions: { SYNTHETIC: '0.0.0' },
    at: '1978-05-04',
    rootSeed: 'seed-1',
    rngState: { streams: {} },
    schedulerState: { queue: [] },
    activeCharacterId: 'char:protagonist',
    actors: [
      {
        id: 'char:protagonist',
        tier: 'protagonist',
        birthDate: '1978-05-04',
        birthPlaceId: 'place:synthetic-city',
        currentResidenceId: 'place:synthetic-city',
        politicalEntityId: 'polity:synthetic',
        citizenshipIds: ['polity:synthetic'],
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
        traits: { aptitude: 0.6 },
        education: { completed: 'secondary', enrolledIn: null, lastFactId: null },
        employment: { status: 'employed', wageLevel: 'secondary', lastFactId: null },
        health: { conditions: [] },
        finance: { accountId: null, lastSettlementFactId: null },
      },
    ],
    world: {},
    relationships: [],
    householdAccounts: [],
    lastJournalSequence: 0,
  },
  facts: [birth],
};

const metadata = { engineVersion: '0.0.0', exportedAt: '2026-10-20T12:00:00+08:00' };
const encoder = new TextEncoder();

function envelopeOf(bytes: Uint8Array): Record<string, unknown> {
  return JSON.parse(new TextDecoder().decode(bytes)) as Record<string, unknown>;
}

describe('save envelope', () => {
  it('round-trips a payload unchanged', async () => {
    const decoded = await decodeSave(await encodeSave(payload, metadata));
    expect(decoded).toEqual({ ok: true, payload, ...metadata });
  });

  it('rejects files above the size limit before parsing them', async () => {
    const bytes = await encodeSave(payload, metadata);
    expect(await decodeSave(bytes, { maxBytes: bytes.byteLength - 1 })).toEqual({
      ok: false,
      error: 'too-large',
    });
  });

  it('rejects invalid UTF-8 and non-JSON input', async () => {
    expect((await decodeSave(new Uint8Array([0xff, 0xfe, 0xfd]))).ok).toBe(false);
    expect(await decodeSave(encoder.encode('not json'))).toEqual({ ok: false, error: 'not-json' });
  });

  it('detects a payload edited after export', async () => {
    const envelope = envelopeOf(await encodeSave(payload, metadata));
    envelope['payload'] = String(envelope['payload']).replace('seed-1', 'seed-2');
    const result = await decodeSave(encoder.encode(JSON.stringify(envelope)));
    expect(result).toEqual({ ok: false, error: 'checksum-mismatch' });
  });

  it('refuses prototype-polluting keys anywhere in the file', async () => {
    const hostile = '{"format":"lifesim-save","__proto__":{"polluted":true}}';
    const result = await decodeSave(encoder.encode(hostile));
    expect(result).toMatchObject({ ok: false, error: 'forbidden-key' });
    expect(({} as Record<string, unknown>)['polluted']).toBeUndefined();
  });

  it('reports a newer format version instead of guessing', async () => {
    const envelope = envelopeOf(await encodeSave(payload, metadata));
    envelope['formatVersion'] = 99;
    const result = await decodeSave(encoder.encode(JSON.stringify(envelope)));
    expect(result).toMatchObject({ ok: false, error: 'unsupported-version' });
  });

  it('refuses to encode a journal that breaks its invariants', async () => {
    const broken: SavePayload = { ...payload, facts: [birth, { ...birth, id: 'fact:1' }] };
    await expect(encodeSave(broken, metadata)).rejects.toThrow();
  });
});
