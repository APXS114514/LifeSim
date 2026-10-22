import { CharacterStateSchema } from '@lifesim/content-schema';
import { canonicalJson, deriveStream, type SimState } from '@lifesim/simulation-core';
import { describe, expect, it } from 'vitest';
import { FIXTURE_REGION } from './__fixtures__/focus-region.ts';
import {
  canAffordFee,
  chargeTuition,
  educationFeeMinor,
  performanceFactor,
  stageIsCompulsory,
  transitionProbability,
  tuitionBalanceMinor,
  tuitionPayers,
} from './education.ts';
import { afterSecondaryDecisionKey, createLifeSimulation } from './module.ts';
import { LIFE_NARRATIVE } from './narrative.ts';
import type { EducationSystem, RegionModel } from './region.ts';
import { yearlyFocusDecisionKey } from './yearly-focus.ts';

const FOREVER = { targetDate: '2200-01-01', stopAtMajorDecision: false, maxWorkUnits: 1_000_000 };
const BIRTH = '1970-05-04';
const LIVING_COST = 100_000;

interface EraOptions {
  readonly feeShare?: number;
  readonly exam?: 'none' | 'exam';
  readonly passBase?: number;
  readonly family?: 'low' | 'middle' | 'high';
  readonly admissionP?: number;
  readonly compulsoryYears?: number;
}

/** 测试夹具（虚构）：在最小地区模型上换一套学制，只为验证 M3-012b 的规则。 */
function eraRegion(options: EraOptions = {}): RegionModel {
  const system: EducationSystem = {
    primaryStartAge: 6,
    primaryYears: 6,
    secondaryYears: 6,
    tertiaryYears: 4,
    compulsoryYears: options.compulsoryYears ?? 12,
    entranceExam:
      options.exam === 'exam'
        ? { kind: 'exam', passBase: options.passBase ?? 1 }
        : { kind: 'none' },
    feeShare: options.feeShare ?? 0,
    grade: 'D',
    sourceIds: ['adr:0007'],
  };
  return {
    ...FIXTURE_REGION,
    familyResourcesWeights: () => [[options.family ?? 'high', 1]],
    primaryEnrollmentP: () => 1,
    secondaryContinuationP: () => 1,
    universityAdmissionP: () => options.admissionP ?? 1,
    annualLivingCostMinor: () => LIVING_COST,
    queries: {
      ...FIXTURE_REGION.queries,
      education: { ...FIXTURE_REGION.queries.education, systemAt: () => system },
    },
  };
}

function lifeOf(region: RegionModel, seed = 'era-fixture') {
  const simulation = createLifeSimulation({
    seed,
    region,
    birthDate: BIRTH,
    decisions: { [afterSecondaryDecisionKey(18)]: 'apply-university' },
  });
  simulation.advanceTo(FOREVER);
  return simulation;
}

