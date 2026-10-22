import { describe, expect, it } from 'vitest';
import { createRealLifeSimulation, type RealLifeSession } from './region-model.ts';

/**
 * M3-012c：两个高严重度问题的回归与性质测试。
 *
 * 1. 学段时长按**入学那年**的学制计算：推迟入学不缩短学制，学制中途改革不改变已开始学段的长度。
 * 2. 未独立（儿童/在读）期间学费由家庭承担；年度结算按被结算的那一年判断是否独立。
 *
 * 全部用例只用五国国家包的公开数据，不写死任何国家分支。
 */

const FOREVER = { targetDate: '2200-01-01', stopAtMajorDecision: false, maxWorkUnits: 1_000_000 };
const COUNTRIES = ['CN', 'JP', 'KP', 'KR', 'RU'] as const;

function life(region: (typeof COUNTRIES)[number], year: number, seed: string): RealLifeSession {
  return createRealLifeSimulation({ seed, region, year });
}

/** 某一学段的入学事实：tertiary 用 `education.enrolled`，其余用 `*-started`。 */
function startFact(session: RealLifeSession, stage: 'primary' | 'secondary' | 'tertiary') {
  const type =
    stage === 'primary'
      ? 'education.primary-started'
      : stage === 'secondary'
        ? 'education.secondary-started'
        : 'education.enrolled';
  return session.simulation.facts.find(
    (fact) =>
      fact.type === type && (stage !== 'tertiary' || fact.details?.['stage'] === 'tertiary'),
  );
}

function completedFact(session: RealLifeSession, stage: 'primary' | 'secondary' | 'tertiary') {
  const type =
    stage === 'primary'
      ? 'education.primary-completed'
      : stage === 'secondary'
        ? 'education.secondary-completed'
        : 'education.tertiary-completed';
  return session.simulation.facts.find((fact) => fact.type === type);
}

function protagonist(session: RealLifeSession) {
  const state = session.simulation.state;
  const actor = state.actors.find((candidate) => candidate.tier === 'protagonist');
  if (!actor) throw new Error('missing protagonist');
  const account = state.householdAccounts.find((entry) => entry.id === actor.finance.accountId);
  if (!account) throw new Error('missing account');
  return { actor, account };
}

