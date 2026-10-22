import {
  addMinor,
  scaleMinor,
  type CharacterState,
  type CurrencyVersion,
  type HouseholdAccount,
} from '@lifesim/content-schema';
import { addYears, yearOf, type EventDefinition, type SimState } from '@lifesim/simulation-core';
import { currencyLabel, readMacro, type EducationSystem, type RegionModel } from './region.ts';
import { EVENT, PRIORITY, account, ageAt, causes, evidenceId } from './shared.ts';
import { focusProbability } from './yearly-focus.ts';

/**
 * 教育路径（GDD §8.2；M3-012b）：学制、升学考试与学费由「国家 + 年份」决定。
 *
 * 一次升学只抽一次随机：制度给出的**资格考试**基础通过率（`entranceExam.passBase`）
 * 与个人**表现**（aptitude）合成一个概率，再由 `ctx.random` 抽样；抽中即通过考试并录取，
 * 未抽中即未通过考试（有考试的年代）或未录取（无考试的年代按制度的选拔路径处理）。
 * 录取与入学分别记录：录取是结果，入学还要看家庭能否负担当年学费。
 *
 * 金额只记**名义**值（`feeShare × 当年生活费`，整数最小单位），不做 CPI 折算（折算归 M3-014 / Q14）。
 */

/** 教育阶段的规范名，供事实 details 与双语模板使用。 */
export type EducationStage = 'primary' | 'secondary' | 'tertiary';

/** 升学路径：有考试的年代走考试，没有考试的年代走制度规定的选拔（D 级设计假设）。 */
export type EducationPath = 'exam' | 'selection';

/**
 * 表现系数（D 级设计假设）：aptitude 0 → 0.6、1 → 1.4，与制度给的基础通过率相乘。
 * 这是「资格考试 + 表现」两层里的表现层，不额外抽样。
 */
export function performanceFactor(aptitude: number): number {
  return 0.6 + 0.8 * aptitude;
}

/**
 * 该阶段是否完整落在义务教育年限内（起点与终点都不超出）。
 * 只有完整覆盖才按免费处理；部分覆盖（例如义务教育只覆盖到初中）按非义务教育收费。
 */
export function stageIsCompulsory(system: EducationSystem, stage: EducationStage): boolean {
  if (stage === 'primary') return system.primaryYears <= system.compulsoryYears;
  if (stage === 'secondary') {
    return system.primaryYears + system.secondaryYears <= system.compulsoryYears;
  }
  return false;
}

/** 该年该阶段的学费（名义，整数最小单位）：义务教育阶段为 0，否则 feeShare × 当年生活费。 */
export function educationFeeMinor(
  region: RegionModel,
  origin: CharacterState['origin'],
  year: number,
  stage: EducationStage,
  currency: CurrencyVersion,
): number {
  const system = region.queries.education.systemAt(year);
  if (stageIsCompulsory(system, stage)) return 0;
  return scaleMinor(
    region.annualLivingCostMinor(year, origin.settlement, currency),
    system.feeShare,
  );
}

/**
 * 家庭能否负担（D 级设计假设）：家境不是「贫寒」时视为家庭可以继续垫付（付款方余额可为负）；
 * 家境贫寒时按**付款方余额之和**判断，不够就交不起。M3-014 接入家庭经济后替换这条规则。
 *
 * M3-012c：`balanceMinor` 由调用方传**付款方**（未独立时是在世父母）的余额合计，
 * 不再是学生本人账户的余额——孩子不该因为上学背债（见 {@link tuitionPayers}）。
 */
export function canAffordFee(
  origin: CharacterState['origin'],
  balanceMinor: number,
  feeMinor: number,
): boolean {
  if (feeMinor <= 0) return true;
  if (origin.familyResources !== 'low') return true;
  return balanceMinor >= feeMinor;
}

/** 学费的付款方：未独立时由家庭承担，否则用本人账户。 */
export type TuitionPayer = 'family' | 'self';

export interface TuitionPayment {
  readonly paidBy: TuitionPayer;
  /** 付款方账户在付款后的余额合计（家庭付款时是在世父母之和）。 */
  readonly balanceMinor: number;
  readonly payerIds: readonly string[];
}

/**
 * 在世父母的账户，按 `state.relationships` 里亲子关系的顺序（`family.ts` 先创建母亲、
 * 再创建父亲）。已故父母不参与分摊。
 */
