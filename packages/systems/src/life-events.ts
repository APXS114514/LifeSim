import {
  addMinor,
  scaleMinor,
  type CharacterState,
  type CurrencyVersion,
  type FactDetails,
  type ISODate,
} from '@lifesim/content-schema';
import {
  addYears,
  ageOn,
  yearOf,
  type DecisionOption,
  type EventContext,
  type EventDefinition,
  type SimState,
} from '@lifesim/simulation-core';
import { z } from 'zod';
import { currencyLabel, readMacro, type RegionModel } from './region.ts';
import { PRIORITY, account, isIndependent } from './shared.ts';

/**
 * 通用人生事件原型（M3-042）：一个数据驱动的目录与一个公共年度运行器。
 *
 * - 每个原型是一条数据（年龄与年代窗口、年度概率、一生上限、变体与后果），由同一个工厂生成事件处理器；
 *   不为单个事件手写调度。概率全部是 D 级设计假设，集中登记在目录里并由 {@link lifeEventDisclosure} 披露。
 * - 随机流：事件键 `life.<原型>|<实体>|year:<年份>`，第一次抽样就是「今年是否发生」，
 *   所以新增或修改一个原型不会改变其他原型的抽样。
 * - 链条：生日只在原型**第一次**进入年龄与年代窗口的那一年启动链条（`count: 0`）；之后由处理器把
 *   已发生次数带到下一年。每年重新从 0 排程会在链条终止后重置一生上限，所以不这样做。
 * - 有选择的原型分两段：先抽「今年有没有这件事」，发生了才排一条非重大决策事件，避免在没发生的年份提问。
 */

export interface AgeWindow {
  readonly from: number;
  readonly to: number;
}

export interface EraWindow {
  readonly from: number;
  /** null = 无上限（内容在该年代之后仍然成立）。 */
  readonly to: number | null;
}

export interface PrototypeInput {
  readonly at: ISODate;
  readonly year: number;
  readonly age: number;
  readonly state: SimState;
  readonly actor: CharacterState;
  readonly region: RegionModel;
  readonly currency: CurrencyVersion;
  /** 决策事件的选项 ID；普通事件为 null。 */
  readonly choice: string | null;
  /** 原型的主题（例如爱好、技能）在第一段抽出后的取值；没有主题时为 null。 */
  readonly topic: string | null;
}

export interface VariantOutcome {
  /** 事实的 outcomeCode；缺省用变体 id。 */
  readonly outcomeCode?: string;
  readonly details?: FactDetails;
}

export interface LifeEventVariant {
  readonly id: string;
  /** 变体自己的年代窗口；缺省继承原型。 */
  readonly era?: EraWindow;
  /** 纯函数：只读 input；不得抽随机数、不得写状态。 */
  readonly when?: (input: PrototypeInput) => boolean;
  /** 只改 input.state / input.actor；金额只通过本文件的工具函数写。 */
  readonly apply: (input: PrototypeInput) => VariantOutcome;
}

export interface LifeEventDecision {
  /** 纯函数（内核会用它做只读校验）。 */
  readonly options: (input: PrototypeInput) => DecisionOption[];
  /** 全部选项 ID（固定顺序），用于披露与叙事模板核对。 */
  readonly optionIds: readonly string[];
  /** 本任务只允许非重大决定。 */
  readonly major: false;
  /**
   * 有它时：第一段就发出变体事实（例如「找到一件爱好」），第二段只按选项写后果，叙事由 `decision.made` 承担；
   * 没有它时：第二段按选项选变体并发事实（例如「学完了／没坚持」）。两种都只在事件发生后才提问。
   */
  readonly settle?: (input: PrototypeInput) => void;
}

export interface LifeEventTopic {
  readonly id: string;
  /** 主题自己的年代窗口；缺省不限。 */
  readonly era?: EraWindow;
}

export interface LifeEventPrototype {
  readonly id: string;
  readonly ages: AgeWindow;
  readonly era: EraWindow;
  readonly annualProbability: number;
  readonly lifetimeCap: number;
  /** true = 资格只看年龄与年代（覆盖率依赖它）。 */
  readonly coverageFloor: boolean;
  /** 只有非覆盖型原型可以提供；纯函数。 */
  readonly eligible?: (input: PrototypeInput) => boolean;
  /** 发生后等权抽一个主题（例如爱好），按目录顺序；只有 1 个可用时不消耗抽样。 */
  readonly topics?: readonly LifeEventTopic[];
  /** 纯函数：主题此刻是否还能抽（例如已经有的爱好不再「找到」一次）。 */
  readonly topicAvailable?: (input: PrototypeInput, topic: string) => boolean;
  readonly variants: readonly LifeEventVariant[];
  /** 有决策时，变体由选项决定（`when` 读 `input.choice`），第一段不抽变体。 */
  readonly decision?: LifeEventDecision;
}