describe('M3-012c：学段时长按入学那一年的学制计算', () => {
  it('JP 1978 种子 e：大学 1994—1998，读满 4 年（原来按累计年龄只读 3 年）', () => {
    const session = life('JP', 1978, 'e');
    session.simulation.advanceTo(FOREVER);
    const started = startFact(session, 'tertiary');
    const completed = completedFact(session, 'tertiary');
    expect(started?.at).toBe('1994-07-31');
    expect(completed?.at).toBe('1998-07-31');
    expect(session.region.queries.education.systemAt(1994).tertiaryYears).toBe(4);
  });

  it('KR 1980 种子 e：大学 1996—2000，读满 4 年', () => {
    const session = life('KR', 1980, 'e');
    session.simulation.advanceTo(FOREVER);
    expect(startFact(session, 'tertiary')?.at).toBe('1996-07-30');
    expect(completedFact(session, 'tertiary')?.at).toBe('2000-07-30');
  });

  it('RU 1952 种子 d：大学 1968—1973，读满 5 年（原来只读 4 年）', () => {
    const session = life('RU', 1952, 'd');
    session.simulation.advanceTo(FOREVER);
    expect(startFact(session, 'tertiary')?.at).toBe('1968-06-04');
    expect(completedFact(session, 'tertiary')?.at).toBe('1973-06-04');
    expect(session.region.queries.education.systemAt(1968).tertiaryYears).toBe(5);
  });

  it('KP 1955 种子 e：1971 年入学、1972 年学制改革，仍按入学当年读满 5 年（原来读 6 年）', () => {
    const session = life('KP', 1955, 'e');
    session.simulation.advanceTo(FOREVER);
    expect(startFact(session, 'tertiary')?.at).toBe('1971-07-31');
    expect(completedFact(session, 'tertiary')?.at).toBe('1976-07-31');
    // 1972 年改革的中学年限从 3 变 7，但已经开始的大学学段不受影响。
    expect(session.region.queries.education.systemAt(1971).tertiaryYears).toBe(5);
  });

  it('KP 1965 种子 e：1972 年入学年龄由 7 降到 6，小学仍读满 4 年（原来只读 3 年）', () => {
    const session = life('KP', 1965, 'e');
    session.simulation.advanceTo(FOREVER);
    expect(startFact(session, 'primary')?.at).toBe('1972-07-31');
    expect(completedFact(session, 'primary')?.at).toBe('1976-07-31');
    expect(session.region.queries.education.systemAt(1972).primaryYears).toBe(4);
  });

  it('性质：五国 × 1950—2010 出生年 × 2 个种子，每个学段的年数都等于入学当年学制年数', () => {
    let checked = 0;
    for (const country of COUNTRIES) {
      for (let year = 1950; year <= 2010; year += 1) {
        for (const seed of ['duration-a', 'duration-b']) {
          const session = life(country, year, seed);
          session.simulation.advanceTo({ ...FOREVER, targetDate: `${year + 35}-12-31` });
          for (const stage of ['primary', 'secondary', 'tertiary'] as const) {
            const started = startFact(session, stage);
            if (!started) continue;
            const completed = completedFact(session, stage);
            // 还没读完或中途去世：没有毕业事实，不检查这一学段。
            if (!completed || completed.at <= started.at) continue;
            const entryYear = Number(started.at.slice(0, 4));
            const system = session.region.queries.education.systemAt(entryYear);
            const expected =
              stage === 'primary'
                ? system.primaryYears
                : stage === 'secondary'
                  ? system.secondaryYears
                  : system.tertiaryYears;
            expect(
              Number(completed.at.slice(0, 4)) - entryYear,
              `${country} ${year} ${seed} ${stage} ${started.at}→${completed.at}`,
            ).toBe(expected);
            checked += 1;
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(1000);
  }, 120_000);
});

describe('M3-012c：学费由家庭承担，孩子不因上学背债', () => {
  it('KR 2005 种子 a：12 岁时本人账户余额 ≥ 0，中学学费记在父母账户', () => {
    const session = life('KR', 2005, 'a');
    session.simulation.advanceTo({ ...FOREVER, targetDate: '2017-12-31' });
    const { actor, account } = protagonist(session);
    expect(actor.birthDate).toBe('2005-10-05');
    expect(account.balanceMinor).toBeGreaterThanOrEqual(0);

    const paid = session.simulation.facts.find(
      (fact) => fact.type === 'education.tuition-paid' && fact.details?.['stage'] === 'secondary',
    );
    expect(paid?.details).toMatchObject({
      feeMinor: 3_322_347,
      paidBy: 'family',
      balanceMinor: -3_322_347,
    });
    const state = session.simulation.state;
    const parents = state.householdAccounts.filter((entry) => entry.id !== account.id);
    expect(parents.reduce((sum, entry) => sum + entry.balanceMinor, 0)).toBe(-3_322_347);
  });

  it('JP 1978 种子 e：16 岁余额 ≥ 0，且 15→16 岁那一年不再按成年结算生活费', () => {
    const session = life('JP', 1978, 'e');
    session.simulation.advanceTo({ ...FOREVER, targetDate: '1994-12-31' });
    const { actor, account } = protagonist(session);
    expect(actor.birthDate).toBe('1978-07-31');
    expect(account.balanceMinor).toBeGreaterThanOrEqual(0);
    // 16 岁生日的结算覆盖 15→16 岁：那一年还不到法定工作年龄，不产生结算事实。
    expect(
      session.simulation.facts.some(
        (fact) => fact.type === 'finance.settlement' && fact.at.startsWith('1994'),
      ),
    ).toBe(false);
    const paid = session.simulation.facts.find(
      (fact) => fact.type === 'education.tuition-paid' && fact.details?.['stage'] === 'tertiary',
    );
    expect(paid?.details).toMatchObject({ paidBy: 'family', feeMinor: 47_179 });
  });

  it('性质：五国 × 出生年 × 2 个种子，主角本人账户在第一次独立之前从不为负', () => {
    let samples = 0;
    for (const country of COUNTRIES) {
      for (const year of [1950, 1970, 1990, 2005, 2020]) {
        for (const seed of ['fee-a', 'fee-b']) {
          const session = life(country, year, seed);
          const minimumWorkingAge = session.region.rules.minimumWorkingAge;
          for (let cursor = year; cursor <= year + 40; cursor += 1) {
            session.simulation.advanceTo({ ...FOREVER, targetDate: `${cursor}-12-31` });
            const state = session.simulation.state;
            const actor = state.actors.find((candidate) => candidate.tier === 'protagonist');
            if (!actor) continue;
            const account = state.householdAccounts.find(
              (entry) => entry.id === actor.finance.accountId,
            );
            if (!account) continue;
            const age = cursor - Number(actor.birthDate.slice(0, 4));
            const independent =
              actor.employment.status !== 'child' &&
              actor.employment.status !== 'student' &&
              age >= minimumWorkingAge;
            if (independent) continue;
            expect(
              account.balanceMinor,
              `${country} ${year} ${seed} at ${cursor} age ${age}`,
            ).toBeGreaterThanOrEqual(0);
            samples += 1;
          }
        }
      }
    }
    expect(samples).toBeGreaterThan(500);
  }, 120_000);
});