describe('M3-012b：学制、考试与学费（验收 3—6）', () => {
  it('学费按名义值计算：义务教育阶段为 0，其余是 feeShare × 当年生活费（不做 CPI 折算）', () => {
    const origin = { settlement: 'urban', familyResources: 'low' } as const;
    const currency = { code: 'FIX', version: 1 } as const;
    const charged = eraRegion({ feeShare: 0.5 });
    expect(educationFeeMinor(charged, origin, 1990, 'primary', currency)).toBe(0);
    expect(educationFeeMinor(charged, origin, 1990, 'secondary', currency)).toBe(0);
    expect(educationFeeMinor(charged, origin, 1990, 'tertiary', currency)).toBe(LIVING_COST * 0.5);

    const noCompulsory = eraRegion({ feeShare: 0.25, compulsoryYears: 0 });
    expect(educationFeeMinor(noCompulsory, origin, 1990, 'primary', currency)).toBe(
      LIVING_COST * 0.25,
    );
    expect(
      stageIsCompulsory(
        eraRegion({ compulsoryYears: 6 }).queries.education.systemAt(1990),
        'secondary',
      ),
    ).toBe(false);
    expect(
      stageIsCompulsory(
        eraRegion({ compulsoryYears: 6 }).queries.education.systemAt(1990),
        'primary',
      ),
    ).toBe(true);
  });

  it('家境贫寒且余额不足时记录 education.cannot-afford，余额不变、没有入学', () => {
    const region = eraRegion({ feeShare: 0.5, family: 'low' });
    const simulation = lifeOf(region, 'era-poor');
    const facts = simulation.facts;
    const refused = facts.find((fact) => fact.type === 'education.cannot-afford');
    expect(refused).toBeDefined();
    expect(refused?.details).toMatchObject({
      stage: 'tertiary',
      feeMinor: LIVING_COST * 0.5,
      balanceMinor: 0,
    });
    expect(facts.some((fact) => fact.type === 'education.tuition-paid')).toBe(false);
    expect(
      facts.some(
        (fact) => fact.type === 'education.enrolled' && fact.details?.['stage'] === 'tertiary',
      ),
    ).toBe(false);
    const actor = simulation
      .snapshot()
      .actors.find((candidate) => candidate.id === 'char:protagonist');
    expect(actor?.education.completed).toBe('secondary');
    expect(actor?.education.enrolledIn).toBeNull();
  });

  it('负担得起时按名义值扣款，余额变成负的家庭负债', () => {
    const region = eraRegion({ feeShare: 0.5, family: 'high' });
    const simulation = lifeOf(region, 'era-rich');
    const paid = simulation.facts.find(
      (fact) => fact.type === 'education.tuition-paid' && fact.details?.['stage'] === 'tertiary',
    );
    expect(paid?.details).toMatchObject({
      stage: 'tertiary',
      feeMinor: LIVING_COST * 0.5,
      balanceMinor: -LIVING_COST * 0.5,
    });
    // 扣款那一刻的余额是 -50,000（家庭教育垫付，允许负债）；之后的工作与生活支出另行结算。
    const balanceAfterFee = paid?.details?.['balanceMinor'];
    expect(balanceAfterFee).toBe(-LIVING_COST * 0.5);
    const snapshot = simulation.snapshot();
    const enrolled = simulation.facts.find(
      (fact) => fact.type === 'education.enrolled' && fact.details?.['stage'] === 'tertiary',
    );
    expect(enrolled?.causeEventIds).toEqual(paid ? [paid.id] : []);
    expect(snapshot.actors[0]?.education.completed).toBe('tertiary');
  });

  it('一次升学只抽一次：考试、录取、入学分别至多一条，且按顺序记录', () => {
    const simulation = lifeOf(eraRegion({ exam: 'exam', passBase: 1 }), 'era-once');
    const tertiary = simulation.facts.filter(
      (fact) => fact.details?.['stage'] === 'tertiary' && fact.type.startsWith('education.'),
    );
    const ofType = (type: string) => tertiary.filter((fact) => fact.type === type);
    expect(ofType('education.exam-passed').length).toBe(1);
    expect(ofType('education.exam-failed').length).toBe(0);
    expect(ofType('education.admitted').length).toBe(1);
    expect(ofType('education.enrolled').length).toBe(1);
    const order = tertiary.map((fact) => fact.type);
    expect(order.indexOf('education.exam-passed')).toBeLessThan(
      order.indexOf('education.admitted'),
    );
    expect(order.indexOf('education.admitted')).toBeLessThan(order.indexOf('education.enrolled'));
  });

  it('没有考试的年代走选拔路径，有考试的年代按制度通过率记录考试结果', () => {
    const selection = lifeOf(eraRegion({ exam: 'none' }), 'era-selection');
    expect(
      selection.facts.some(
        (fact) => fact.type === 'education.exam-passed' || fact.type === 'education.exam-failed',
      ),
    ).toBe(false);
    expect(
      selection.facts.some(
        (fact) => fact.type === 'education.admitted' && fact.details?.['path'] === 'selection',
      ),
    ).toBe(true);

    const failed = lifeOf(eraRegion({ exam: 'exam', passBase: 0 }), 'era-exam-fail');
    expect(
      failed.facts.some(
        (fact) => fact.type === 'education.exam-failed' && fact.details?.['stage'] === 'tertiary',
      ),
    ).toBe(true);
    expect(
      failed.facts.some(
        (fact) => fact.type === 'education.admitted' && fact.details?.['stage'] === 'tertiary',
      ),
    ).toBe(false);

    // 表现层：同样的制度，aptitude 高的人通过概率更高（不额外抽样，只影响概率）。
    const actor = lifeOf(eraRegion({}), 'era-probability').snapshot().actors[0];
    if (!actor) throw new Error('missing protagonist');
    const at = (aptitude: number) =>
      transitionProbability(
        eraRegion({ exam: 'exam', passBase: 0.5 }),
        { ...actor, traits: { aptitude } },
        1990,
        'tertiary',
      ).probability;
    const low = at(0);
    const high = at(1);
    expect(high).toBeGreaterThan(low);
    expect(canAffordFee({ settlement: 'urban', familyResources: 'high' }, 0, 1)).toBe(true);
    expect(canAffordFee({ settlement: 'urban', familyResources: 'low' }, 0, 1)).toBe(false);
  });

  it('同 seed 同参数两次运行的事实逐字节相同', () => {
    const first = lifeOf(
      eraRegion({ exam: 'exam', passBase: 0.5, feeShare: 0.5 }),
      'era-determinism',
    );
    const second = lifeOf(
      eraRegion({ exam: 'exam', passBase: 0.5, feeShare: 0.5 }),
      'era-determinism',
    );
    expect(canonicalJson(first.facts)).toBe(canonicalJson(second.facts));
    expect(canonicalJson(first.snapshot())).toBe(canonicalJson(second.snapshot()));
  });

  it('不变量：角色状态合法、未成年人不在职、在读与 employment.status 一致', () => {
    const region = eraRegion({ exam: 'exam', passBase: 0.6, feeShare: 0.4, family: 'middle' });
    for (const seed of ['era-inv-0', 'era-inv-1', 'era-inv-2']) {
      const snapshot = lifeOf(region, seed).snapshot();
      for (const actor of snapshot.actors) {
        expect(CharacterStateSchema.safeParse(actor).success).toBe(true);
        expect(actor.employment.status === 'student').toBe(actor.education.enrolledIn !== null);
      }
    }
  });

  it('新增事实类型都有 zh/en 模板，且占位符一一对应', () => {
    const types = [
      'exam-passed',
      'exam-failed',
      'admitted',
      'admission-failed',
      'enrolled',
      'tuition-paid',
      'cannot-afford',
    ];
    const placeholders = (text: string) =>
      [...text.matchAll(/\{\{([a-zA-Z0-9]+)\}\}/g)].map((match) => match[1]).sort();
    for (const type of types) {
      const zh = (LIFE_NARRATIVE['zh-Hans'].templates.education as Record<string, string>)[type];
      const en = (LIFE_NARRATIVE.en.templates.education as Record<string, string>)[type];
      expect(zh, type).toBeTruthy();
      expect(en, type).toBeTruthy();
      if (typeof zh !== 'string' || typeof en !== 'string') throw new Error('missing template');
      expect(placeholders(zh), type).toEqual(placeholders(en));
    }
  });
});