export function livingParentAccounts(state: SimState, actor: CharacterState): HouseholdAccount[] {
  const accounts: HouseholdAccount[] = [];
  for (const relationship of state.relationships) {
    if (relationship.kind !== 'parent-child' || relationship.toId !== actor.id) continue;
    if (relationship.fromId === actor.id) continue;
    const parent = state.actors.find((candidate) => candidate.id === relationship.fromId);
    if (!parent || parent.vitalStatus.kind !== 'alive') continue;
    accounts.push(account(state, parent));
  }
  return accounts;
}

/**
 * 学费从谁出（M3-012c）：自己在工作（受雇或已退休领养老金）时用本人账户；未独立
 * （儿童、在读、还没开始工作）时由**在世父母**承担，按关系顺序平均分摊；没有在世父母时
 * 才用本人账户。这与 M3-042「未独立时日常花费由家里承担」是同一口径——两处都只在
 * 没有自己收入时把支出记到家庭，避免学生账户为负抬高本人发病率与死亡率。
 */
export function tuitionPayers(
  state: SimState,
  actor: CharacterState,
): { paidBy: TuitionPayer; accounts: HouseholdAccount[] } {
  const { status } = actor.employment;
  if (status !== 'employed' && status !== 'retired') {
    const parents = livingParentAccounts(state, actor);
    if (parents.length > 0) return { paidBy: 'family', accounts: parents };
  }
  return { paidBy: 'self', accounts: [account(state, actor)] };
}

/** 付款方可用于支付学费的余额合计；家境贫寒时按这个数判断能否负担。 */
export function tuitionBalanceMinor(state: SimState, actor: CharacterState): number {
  return tuitionPayers(state, actor).accounts.reduce(
    (sum, target) => addMinor(sum, target.balanceMinor),
    0,
  );
}

/** 扣学费：按关系顺序平均分摊，余数记给第一位；返回付款方付款后的余额合计。 */
export function chargeTuition(
  state: SimState,
  actor: CharacterState,
  feeMinor: number,
): TuitionPayment {
  if (feeMinor < 0) throw new RangeError('Tuition cannot be negative');
  const { paidBy, accounts } = tuitionPayers(state, actor);
  if (feeMinor > 0) {
    const share = Math.floor(feeMinor / accounts.length);
    const remainder = feeMinor - share * accounts.length;
    accounts.forEach((target, index) => {
      const amount = share + (index === 0 ? remainder : 0);
      target.balanceMinor = addMinor(target.balanceMinor, -amount);
    });
  }
  return {
    paidBy,
    balanceMinor: accounts.reduce((sum, target) => addMinor(sum, target.balanceMinor), 0),
    payerIds: accounts.map((target) => target.id),
  };
}

export interface TransitionProbability {
  /** 一次抽样的通过/录取概率。 */
  readonly probability: number;
  readonly path: EducationPath;
  /** 该年代是否有升学考试（决定是否记录考试事实）。 */
  readonly exam: boolean;
}

/**
 * 把旧的单一 continue/admission 概率拆成两层：制度给的基础门槛（资格考试）× 个人表现，
 * 仍然只用一个概率、一次抽样。没有考试的年代退回该地区的选拔概率。
 */
export function transitionProbability(
  region: RegionModel,
  actor: CharacterState,
  year: number,
  stage: 'secondary' | 'tertiary',
): TransitionProbability {
  const system = region.queries.education.systemAt(year);
  // 制度里的 `entranceExam` 指升入高等教育的资格考试（高考 / 大学入学考试 / вступительные экзамены）。
  // 本模型的 secondary 是初中阶段：义务教育内的升学不用它，学生按该地区的延续概率升学。
  if (stage === 'tertiary' && system.entranceExam.kind === 'exam') {
    const probability = system.entranceExam.passBase * performanceFactor(actor.traits.aptitude);
    return { probability: Math.max(0, Math.min(1, probability)), path: 'exam', exam: true };
  }
  const probability =
    stage === 'secondary'
      ? region.secondaryContinuationP(year, actor.origin)
      : region.universityAdmissionP(year, actor.traits.aptitude);
  return { probability, path: 'selection', exam: false };
}

/** 学费只在主角身上结算：NPC 的家庭收支留给 M3-014/018，不为 NPC 制造债务。 */
function paysFees(actor: CharacterState): boolean {
  return actor.tier === 'protagonist';
}

