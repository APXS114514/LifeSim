import type { SimEventFact } from '@lifesim/content-schema';
import { describe, expect, it } from 'vitest';
import { factCategory, isBackgroundDecision } from '../components/fact-category.ts';
import { GameSession } from './session.ts';
import { buildLifeGrid, revealedGridInput } from './life-grid.ts';

/** 夹具：只用与类别判定相关的字段；取值本身不代表任何真实事件。 */
function fact(
  sequence: number,
  type: string,
  at: string,
  details?: Record<string, string | number | boolean | null>,
): SimEventFact {
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
    ...(details ? { details } : {}),
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

  it('ignores background yearly-focus decisions and colors daily life below real decisions', () => {
    const grid = buildLifeGrid({
      birthYear: 1990,
      deathYear: null,
      currentYear: 1993,
      facts: [
        fact(0, 'life.birth', '1990-01-01'),
        fact(1, 'decision.made', '1991-06-01', { decision: 'choice.yearly-focus' }),
        fact(2, 'life.daily-routine', '1991-07-01'),
        fact(3, 'decision.made', '1992-06-01', { decision: 'choice.yearly-focus' }),
        fact(4, 'finance.settlement', '1992-12-31'),
        fact(5, 'decision.made', '1993-06-01', { decision: 'choice.after-secondary' }),
        fact(6, 'life.daily-routine', '1993-07-01'),
      ],
    });

    const byYear = new Map(grid.map((cell) => [cell.year, cell.category]));
    expect(byYear.get(1991)).toBe('daily');
    expect(byYear.get(1992)).toBe('finance');
    expect(byYear.get(1993)).toBe('decision');
  });

  it('only exposes facts and a death cell that the timeline has revealed', () => {
    const facts = [
      fact(0, 'life.birth', '1990-01-01'),
      fact(1, 'finance.settlement', '1991-12-31'),
      fact(2, 'life.death', '1992-06-01'),
    ];

    // 日期已经走到 1991，但当年的事实还没揭示：1991 格不能着色。
    const hidden = revealedGridInput({ facts, visibleCount: 1, revealDate: '1991-12-31' });
    expect(hidden.currentYear).toBe(1991);
    expect(hidden.deathYear).toBeNull();
    const hiddenGrid = buildLifeGrid({
      birthYear: 1990,
      deathYear: hidden.deathYear,
      currentYear: hidden.currentYear,
      facts: hidden.facts,
    });
    expect(hiddenGrid.find((cell) => cell.year === 1991)?.category).toBe('none');

    // 财务事实揭示后只影响已揭示的年份；死亡事实未揭示时不能出现死亡格。
    const beforeDeath = revealedGridInput({ facts, visibleCount: 2, revealDate: '1992-06-01' });
    expect(beforeDeath.deathYear).toBeNull();
    expect(
      buildLifeGrid({
        birthYear: 1990,
        deathYear: beforeDeath.deathYear,
        currentYear: beforeDeath.currentYear,
        facts: beforeDeath.facts,
      }).find((cell) => cell.year === 1991)?.category,
    ).toBe('finance');

    const all = revealedGridInput({ facts, visibleCount: 99, revealDate: '1992-06-01' });
    expect(all.deathYear).toBe(1992);
    expect(all.facts).toHaveLength(3);
    expect(
      buildLifeGrid({
        birthYear: 1990,
        deathYear: all.deathYear,
        currentYear: all.currentYear,
        facts: all.facts,
      }).at(-1)?.category,
    ).toBe('life');
  });

  it('uses a real JP 1978 life and never colors a year by the yearly-focus decision', () => {
    const session = GameSession.create({ seed: 'probe-0', region: 'JP', year: 1978 });
    session.settleBirthDay();
    for (let round = 0; round < 500 && !session.isEnded && session.age < 45; round += 1) {
      if (session.pending) session.choose(session.pending.recommended.optionId);
      else session.stepYear();
    }
    expect(session.age).toBeGreaterThanOrEqual(40);

    const birthYear = Number(session.birth.birthDate.slice(0, 4));
    const currentYear = Number(session.clock.slice(0, 4));
    const grid = buildLifeGrid({
      birthYear,
      deathYear: null,
      currentYear,
      facts: session.facts,
    });
    const categories = new Set(
      grid.map((cell) => cell.category).filter((category) => category !== 'none'),
    );
    expect(categories.size).toBeGreaterThanOrEqual(4);
    expect(categories.has('daily')).toBe(true);

    // 年度重点在每个生日都会产生 decision.made；它一条都不能把方格染成 decision。
    const focusFacts = session.facts.filter((entry) => isBackgroundDecision(entry));
    expect(focusFacts.length).toBeGreaterThan(0);
    for (const focus of focusFacts) {
      const year = Number(focus.at.slice(0, 4));
      const cell = grid.find((entry) => entry.year === year);
      if (!cell) continue;
      const yearFacts = session.facts.filter((entry) => entry.at.startsWith(String(year) + '-'));
      if (
        yearFacts.some(
          (entry) => !isBackgroundDecision(entry) && factCategory(entry) === 'decision',
        )
      )
        continue;
      expect(cell.category).not.toBe('decision');
    }

    // 反方向：只有真的有非后台决定的年份才可能是 decision。
    for (const cell of grid) {
      if (cell.category !== 'decision') continue;
      const yearFacts = session.facts.filter((entry) =>
        entry.at.startsWith(String(cell.year) + '-'),
      );
      expect(
        yearFacts.some(
          (entry) => !isBackgroundDecision(entry) && factCategory(entry) === 'decision',
        ),
      ).toBe(true);
    }
  });
});