describe('M3-012c：学费由家庭承担（没有在世父母时才用本人账户）', () => {
  const MOTHER_ACCOUNT = 'acct:protagonist:mother';
  const FATHER_ACCOUNT = 'acct:protagonist:father';
  const OWN_ACCOUNT = 'acct:protagonist';

  function stateAtBirth(): SimState {
    const simulation = createLifeSimulation({
      seed: 'fees',
      region: eraRegion({}),
      birthDate: BIRTH,
    });
    simulation.advanceTo({ ...FOREVER, targetDate: BIRTH });
    return simulation.state;
  }

  /** 深拷贝状态：只用于把某个父母从场景里拿掉，不改动被模拟的状态。 */
  function cloneState(state: SimState): SimState {
    return JSON.parse(JSON.stringify(state)) as SimState;
  }

  it('学费按关系顺序平均分摊，余数记给第一位；学生本人账户不动', () => {
    const state = stateAtBirth();
    const me = state.actors.find((actor) => actor.id === 'char:protagonist')!;
    const mother = state.householdAccounts.find((account) => account.id === MOTHER_ACCOUNT)!;
    const father = state.householdAccounts.find((account) => account.id === FATHER_ACCOUNT)!;
    mother.balanceMinor = 100;
    father.balanceMinor = 50;

    expect(tuitionPayers(state, me).paidBy).toBe('family');
    expect(tuitionBalanceMinor(state, me)).toBe(150);
    const payment = chargeTuition(state, me, 75);
    expect(payment).toMatchObject({
      paidBy: 'family',
      balanceMinor: 75,
      payerIds: [MOTHER_ACCOUNT, FATHER_ACCOUNT],
    });
    // 75 = 37 + 38：余数 1 记给关系顺序里的第一位（母亲）。
    expect(mother.balanceMinor).toBe(62);
    expect(father.balanceMinor).toBe(13);
    expect(
      state.householdAccounts.find((account) => account.id === OWN_ACCOUNT)?.balanceMinor,
    ).toBe(0);
  });

  it('无在世父母时才用本人账户；唯一的在世父母承担全部学费', () => {
    const state = stateAtBirth();
    const me = state.actors.find((actor) => actor.id === 'char:protagonist')!;
    const mother = state.householdAccounts.find((account) => account.id === MOTHER_ACCOUNT)!;
    mother.balanceMinor = 100;

    const withoutFather = cloneState(state);
    withoutFather.actors = withoutFather.actors.filter(
      (actor) => actor.id !== 'char:protagonist:father',
    );
    const payment = chargeTuition(withoutFather, me, 75);
    expect(payment).toMatchObject({ paidBy: 'family', payerIds: [MOTHER_ACCOUNT] });
    expect(payment.balanceMinor).toBe(25);

    const orphan = cloneState(state);
    orphan.actors = orphan.actors.filter((actor) => actor.tier === 'protagonist');
    const own = orphan.householdAccounts.find((account) => account.id === OWN_ACCOUNT)!;
    own.balanceMinor = 10;
    const solo = orphan.actors[0]!;
    const soloPayment = chargeTuition(orphan, solo, 4);
    expect(soloPayment).toMatchObject({ paidBy: 'self', payerIds: [OWN_ACCOUNT] });
    expect(own.balanceMinor).toBe(6);
  });

  it('已有自己收入（在职或退休）时自己付；未独立时由家庭付', () => {
    const state = stateAtBirth();
    const me = state.actors.find((actor) => actor.id === 'char:protagonist')!;
    expect(tuitionPayers(state, me).paidBy).toBe('family');
    const working = { ...me, employment: { ...me.employment, status: 'employed' as const } };
    expect(tuitionPayers(state, working).paidBy).toBe('self');
    const retired = { ...me, employment: { ...me.employment, status: 'retired' as const } };
    expect(tuitionPayers(state, retired).paidBy).toBe('self');
  });

  it('家境贫寒时按付款方余额之和判断能否负担', () => {
    const origin = { settlement: 'urban', familyResources: 'low' } as const;
    expect(canAffordFee(origin, 0, 100)).toBe(false);
    expect(canAffordFee(origin, 99, 100)).toBe(false);
    expect(canAffordFee(origin, 100, 100)).toBe(true);
    expect(canAffordFee({ settlement: 'urban', familyResources: 'middle' }, -1, 100)).toBe(true);
  });

  it('家境一般的全额学费记在父母账户（可为负），学生本人账户保持 0', () => {
    const region = eraRegion({ feeShare: 0.5, family: 'middle' });
    const simulation = createLifeSimulation({
      seed: 'era-family-pays',
      region,
      birthDate: BIRTH,
      decisions: { [afterSecondaryDecisionKey(18)]: 'apply-university' },
    });
    simulation.advanceTo({ ...FOREVER, targetDate: '1988-05-04' });
    const paid = simulation.facts.find(
      (fact) => fact.type === 'education.tuition-paid' && fact.details?.['stage'] === 'tertiary',
    );
    expect(paid?.details).toMatchObject({
      paidBy: 'family',
      feeMinor: LIVING_COST * 0.5,
      balanceMinor: -LIVING_COST * 0.5,
    });
    const snapshot = simulation.snapshot();
    expect(
      snapshot.householdAccounts.find((account) => account.id === 'acct:protagonist')?.balanceMinor,
    ).toBe(0);
    const parents = snapshot.householdAccounts.filter(
      (account) => account.id !== 'acct:protagonist',
    );
    expect(parents.reduce((sum, account) => sum + account.balanceMinor, 0)).toBe(
      -LIVING_COST * 0.5,
    );
  });
});