export function educationEvents(region: RegionModel): EventDefinition[] {
  const tableEvidence = evidenceId(region, 'education');

  const primaryEntry: EventDefinition = {
    type: EVENT.primaryEntry,
    version: 2,
    priority: PRIORITY.education,
    handle(ctx) {
      const actor = ctx.actor(ctx.occurrence.entityId);
      const year = yearOf(ctx.at);
      const evidenceIds = [tableEvidence];
      if (
        !ctx.random.chance(
          focusProbability(
            ctx,
            region.primaryEnrollmentP(year, actor.origin.settlement),
            'education',
          ),
        )
      ) {
        actor.education.lastFactId = ctx.emit({
          type: 'education.not-enrolled',
          outcomeCode: 'not-enrolled',
          actorIds: [actor.id],
          evidenceIds,
        });
        return;
      }
      const { currency } = readMacro(ctx.state);
      const feeMinor = paysFees(actor)
        ? educationFeeMinor(region, actor.origin, year, 'primary', currency)
        : 0;
      // 学费由家庭（在世父母）承担，只有没有父母或已有自己收入时才动本人账户（M3-012c）。
      const balanceMinor = tuitionBalanceMinor(ctx.state, actor);
      if (!canAffordFee(actor.origin, balanceMinor, feeMinor)) {
        actor.education.lastFactId = ctx.emit({
          type: 'education.cannot-afford',
          outcomeCode: 'cannot-afford',
          actorIds: [actor.id],
          evidenceIds,
          details: {
            stage: 'primary',
            feeMinor,
            balanceMinor,
            currency: currencyLabel(currency),
          },
        });
        return;
      }
      const charged = feeMinor > 0 ? chargeTuition(ctx.state, actor, feeMinor) : null;
      const paid = charged
        ? ctx.emit({
            type: 'education.tuition-paid',
            outcomeCode: 'paid',
            actorIds: [actor.id],
            evidenceIds,
            details: {
              stage: 'primary',
              feeMinor,
              balanceMinor: charged.balanceMinor,
              paidBy: charged.paidBy,
              currency: currencyLabel(currency),
            },
          })
        : null;
      actor.education.enrolledIn = 'primary';
      actor.employment.status = 'student';
      actor.education.lastFactId = ctx.emit({
        type: 'education.primary-started',
        outcomeCode: 'enrolled',
        actorIds: [actor.id],
        causes: causes(paid),
        evidenceIds,
        details: { stage: 'primary' },
      });
    },
  };

  const primaryExit: EventDefinition = {
    type: EVENT.primaryExit,
    version: 2,
    priority: PRIORITY.education,
    handle(ctx) {
      const actor = ctx.actor(ctx.occurrence.entityId);
      const year = yearOf(ctx.at);
      const evidenceIds = [tableEvidence];
      actor.education.completed = 'primary';
      actor.education.enrolledIn = null;
      actor.employment.status = 'not-in-labor-force';
      const completed = ctx.emit({
        type: 'education.primary-completed',
        outcomeCode: 'completed',
        actorIds: [actor.id],
        evidenceIds,
      });
      // 义务教育覆盖的中学阶段是强制入学：制度保证学位，不做选拔抽样（义务教育阶段也免学费）。
      // 合成地区没有义务教育（compulsoryYears = 0），所以合成人生的抽样与旧规则逐位相同。
      const compulsory = stageIsCompulsory(region.queries.education.systemAt(year), 'secondary');
      const transition = transitionProbability(region, actor, year, 'secondary');
      const passed = compulsory
        ? true
        : ctx.random.chance(focusProbability(ctx, transition.probability, 'education'));
      let cause = completed;
      if (transition.exam) {
        cause = ctx.emit({
          type: passed ? 'education.exam-passed' : 'education.exam-failed',
          outcomeCode: passed ? 'passed' : 'failed',
          actorIds: [actor.id],
          causes: [completed],
          evidenceIds,
          details: { stage: 'secondary', passRate: transition.probability },
        });
      }
      if (!passed) {
        // 有考试的年代：考试没过就是这次升学的结论（不再另记「未录取」）；
        // 没有考试的年代：录取结果单独记录。
        const failed = transition.exam
          ? cause
          : ctx.emit({
              type: 'education.admission-failed',
              outcomeCode: 'rejected',
              actorIds: [actor.id],
              causes: [cause],
              evidenceIds,
              details: { stage: 'secondary', path: transition.path },
            });
        actor.education.lastFactId = ctx.emit({
          type: 'education.left-school',
          outcomeCode: 'left',
          actorIds: [actor.id],
          causes: [failed],
          evidenceIds,
        });
        return;
      }
      const admitted = ctx.emit({
        type: 'education.admitted',
        outcomeCode: 'admitted',
        actorIds: [actor.id],
        causes: [cause],
        evidenceIds,
        details: { stage: 'secondary', path: transition.path },
      });
      const { currency } = readMacro(ctx.state);
      const feeMinor = paysFees(actor)
        ? educationFeeMinor(region, actor.origin, year, 'secondary', currency)
        : 0;
      // 学费由家庭（在世父母）承担，只有没有父母或已有自己收入时才动本人账户（M3-012c）。
      const balanceMinor = tuitionBalanceMinor(ctx.state, actor);
      if (!canAffordFee(actor.origin, balanceMinor, feeMinor)) {
        const unaffordable = ctx.emit({
          type: 'education.cannot-afford',
          outcomeCode: 'cannot-afford',
          actorIds: [actor.id],
          causes: [admitted],
          evidenceIds,
          details: {
            stage: 'secondary',
            feeMinor,
            balanceMinor,
            currency: currencyLabel(currency),
          },
        });
        actor.education.lastFactId = ctx.emit({
          type: 'education.left-school',
          outcomeCode: 'left',
          actorIds: [actor.id],
          causes: [unaffordable],
          evidenceIds,
        });
        return;
      }
      const charged = feeMinor > 0 ? chargeTuition(ctx.state, actor, feeMinor) : null;
      const paid = charged
        ? ctx.emit({
            type: 'education.tuition-paid',
            outcomeCode: 'paid',
            actorIds: [actor.id],
            causes: [admitted],
            evidenceIds,
            details: {
              stage: 'secondary',
              feeMinor,
              balanceMinor: charged.balanceMinor,
              paidBy: charged.paidBy,
              currency: currencyLabel(currency),
            },
          })
        : null;
      actor.education.enrolledIn = 'secondary';
      actor.employment.status = 'student';
      actor.education.lastFactId = ctx.emit({
        type: 'education.secondary-started',
        outcomeCode: 'enrolled',
        actorIds: [actor.id],
        causes: causes(paid ?? admitted),
        evidenceIds,
        details: { stage: 'secondary' },
      });
    },
  };

  const secondaryExit: EventDefinition = {
    type: EVENT.secondaryExit,
    version: 2,
    priority: PRIORITY.education,
    handle(ctx) {
      const actor = ctx.actor(ctx.occurrence.entityId);
      actor.education.completed = 'secondary';
      actor.education.enrolledIn = null;
      actor.employment.status = 'not-in-labor-force';
      const completed = ctx.emit({
        type: 'education.secondary-completed',
        outcomeCode: 'completed',
        actorIds: [actor.id],
        evidenceIds: [tableEvidence],
      });
      actor.education.lastFactId = completed;
      // 中学可能在法定工作年龄之前结束（例如六岁入学、中学三年）：把「升学或工作」的
      // 重大决定放到能合法工作的那一年，避免出现「15 岁就必须决定工作」的选项。
      const decisionAge = Math.max(ageAt(actor, ctx), region.rules.minimumWorkingAge);
      ctx.schedule({
        type: EVENT.afterSecondary,
        payload: ctx.occurrence.payload,
        at: addYears(actor.birthDate, decisionAge),
        entityId: actor.id,
        period: `age:${decisionAge}`,
        causes: [completed],
      });
    },
  };

  /** 重大决定：在制度允许时报考上一级学校，或直接工作（M1 要求的「玩家干预一次重大选择」）。 */
  const afterSecondary: EventDefinition = {
    type: EVENT.afterSecondary,
    version: 2,
    priority: PRIORITY.afterSecondary,
    decision: {
      major: true,
      actorId: (occurrence) => occurrence.entityId,
      options(ctx) {
        const actor = ctx.actor(ctx.occurrence.entityId);
        return [
          {
            id: 'apply-university',
            eligible: actor.education.completed === 'secondary',
            scores: { knowledge: 0.9, wealth: 0.4, risk: 0.5, stability: -0.3 },
          },
          {
            // 「决定开始工作」本身不受年龄限制：真正的求职在到达法定工作年龄后才安排
            // （见 handler 的 searchForWork）。中学毕业早于法定工作年龄的国家不会因此失去选项。
            id: 'start-work',
            eligible: true,
            scores: { wealth: 0.5, stability: 0.6, family: 0.3, knowledge: -0.1 },
          },
        ];
      },
    },
    handle(ctx) {
      const actor = ctx.actor(ctx.occurrence.entityId);
      const choice = ctx.choice;
      if (!choice) throw new Error('Decision without a choice');
      const searchForWork = (because: string) => {
        // 未成年不排求职：年度生日事件会在到达法定工作年龄后再安排。
        if (ageAt(actor, ctx) < region.rules.minimumWorkingAge) return;
        ctx.schedule({
          type: EVENT.jobSearch,
          payload: ctx.occurrence.payload,
          at: ctx.at,
          entityId: actor.id,
          period: `age:${ageAt(actor, ctx)}`,
          causes: [because],
        });
      };
      if (choice.optionId === 'start-work') {
        searchForWork(choice.factId);
        return;
      }
      const year = yearOf(ctx.at);
      const evidenceIds = [tableEvidence];
      const transition = transitionProbability(region, actor, year, 'tertiary');
      const passed = ctx.random.chance(focusProbability(ctx, transition.probability, 'education'));
      let cause = choice.factId;
      if (transition.exam) {
        cause = ctx.emit({
          type: passed ? 'education.exam-passed' : 'education.exam-failed',
          outcomeCode: passed ? 'passed' : 'failed',
          actorIds: [actor.id],
          causes: [choice.factId],
          evidenceIds,
          details: { stage: 'tertiary', passRate: transition.probability },
        });
      }
      if (!passed) {
        const failed = transition.exam
          ? cause
          : ctx.emit({
              type: 'education.admission-failed',
              outcomeCode: 'rejected',
              actorIds: [actor.id],
              causes: [cause],
              evidenceIds,
              details: { stage: 'tertiary', path: transition.path },
            });
        actor.education.lastFactId = failed;
        searchForWork(failed);
        return;
      }
      const admitted = ctx.emit({
        type: 'education.admitted',
        outcomeCode: 'admitted',
        actorIds: [actor.id],
        causes: [cause],
        evidenceIds,
        details: { stage: 'tertiary', path: transition.path },
      });
      const { currency } = readMacro(ctx.state);
      const feeMinor = paysFees(actor)
        ? educationFeeMinor(region, actor.origin, year, 'tertiary', currency)
        : 0;
      // 学费由家庭（在世父母）承担，只有没有父母或已有自己收入时才动本人账户（M3-012c）。
      const balanceMinor = tuitionBalanceMinor(ctx.state, actor);
      if (!canAffordFee(actor.origin, balanceMinor, feeMinor)) {
        const unaffordable = ctx.emit({
          type: 'education.cannot-afford',
          outcomeCode: 'cannot-afford',
          actorIds: [actor.id],
          causes: [admitted],
          evidenceIds,
          details: {
            stage: 'tertiary',
            feeMinor,
            balanceMinor,
            currency: currencyLabel(currency),
          },
        });
        actor.education.lastFactId = unaffordable;
        searchForWork(unaffordable);
        return;
      }
      const charged = feeMinor > 0 ? chargeTuition(ctx.state, actor, feeMinor) : null;
      const paid = charged
        ? ctx.emit({
            type: 'education.tuition-paid',
            outcomeCode: 'paid',
            actorIds: [actor.id],
            causes: [admitted],
            evidenceIds,
            details: {
              stage: 'tertiary',
              feeMinor,
              balanceMinor: charged.balanceMinor,
              paidBy: charged.paidBy,
              currency: currencyLabel(currency),
            },
          })
        : null;
      actor.education.enrolledIn = 'tertiary';
      actor.employment.status = 'student';
      actor.education.lastFactId = ctx.emit({
        type: 'education.enrolled',
        outcomeCode: 'enrolled',
        actorIds: [actor.id],
        causes: causes(paid ?? admitted),
        evidenceIds,
        details: { stage: 'tertiary' },
      });
    },
  };

  const tertiaryExit: EventDefinition = {
    type: EVENT.tertiaryExit,
    version: 2,
    priority: PRIORITY.education,
    handle(ctx) {
      const actor = ctx.actor(ctx.occurrence.entityId);
      actor.education.completed = 'tertiary';
      actor.education.enrolledIn = null;
      actor.employment.status = 'not-in-labor-force';
      const completed = ctx.emit({
        type: 'education.tertiary-completed',
        outcomeCode: 'completed',
        actorIds: [actor.id],
        causes: causes(...ctx.occurrence.causeFactIds),
        evidenceIds: [tableEvidence],
      });
      actor.education.lastFactId = completed;
      ctx.schedule({
        type: EVENT.jobSearch,
        payload: ctx.occurrence.payload,
        at: ctx.at,
        entityId: actor.id,
        period: `age:${ageAt(actor, ctx)}`,
        causes: [completed],
      });
    },
  };

  return [primaryEntry, primaryExit, secondaryExit, afterSecondary, tertiaryExit];
}
