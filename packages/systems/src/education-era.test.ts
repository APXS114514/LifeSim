import { CharacterStateSchema } from '@lifesim/content-schema';
import { canonicalJson } from '@lifesim/simulation-core';
import { describe, expect, it } from 'vitest';
import { FIXTURE_REGION } from './__fixtures__/focus-region.ts';
import {
  canAffordFee,
  educationFeeMinor,
  stageIsCompulsory,
  transitionProbability,
} from './education.ts';
import { afterSecondaryDecisionKey, createLifeSimulation } from './module.ts';
import { LIFE_NARRATIVE } from './narrative.ts';
import type { EducationSystem, RegionModel } from './region.ts';

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