export interface LifeEventDisclosureRow {
  readonly id: string;
  readonly ages: AgeWindow;
  readonly era: EraWindow;
  readonly annualProbability: number;
  readonly lifetimeCap: number;
  readonly evidenceGrade: 'D';
  readonly coverageFloor: boolean;
  readonly hasDecision: boolean;
  readonly templateIds: readonly string[];
}

export const LIFE_EVENT_PRIORITY = PRIORITY.lifeEvent;
export const LIFE_EVENT_DECISION_PRIORITY = PRIORITY.lifeEventDecision;

export const LifeEventPayloadSchema = z.strictObject({
  count: z.number().int().nonnegative(),
  topic: z.string().min(1).optional(),
});
type LifeEventPayload = z.infer<typeof LifeEventPayloadSchema>;

export function lifeEventType(id: string): string {
  return `life.${id}`;
}

export function lifeEventChoiceType(id: string): string {
  return `${lifeEventType(id)}.choice`;
}

export function inEra(era: EraWindow, year: number): boolean {
  return year >= era.from && (era.to === null || year <= era.to);
}

/** 这个原型在（生日年龄、日历年）上可抽：只看年龄与年代窗口。 */
export function inWindow(prototype: LifeEventPrototype, age: number, year: number): boolean {
  return age >= prototype.ages.from && age <= prototype.ages.to && inEra(prototype.era, year);
}

// ---------------------------------------------------------------------------
// 后果写入的公共工具（目录与测试共用）

export function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function nudgeStress(input: PrototypeInput, delta: number): void {
  input.actor.wellbeing.stress = clamp01(input.actor.wellbeing.stress + delta);
}

export function nudgeTies(input: PrototypeInput, delta: number): void {
  input.actor.social.ties = clamp01(input.actor.social.ties + delta);
}

/**
 * 只改主角对父母这一侧的感受（`kind === 'parent-child'` 且 `toId === actor.id` 的 `bonds[actor.id]`）。
 * 没有关系就跳过；已故的父母也跳过：日常小事不改对逝者的感受。
 */
export function nudgeParentBonds(
  input: PrototypeInput,
  delta: { trust?: number; intimacy?: number },
): void {
  const { actor, state } = input;
  for (const relationship of state.relationships) {
    if (relationship.kind !== 'parent-child' || relationship.toId !== actor.id) continue;
    const parent = state.actors.find((candidate) => candidate.id === relationship.fromId);
    if (!parent || parent.vitalStatus.kind === 'deceased') continue;
    const bond = relationship.bonds[actor.id];
    if (!bond) continue;
    if (delta.trust !== undefined) bond.trust = clamp01(bond.trust + delta.trust);
    if (delta.intimacy !== undefined) bond.intimacy = clamp01(bond.intimacy + delta.intimacy);
  }
}

/** share × 当年该城乡的生活费，整数最小单位。 */
export function livingCostShare(input: PrototypeInput, share: number): number {
  const { region, year, actor, currency } = input;
  return scaleMinor(region.annualLivingCostMinor(year, actor.origin.settlement, currency), share);
}

/**
 * 花费 share × 当年生活费，返回金额（整数最小单位）。
 *
 * 只有已独立的主角从自己的账户付：未独立（儿童、在读）时主角没有年度收支结算，日常开销由家里的生活费承担，
 * 与现有模型一致；若从余额为 0 的儿童账户扣钱，会让 `isPoor` 变真、抬高发病率，等于用日常小事改死亡风险。
 */
export function chargeLivingCostShare(input: PrototypeInput, share: number): number {
  const cost = livingCostShare(input, share);
  if (cost === 0 || !isIndependent(input.actor, input.age, input.region)) return cost;
  const target = account(input.state, input.actor);
  target.balanceMinor = addMinor(target.balanceMinor, -cost);
  return cost;
}

/** 这笔花费是否负担得起：未独立时由家里承担，总是负担得起；已独立时看自己的余额。 */
export function canAffordLivingCostShare(input: PrototypeInput, share: number): boolean {
  if (!isIndependent(input.actor, input.age, input.region)) return true;
  return account(input.state, input.actor).balanceMinor >= livingCostShare(input, share);
}

/** 花费事实的 `details`：金额与币制标签（沿用 finance / health 的写法）。 */
export function costDetails(input: PrototypeInput, costMinor: number): FactDetails {
  return { costMinor, currency: currencyLabel(input.currency) };
}

