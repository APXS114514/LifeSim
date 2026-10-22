import type { SimEventFact } from '@lifesim/content-schema';
import { describe, expect, it } from 'vitest';
import { buildLifeGrid } from './life-grid.ts';

/** 夹具：只用与类别判定相关的字段；取值本身不代表任何真实事件。 */
function fact(sequence: number, type: string, at: string): SimEventFact {
  return {
    id: 'fact:' + String(sequence),
    sequence,
    type,
    at,
    actorIds: ['protagonist'],
    causeEventIds: [],
    outcomeCode: 'fixture',
    templateId: 'fixture/template',
    evidenceIds: ['adr:0006'],
    eventVersion: 1,
  };
}

describe('life grid', () => {
  it('colors each year with the highest-priority category and covers the whole life', () => {
    const grid = buildLifeGrid({
      birthYear: 1980,
      deathYear: 1990,
      currentYear: 1995,
      facts: [
        fact(0, 'life.birth', '1980-03-04'),
        fact(1, 'finance.settlement', '1985-12-31'),
        fact(2, 'finance.settlement', '1986-12-31'),
        fact(3, 'career.hired', '1986-06-01'),
        fact(4, 'health.illness-onset', '1988-04-01'),
        fact(5, 'decision.made', '1988-05-01'),
        fact(6, 'life.death', '1990-07-09'),
      ],
    });

    expect(grid.map((cell) => cell.year)).toEqual([
      1980, 1981, 1982, 1983, 1984, 1985, 1986, 1987, 1988, 1989, 1990,
    ]);
    const byYear = new Map(grid.map((cell) => [cell.year, cell.category]));
    expect(byYear.get(1980)).toBe('life');
    expect(byYear.get(1985)).toBe('finance');
    expect(byYear.get(1986)).toBe('career');
    expect(byYear.get(1988)).toBe('decision');
    expect(byYear.get(1989)).toBe('none');
    expect(byYear.get(1990)).toBe('life');
    expect(byYear.get(1981)).toBe('none');
  });

  it('stops at the current year for a living character and never invents future cells', () => {
    const grid = buildLifeGrid({
      birthYear: 1980,
      deathYear: null,
      currentYear: 1990,
      facts: [fact(0, 'life.birth', '1980-01-01')],
    });

    expect(grid).toHaveLength(11);
    expect(grid[grid.length - 1]?.year).toBe(1990);
    expect(grid[0]?.category).toBe('life');
    expect(
      grid.every((cell, index) => index === 0 || cell.year === (grid[index - 1]?.year ?? 0) + 1),
    ).toBe(true);
  });

  it('keeps finance in the background when a higher-priority fact exists in the same year', () => {
    const grid = buildLifeGrid({
      birthYear: 1990,
      deathYear: null,
      currentYear: 1991,
      facts: [
        fact(0, 'life.birth', '1990-01-01'),
        fact(1, 'finance.settlement', '1991-12-31'),
        fact(2, 'family.child-born', '1991-06-01'),
      ],
    });

    expect(grid.find((cell) => cell.year === 1991)?.category).toBe('family');
  });
});