describe('M3-012c：年度重点仍然作用在升学与升学考试上（M3-041 回归）', () => {
  // 夹具（虚构）：六三三四学制、中学 6 年、大学 4 年，中学生毕业当年（18 岁）决定升学。
  // 升学考试只作用于大学；中学升学用 secondaryContinuationP。
  function examRegion(passBase: number, secondaryP = 1): RegionModel {
    return {
      // 义务教育年限设为 0，中学升学才会真的做选拔抽样（否则强制入学、年度重点无从体现）。
      ...eraRegion({ exam: 'exam', passBase, compulsoryYears: 0 }),
      secondaryContinuationP: () => secondaryP,
    };
  }

  function runFocused(seed: string, region: RegionModel, focus: 'balanced' | 'study' | 'leisure') {
    const simulation = createLifeSimulation({
      seed,
      region,
      birthDate: BIRTH,
      decisions: { [afterSecondaryDecisionKey(18)]: 'apply-university' },
    });
    // 12 岁：小学毕业那年的生日排 primary-exit（中学升学抽样读这一年的重点）。
    simulation.preset(yearlyFocusDecisionKey(12), focus);
    // 18 岁：中学毕业那年的生日排 secondary-exit，after-secondary 继承它的载荷（大学考试读这一年的重点）。
    simulation.preset(yearlyFocusDecisionKey(18), focus);
    simulation.advanceTo({ ...FOREVER, targetDate: '1989-05-04' });
    return simulation.facts;
  }

  it('学习重点提高中学升学与大学升学考试的通过率（配对种子、300 对）', () => {
    const region = examRegion(0.5, 0.5);
    const counts = {
      study: { secondary: 0, tertiary: 0 },
      leisure: { secondary: 0, tertiary: 0 },
    };
    for (let index = 0; index < 300; index += 1) {
      const seed = `focus-chain-${index}`;
      for (const focus of ['study', 'leisure'] as const) {
        const facts = runFocused(seed, region, focus);
        if (facts.some((fact) => fact.type === 'education.secondary-started'))
          counts[focus].secondary += 1;
        if (
          facts.some(
            (fact) =>
              fact.type === 'education.exam-passed' && fact.details?.['stage'] === 'tertiary',
          )
        )
          counts[focus].tertiary += 1;
      }
    }
    // 中学升学：0.5×1.15 对 0.5×0.95；大学考试：0.5×表现×1.15 对 0.5×表现×0.95。
    expect(counts.study.secondary).toBeGreaterThan(counts.leisure.secondary);
    expect(counts.study.tertiary).toBeGreaterThan(counts.leisure.tertiary);
  }, 60_000);

  it('大学考试抽样落在 [0.5, 0.575) 时：学习重点通过、均衡重点不通过', () => {
    const key = `choice.after-secondary|char:protagonist|age:18`;
    // 用派生随机流挑一个恰好落在 [0.5, 0.575) 的种子，并把制度的 passBase 设成
    // 「均衡」下考试概率正好 0.5（按该种子的 aptitude 反推），于是「学习」恰好是 0.575。
    let chosen: { seed: string; draw: number; passBase: number } | undefined;
    for (let index = 0; index < 500 && !chosen; index += 1) {
      const seed = `exam-window-${index}`;
      const probe = createLifeSimulation({
        seed,
        region: examRegion(0.5),
        birthDate: BIRTH,
      });
      probe.advanceTo({ ...FOREVER, targetDate: BIRTH });
      const actor = probe.state.actors.find((candidate) => candidate.id === 'char:protagonist');
      if (!actor) throw new Error('missing protagonist');
      const draw = deriveStream(seed, key).next();
      if (draw > 0.5 && draw < 0.575) {
        chosen = { seed, draw, passBase: 0.5 / performanceFactor(actor.traits.aptitude) };
      }
    }
    if (!chosen) throw new Error('no seed with an exam draw inside [0.5, 0.575)');

    const balanced = runFocused(chosen.seed, examRegion(chosen.passBase), 'balanced');
    const study = runFocused(chosen.seed, examRegion(chosen.passBase), 'study');
    const failed = balanced.find(
      (fact) => fact.type === 'education.exam-failed' && fact.details?.['stage'] === 'tertiary',
    );
    const passed = study.find(
      (fact) => fact.type === 'education.exam-passed' && fact.details?.['stage'] === 'tertiary',
    );
    expect(failed).toBeDefined();
    expect(passed).toBeDefined();
    expect(
      balanced.some(
        (fact) => fact.type === 'education.exam-passed' && fact.details?.['stage'] === 'tertiary',
      ),
    ).toBe(false);
    expect(
      study.some(
        (fact) => fact.type === 'education.exam-failed' && fact.details?.['stage'] === 'tertiary',
      ),
    ).toBe(false);
    // 事实里的 passRate 记录的是制度基础通过率（0.5，不含年度重点乘数，M3-012b 的口径）；
    // 年度重点只作用在那一次抽样上：0.5 的抽样在「学习」下变成 0.575。
    expect(failed?.details?.['passRate']).toBeCloseTo(0.5, 12);
    expect(passed?.details?.['passRate']).toBeCloseTo(0.5, 12);
    expect(chosen.draw).toBeGreaterThan(0.5);
    expect(chosen.draw).toBeLessThan(0.575);
  });
});