/** 同 id 只保留最高等级、`since` 记第一次；已有 12 条时新的 id 被跳过（不抛错）。 */
export function addSkill(input: PrototypeInput, id: string, level: number): void {
  const { skills } = input.actor;
  const existing = skills.find((skill) => skill.id === id);
  if (existing) {
    existing.level = Math.max(existing.level, clamp01(level));
    return;
  }
  if (skills.length >= 12) return;
  skills.push({ id, level: clamp01(level), since: input.at });
}

// ---------------------------------------------------------------------------
// 排程与处理器

function inputFor(
  ctx: EventContext,
  region: RegionModel,
  actor: CharacterState,
  choice: string | null,
  topic: string | null,
): PrototypeInput {
  // 币制只有花钱的变体才用到；按需解析一次，避免每个原型事件都对宏观状态做一遍 schema 校验。
  let currency: CurrencyVersion | undefined;
  return {
    at: ctx.at,
    year: yearOf(ctx.at),
    age: ageOn(actor.birthDate, ctx.at),
    state: ctx.state,
    actor,
    region,
    get currency() {
      currency ??= readMacro(ctx.state).currency;
      return currency;
    },
    choice,
    topic,
  };
}

/**
 * 生日当天调用（只给主角）：原型第一次进入年龄与年代窗口的那一年启动链条。
 * 只读年龄与日历年，不抽随机数、不看个人状态，所以「哪一年该抽哪些原型」可以直接枚举。
 */
export function scheduleLifeEventYear(
  ctx: EventContext,
  actor: CharacterState,
  age: number,
  catalog: readonly LifeEventPrototype[],
): void {
  if (actor.tier !== 'protagonist') return;
  const year = yearOf(ctx.at);
  for (const prototype of catalog) {
    if (!inWindow(prototype, age, year) || inWindow(prototype, age - 1, year - 1)) continue;
    ctx.schedule({
      type: lifeEventType(prototype.id),
      at: ctx.at,
      entityId: actor.id,
      period: `year:${year}`,
      payload: { count: 0 },
    });
  }
}

/** 排下一年的同一原型；到达一生上限、超出年龄或年代窗口时链条终止。 */
function scheduleNextYear(
  ctx: EventContext,
  prototype: LifeEventPrototype,
  actor: CharacterState,
  age: number,
  count: number,
): void {
  if (count >= prototype.lifetimeCap) return;
  const at = addYears(actor.birthDate, age + 1);
  const year = yearOf(at);
  if (!inWindow(prototype, age + 1, year)) return;
  ctx.schedule({
    type: lifeEventType(prototype.id),
    at,
    entityId: actor.id,
    period: `year:${year}`,
    payload: { count },
  });
}

function availableVariants(
  prototype: LifeEventPrototype,
  input: PrototypeInput,
): LifeEventVariant[] {
  return prototype.variants.filter(
    (variant) =>
      (variant.era === undefined || inEra(variant.era, input.year)) &&
      (variant.when === undefined || variant.when(input)),
  );
}

function availableTopics(prototype: LifeEventPrototype, input: PrototypeInput): LifeEventTopic[] {
  return (prototype.topics ?? []).filter(
    (topic) =>
      (topic.era === undefined || inEra(topic.era, input.year)) &&
      (prototype.topicAvailable === undefined || prototype.topicAvailable(input, topic.id)),
  );
}

function emitPrototypeFact(
  ctx: EventContext,
  prototype: LifeEventPrototype,
  variant: LifeEventVariant,
  input: PrototypeInput,
): void {
  const outcome = variant.apply(input);
  ctx.emit({
    type: lifeEventType(prototype.id),
    outcomeCode: outcome.outcomeCode ?? variant.id,
    templateId: `life.${prototype.id}.${variant.id}`,
    actorIds: [input.actor.id],
    // 设计假设，不引用任何数据表；由年度抽样引起，不由其他事实引起。
    evidenceIds: [],
    ...(outcome.details ? { details: outcome.details } : {}),
  });
}

function readPayload(ctx: EventContext): LifeEventPayload {
  return LifeEventPayloadSchema.parse(ctx.occurrence.payload);
}

