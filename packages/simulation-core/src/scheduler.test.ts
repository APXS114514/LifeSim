import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { EventQueue, compareOccurrences, occurrenceKey, type Occurrence } from './scheduler.ts';

function occurrence(type: string, at: string, priority: number, period: string): Occurrence {
  return {
    key: occurrenceKey(type, 'char:p', period),
    type,
    at,
    priority,
    entityId: 'char:p',
    period,
    payload: null,
    causeFactIds: [],
    depth: 0,
  };
}

const occurrences = fc.uniqueArray(
  fc
    .tuple(
      fc.constantFrom('a.event', 'b.event', 'c.event'),
      fc.constantFrom('1990-01-01', '1990-01-02', '1991-06-30'),
      fc.integer({ min: 0, max: 3 }),
      fc.integer({ min: 0, max: 20 }),
    )
    .map(([type, at, priority, n]) => occurrence(type, at, priority, `p:${n}`)),
  { selector: (item) => item.key, maxLength: 30 },
);

describe('EventQueue', () => {
  it('orders by date, then priority, then key, whatever the insertion order', () => {
    fc.assert(
      fc.property(occurrences, (items) => {
        const forward = new EventQueue(items).toArray().map((item) => item.key);
        const backward = new EventQueue([...items].reverse()).toArray().map((item) => item.key);
        const sorted = [...items].sort(compareOccurrences).map((item) => item.key);
        expect(forward).toEqual(sorted);
        expect(backward).toEqual(sorted);
      }),
    );
  });

  it('keeps the first occurrence of a key and ignores later duplicates', () => {
    const first = occurrence('a.event', '1990-01-01', 1, 'p:1');
    const queue = new EventQueue([first]);
    expect(queue.insert({ ...first, at: '1989-01-01' })).toBe(false);
    expect(queue.size).toBe(1);
    expect(queue.peek()?.at).toBe('1990-01-01');
    expect(queue.shift()?.key).toBe(first.key);
    expect(queue.has(first.key)).toBe(false);
  });
});
