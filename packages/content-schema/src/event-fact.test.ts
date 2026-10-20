import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { SimEventFactSchema, checkJournalInvariants, type SimEventFact } from './event-fact.ts';

function fact(sequence: number, at: string, causeEventIds: string[] = []): SimEventFact {
  return {
    id: `fact:${sequence}`,
    sequence,
    type: 'synthetic.test',
    at,
    actorIds: ['char:protagonist'],
    causeEventIds,
    outcomeCode: 'ok',
    templateId: 'synthetic.test',
    evidenceIds: [],
    eventVersion: 1,
  };
}

describe('SimEventFactSchema', () => {
  it('accepts a well-formed fact', () => {
    expect(SimEventFactSchema.safeParse(fact(0, '1978-05-04')).success).toBe(true);
  });

  it('rejects a fact that cites itself as its cause', () => {
    expect(SimEventFactSchema.safeParse(fact(0, '1978-05-04', ['fact:0'])).success).toBe(false);
  });

  it('rejects impossible dates', () => {
    expect(SimEventFactSchema.safeParse(fact(0, '1978-02-30')).success).toBe(false);
  });
});

describe('checkJournalInvariants', () => {
  it('accepts a contiguous, chronological journal with backward causes', () => {
    const journal = [
      fact(0, '1978-05-04'),
      fact(1, '1984-09-01', ['fact:0']),
      fact(2, '1984-09-01', ['fact:1']),
    ];
    expect(checkJournalInvariants(journal, { complete: true })).toEqual([]);
  });

  it('reports date regression, sequence gaps and forward causes', () => {
    const journal = [fact(0, '1990-01-01', ['fact:2']), fact(2, '1989-12-31')];
    expect(checkJournalInvariants(journal, { complete: true })).toEqual([
      { kind: 'forward-cause', factId: 'fact:0', causeId: 'fact:2' },
      { kind: 'sequence-gap', factId: 'fact:2', expected: 1, actual: 2 },
      { kind: 'date-regression', factId: 'fact:2', previousAt: '1990-01-01', at: '1989-12-31' },
    ]);
  });

  it('only flags causes outside the list when the journal is complete', () => {
    const page = [fact(10, '2000-01-01', ['fact:3'])];
    expect(checkJournalInvariants(page, { complete: false })).toEqual([]);
    expect(checkJournalInvariants(page, { complete: true })).toEqual([
      { kind: 'unknown-cause', factId: 'fact:10', causeId: 'fact:3' },
    ]);
  });

  it('accepts any generated journal that respects the invariants', () => {
    // 生成递增的日期与只指向更早事实的原因，检查器不应误报。
    const journals = fc
      .array(fc.tuple(fc.integer({ min: 0, max: 400 }), fc.nat()), { maxLength: 40 })
      .map((steps) => {
        let day = Date.UTC(1950, 0, 1);
        return steps.map(([gapDays, causePick], sequence) => {
          day += gapDays * 86_400_000;
          const causes = sequence === 0 ? [] : [`fact:${causePick % sequence}`];
          return fact(sequence, new Date(day).toISOString().slice(0, 10), causes);
        });
      });

    fc.assert(
      fc.property(journals, (journal) => {
        expect(checkJournalInvariants(journal, { complete: true })).toEqual([]);
      }),
    );
  });
});