function prototypeEvent(prototype: LifeEventPrototype, region: RegionModel): EventDefinition {
  return {
    type: lifeEventType(prototype.id),
    version: 1,
    priority: LIFE_EVENT_PRIORITY,
    handle(ctx) {
      const { count } = readPayload(ctx);
      const actor = ctx.actor(ctx.occurrence.entityId);
      const input = inputFor(ctx, region, actor, null, null);
      // 防御：正常排程不会越界或超过上限。
      if (!inWindow(prototype, input.age, input.year) || count >= prototype.lifetimeCap) return;
      if (prototype.eligible && !prototype.eligible(input)) {
        scheduleNextYear(ctx, prototype, actor, input.age, count);
        return;
      }
      // 第一次抽样必须是出现判定（随机流隔离与覆盖率证明都依赖它）。
      if (!ctx.random.chance(prototype.annualProbability)) {
        scheduleNextYear(ctx, prototype, actor, input.age, count);
        return;
      }
      // 抽样顺序：出现 → 主题 → 变体；只有 1 个候选时不消耗抽样。
      const topics = availableTopics(prototype, input);
      if (prototype.topics && topics.length === 0) {
        scheduleNextYear(ctx, prototype, actor, input.age, count);
        return;
      }
      const topic = pick(ctx, topics);
      const withTopic = topic ? inputFor(ctx, region, actor, null, topic.id) : input;
      if (prototype.decision) {
        if (prototype.decision.settle) {
          const variant = pick(ctx, availableVariants(prototype, withTopic));
          if (!variant) {
            scheduleNextYear(ctx, prototype, actor, input.age, count);
            return;
          }
          emitPrototypeFact(ctx, prototype, variant, withTopic);
        }
        ctx.schedule({
          type: lifeEventChoiceType(prototype.id),
          at: ctx.at,
          entityId: actor.id,
          period: `year:${input.year}:choice`,
          payload: { count: count + 1, ...(topic ? { topic: topic.id } : {}) },
        });
        return;
      }
      const variant = pick(ctx, availableVariants(prototype, withTopic));
      if (!variant) {
        scheduleNextYear(ctx, prototype, actor, input.age, count);
        return;
      }
      emitPrototypeFact(ctx, prototype, variant, withTopic);
      scheduleNextYear(ctx, prototype, actor, input.age, count + 1);
    },
  };
}

/** 等权、按目录顺序；只有 1 个时不消耗抽样，没有时返回 undefined。 */
function pick<T>(ctx: EventContext, items: readonly T[]): T | undefined {
  if (items.length <= 1) return items[0];
  return items[ctx.random.int(items.length)];
}

function decisionEvent(
  prototype: LifeEventPrototype,
  decision: LifeEventDecision,
  region: RegionModel,
): EventDefinition {
  const optionsInput = (ctx: EventContext): PrototypeInput => {
    const { topic } = readPayload(ctx);
    return inputFor(ctx, region, ctx.actor(ctx.occurrence.entityId), null, topic ?? null);
  };
  return {
    type: lifeEventChoiceType(prototype.id),
    version: 1,
    priority: LIFE_EVENT_DECISION_PRIORITY,
    decision: {
      major: decision.major,
      actorId: (occurrence) => occurrence.entityId,
      options: (ctx) => decision.options(optionsInput(ctx)),
    },
    handle(ctx) {
      if (!ctx.choice) throw new Error(`${prototype.id} decision without a choice`);
      const { count, topic } = readPayload(ctx);
      const actor = ctx.actor(ctx.occurrence.entityId);
      const input = inputFor(ctx, region, actor, ctx.choice.optionId, topic ?? null);
      // 第二段不抽随机数：后果或变体由选项决定。
      if (decision.settle) {
        decision.settle(input);
      } else {
        const [variant] = availableVariants(prototype, input);
        if (!variant) throw new Error(`${prototype.id} has no variant for ${ctx.choice.optionId}`);
        emitPrototypeFact(ctx, prototype, variant, input);
      }
      scheduleNextYear(ctx, prototype, actor, input.age, count);
    },
  };
}

export function lifeEventDefinitions(
  region: RegionModel,
  catalog: readonly LifeEventPrototype[],
): EventDefinition[] {
  return catalog.flatMap((prototype) => [
    prototypeEvent(prototype, region),
    ...(prototype.decision ? [decisionEvent(prototype, prototype.decision, region)] : []),
  ]);
}

/** 界面「这是什么」的数据来源：与目录一一对应，全部是 D 级设计假设。 */
export function lifeEventDisclosure(
  catalog: readonly LifeEventPrototype[],
): readonly LifeEventDisclosureRow[] {
  return catalog.map((prototype) => ({
    id: prototype.id,
    ages: { ...prototype.ages },
    era: { ...prototype.era },
    annualProbability: prototype.annualProbability,
    lifetimeCap: prototype.lifetimeCap,
    evidenceGrade: 'D',
    coverageFloor: prototype.coverageFloor,
    hasDecision: prototype.decision !== undefined,
    templateIds: [
      ...prototype.variants.map((variant) => `life.${prototype.id}.${variant.id}`),
      ...(prototype.decision?.optionIds ?? []).map(
        (option) => `life.${prototype.id}.choice.${option}`,
      ),
    ],
  }));
}
