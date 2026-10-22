import {
  CharacterStateSchema,
  HouseholdAccountSchema,
  RelationshipsSchema,
  SimEventFactSchema,
  SimulationSnapshotSchema,
  characterStateViolations,
  type CharacterState,
  type ISODate,
  type SimEventFact,
  type SimulationSnapshot,
} from '@lifesim/content-schema';
import {
  AdvanceRequestSchema,
  type AdvanceRequest,
  type AdvanceResult,
  type AdvanceStopReason,
  type CancellationToken,
  type PausePolicy,
  type SimulationEngine,
} from './contract.ts';
import { SimulationError, type SimulationErrorCode } from './errors.ts';
import { DraftTransaction } from './draft.ts';
import { canonicalJson, cloneJson, type JsonValue } from './json.ts';
import { chooseByPrinciples } from './policy.ts';
import { RNG_ALGORITHM, deriveStream, type RandomStream } from './random.ts';
import {
  EventQueue,
  RngStateSchema,
  SchedulerStateSchema,
  occurrenceKey,
  type Occurrence,
} from './scheduler.ts';
import type {
  Choice,
  DecisionOption,
  EventContext,
  EventDefinition,
  FactDraft,
  Invariant,
  PendingDecision,
  ScheduleRequest,
  SimState,
  SimulationModule,
} from './types.ts';

export const ENGINE_VERSION = '0.1.0';
export const SNAPSHOT_SCHEMA_VERSION = 2;

/** 防止失控的硬上限；超过即视为规则缺陷（无限递归、事件风暴），带上下文报错。 */
export interface EngineLimits {
  maxEventsPerDay: number;
  maxChainDepth: number;
  maxSchedulesPerEvent: number;
}

const DEFAULT_LIMITS: EngineLimits = {
  maxEventsPerDay: 500,
  maxChainDepth: 64,
  maxSchedulesPerEvent: 64,
};

export interface GenesisSpec {
  type: string;
  at: ISODate;
  entityId: string;
  payload: JsonValue;
}

export interface CreateSimulationOptions {
  seed: string;
  modules: readonly SimulationModule[];
  /** 第一个事件（通常是出生），在创建时立即处理，必须创建主角并产生至少一条事实。 */
  genesis: GenesisSpec;
  activeCharacterId: string;
  dataPackVersions: Readonly<Record<string, string>>;
  /** 预先给出的玩家选择（决策事件幂等键 → 选项 ID）。 */
  decisions?: Readonly<Record<string, string>>;
  limits?: Partial<EngineLimits>;
}

export interface RestoreSimulationOptions {
  modules: readonly SimulationModule[];
  dataPackVersions: Readonly<Record<string, string>>;
  limits?: Partial<EngineLimits>;
}

interface SimulationInit {
  seed: string;
  activeCharacterId: string;
  dataPackVersions: Record<string, string>;
  modules: readonly SimulationModule[];
  limits: EngineLimits;
  state: SimState;
  queue: readonly Occurrence[];
  processedKeys: readonly string[];
  decisions: Readonly<Record<string, string>>;
  presets: Readonly<Record<string, string>>;
  ended: boolean;
  clock: ISODate;
  dayCounter: { at: ISODate | null; count: number };
  lastSequence: number;
}

const FACT_ID = /^fact:(\d+)$/;

/**
 * 角色字段的逐项 schema（同一份 `CharacterStateSchema` 的形状），用于按字段复用校验结果。
 * 键集固定，启动时算一次。
 */
interface FieldSchema {
  safeParse(value: unknown): { success: boolean };
}
const CHARACTER_FIELDS = CharacterStateSchema.shape as unknown as Readonly<
  Record<string, FieldSchema>
>;
const CHARACTER_FIELD_KEYS = Object.keys(CHARACTER_FIELDS);
const CHARACTER_FIELD_SET = new Set(CHARACTER_FIELD_KEYS);

/** 事实提交后冻结：日志里的事实不可变（GDD §7），调用方拿到的引用也改不动。 */
function freezeFact(fact: SimEventFact): SimEventFact {
  Object.freeze(fact.actorIds);
  Object.freeze(fact.causeEventIds);
  Object.freeze(fact.evidenceIds);
  if (fact.details) Object.freeze(fact.details);
  return Object.freeze(fact);
}

/**
 * 规范模拟推进器（GDD §4.1、§7、§11.4）。
 *
 * - 所有推进方式都走 `advanceTo`，事件按（日期、优先级、幂等键）的全序逐个处理，
 *   与调用如何切分无关，所以逐年、快进、分批推进的结果逐字节相同。
 * - 每个事件在状态草稿上处理，事实与不变量检查都通过后才整体提交；
 *   任何失败都不留下半个事件的状态，并抛出带种子、事件键与日期的 `SimulationError`。
 * - 主角死亡后清空队列，之后的推进不再产生任何事实。
 */
export class Simulation implements SimulationEngine {
  readonly seed: string;
  readonly activeCharacterId: string;
  readonly #dataPackVersions: Record<string, string>;
  readonly #registry = new Map<string, EventDefinition>();
  readonly #invariants: Invariant[] = [];
  readonly #limits: EngineLimits;
  #state: SimState;
  readonly #queue: EventQueue;
  readonly #processed: Set<string>;
  readonly #decisions: Map<string, string>;
  readonly #presets: Map<string, string>;
  #ended: boolean;
  #clock: ISODate;
  #dayCounter: { at: ISODate | null; count: number };
  #lastSequence: number;
  readonly #journal: SimEventFact[] = [];

  private constructor(init: SimulationInit) {
    this.seed = init.seed;
    this.activeCharacterId = init.activeCharacterId;
    this.#dataPackVersions = init.dataPackVersions;
    this.#limits = init.limits;
    for (const module of init.modules) {
      for (const definition of module.events) {
        if (this.#registry.has(definition.type)) {
          throw new Error(`Event type ${definition.type} is defined twice`);
        }
        this.#registry.set(definition.type, definition);
      }
      this.#invariants.push(...(module.invariants ?? []));
    }
    this.#state = init.state;
    this.#queue = new EventQueue(init.queue);
    this.#processed = new Set(init.processedKeys);
    this.#decisions = new Map(Object.entries(init.decisions));
    this.#presets = new Map(Object.entries(init.presets));
    this.#ended = init.ended;
    this.#clock = init.clock;
    this.#dayCounter = init.dayCounter;
    this.#lastSequence = init.lastSequence;
  }

  static create(options: CreateSimulationOptions): Simulation {
    const simulation = new Simulation({
      seed: options.seed,
      activeCharacterId: options.activeCharacterId,
      dataPackVersions: { ...options.dataPackVersions },
      modules: options.modules,
      limits: { ...DEFAULT_LIMITS, ...options.limits },
      state: { actors: [], householdAccounts: [], relationships: [], world: {} },
      queue: [],
      processedKeys: [],
      decisions: options.decisions ?? {},
      presets: {},
      ended: false,
      clock: options.genesis.at,
      dayCounter: { at: null, count: 0 },
      lastSequence: -1,
    });
    const { type, at, entityId, payload } = options.genesis;
    const definition = simulation.#definition(type, { seed: options.seed, at });
    simulation.#queue.insert({
      key: occurrenceKey(type, entityId, 'genesis'),
      type,
      at,
      priority: definition.priority,
      entityId,
      period: 'genesis',
      payload,
      causeFactIds: [],
      depth: 0,
    });
    simulation.#processHead();
    const created = simulation.#state.actors.some((a) => a.id === options.activeCharacterId);
    if (simulation.#lastSequence < 0 || !created) {
      throw new SimulationError(
        'genesis-failed',
        'Genesis must create the active character and emit at least one fact',
        { seed: options.seed, at },
      );
    }
    return simulation;
  }

  static restore(snapshot: SimulationSnapshot, options: RestoreSimulationOptions): Simulation {
    const parsed = SimulationSnapshotSchema.parse(snapshot);
    const context = { seed: parsed.rootSeed, at: parsed.at };
    const incompatible = (message: string) =>
      new SimulationError('incompatible-snapshot', message, context);
    if (parsed.schemaVersion !== SNAPSHOT_SCHEMA_VERSION) {
      throw incompatible(`Snapshot schema ${parsed.schemaVersion} is not supported`);
    }
    if (parsed.engineVersion !== ENGINE_VERSION) {
      throw incompatible(`Snapshot engine ${parsed.engineVersion} differs from ${ENGINE_VERSION}`);
    }
    if (RngStateSchema.parse(parsed.rngState).algorithm !== RNG_ALGORITHM) {
      throw incompatible('Snapshot uses a different random number algorithm');
    }
    if (canonicalJson(parsed.dataPackVersions) !== canonicalJson(options.dataPackVersions)) {
      throw incompatible('Snapshot data pack versions differ from the loaded packs');
    }
    const scheduler = SchedulerStateSchema.parse(parsed.schedulerState);
    return new Simulation({
      seed: parsed.rootSeed,
      activeCharacterId: parsed.activeCharacterId,
      dataPackVersions: { ...parsed.dataPackVersions },
      modules: options.modules,
      limits: { ...DEFAULT_LIMITS, ...options.limits },
      state: {
        actors: parsed.actors,
        householdAccounts: parsed.householdAccounts,
        relationships: parsed.relationships,
        world: parsed.world,
      },
      queue: scheduler.queue,
      processedKeys: scheduler.processedKeys,
      decisions: scheduler.decisions,
      presets: scheduler.presets ?? {},
      ended: scheduler.ended,
      clock: parsed.at,
      dayCounter: scheduler.dayCounter,
      lastSequence: parsed.lastJournalSequence,
    });
  }

  get clock(): ISODate {
    return this.#clock;
  }

  get ended(): boolean {
    return this.#ended;
  }

  /** 最后一条事实的序号。 */
  get lastSequence(): number {
    return this.#lastSequence;
  }

  /** 本实例（创建或恢复以来）产生的事实。 */
  get facts(): readonly SimEventFact[] {
    return this.#journal;
  }

  /** 当前状态的只读副本。 */
  get state(): SimState {
    return cloneJson(this.#state);
  }

  advanceTo(request: AdvanceRequest, cancellation?: CancellationToken): AdvanceResult {
    const {
      targetDate,
      stopAtMajorDecision,
      maxWorkUnits,
      pauseOn = 'major',
    } = AdvanceRequestSchema.parse(request);
    if (targetDate < this.#clock) {
      throw new SimulationError('date-regression', `Cannot advance backwards from ${this.#clock}`, {
        seed: this.seed,
        at: targetDate,
      });
    }
    const newFacts: SimEventFact[] = [];
    const finish = (
      stopReason: AdvanceStopReason,
      pendingDecision: PendingDecision | null = null,
    ): AdvanceResult => ({ reachedDate: this.#clock, stopReason, newFacts, pendingDecision });

    let work = 0;
    for (;;) {
      if (this.#ended) return finish('protagonist-died');
      if (cancellation?.cancelled) return finish('cancelled');
      const head = this.#queue.peek();
      if (!head || head.at > targetDate) {
        this.#clock = targetDate;
        return finish('target-reached');
      }
      if (work >= maxWorkUnits) return finish('work-budget-exhausted');
      if (stopAtMajorDecision) {
        const pending = this.pendingDecision(pauseOn);
        if (pending) {
          this.#clock = head.at;
          return finish('major-decision', pending);
        }
      }
      newFacts.push(...this.#processHead());
      work++;
    }
  }

  /**
   * 队首若是按暂停策略需要玩家决定的事项（没有直接选择、没有预设、当事人在世），返回它；否则为 null。
   * `major`（缺省）只认重大决定；`all` 也认普通决定；`background` 决定永远不算（ADR-0008）。
   */
  pendingDecision(pauseOn: PausePolicy = 'major'): PendingDecision | null {
    const head = this.#queue.peek();
    if (!head || this.#ended || this.#decisions.has(head.key) || this.#presets.has(head.key)) {
      return null;
    }
    const definition = this.#definition(head.type, { seed: this.seed, eventKey: head.key });
    const spec = definition.decision;
    if (!spec || spec.background) return null;
    if (pauseOn === 'major' && !spec.major) return null;
    const actorId = spec.actorId(head);
    const actor = this.#state.actors.find((candidate) => candidate.id === actorId);
    if (!actor || actor.vitalStatus.kind === 'deceased') return null;
    const options = this.#evaluateOptions(head, definition);
    const recommended = chooseByPrinciples(actor.lifePrinciples, options);
    if (!recommended) {
      throw this.#error(
        'no-eligible-option',
        `Decision ${definition.type} has no eligible option`,
        head,
      );
    }
    return { key: head.key, type: definition.type, at: head.at, actorId, options, recommended };
  }

  decide(decisionKey: string, optionId: string): void {
    const pending = this.pendingDecision('all');
    if (pending?.key !== decisionKey) {
      throw new SimulationError(
        'invalid-decision',
        `Decision ${decisionKey} is not waiting for a choice`,
        { seed: this.seed, eventKey: decisionKey },
      );
    }
    const option = pending.options.find((candidate) => candidate.id === optionId);
    if (!option?.eligible) {
      throw new SimulationError(
        'invalid-decision',
        `Option ${optionId} is not eligible for ${decisionKey}`,
        { seed: this.seed, eventKey: decisionKey, at: pending.at },
      );
    }
    this.#decisions.set(decisionKey, optionId);
  }

  /**
   * 为尚未处理的决策事件预设选项；`null` 清除（ADR-0008）。预设是「软」的：
   * 结算时若该选项不合格，改由人生原则决定，并在 `decision.made` 里记录 `presetIgnored`。
   */
  preset(decisionKey: string, optionId: string | null): void {
    const context = { seed: this.seed, eventKey: decisionKey };
    const invalid = (message: string) => new SimulationError('invalid-decision', message, context);
    const parts = decisionKey.split('|');
    const type = parts[0] ?? '';
    if (parts.length < 3 || !this.#registry.get(type)?.decision) {
      throw invalid(`${decisionKey} is not the key of a decision event`);
    }
    if (this.#ended || this.#processed.has(decisionKey)) {
      throw invalid(`Decision ${decisionKey} was already settled`);
    }
    if (optionId === null) {
      this.#presets.delete(decisionKey);
      return;
    }
    if (optionId.length === 0) throw invalid('A preset needs an option id');
    this.#presets.set(decisionKey, optionId);
  }

  snapshot(): SimulationSnapshot {
    return cloneJson({
      schemaVersion: SNAPSHOT_SCHEMA_VERSION,
      engineVersion: ENGINE_VERSION,
      dataPackVersions: this.#dataPackVersions,
      at: this.#clock,
      rootSeed: this.seed,
      rngState: { algorithm: RNG_ALGORITHM },
      schedulerState: {
        queue: this.#queue.toArray(),
        processedKeys: [...this.#processed].sort(),
        decisions: Object.fromEntries([...this.#decisions].sort(([a], [b]) => (a < b ? -1 : 1))),
        ...(this.#presets.size > 0
          ? {
              presets: Object.fromEntries([...this.#presets].sort(([a], [b]) => (a < b ? -1 : 1))),
            }
          : {}),
        ended: this.#ended,
        dayCounter: this.#dayCounter,
      },
      activeCharacterId: this.activeCharacterId,
      actors: this.#state.actors,
      world: this.#state.world,
      relationships: this.#state.relationships,
      householdAccounts: this.#state.householdAccounts,
      lastJournalSequence: this.#lastSequence,
    });
  }

  // ---------------------------------------------------------------------------

  #definition(
    type: string,
    context: { seed: string; eventKey?: string; at?: ISODate },
  ): EventDefinition {
    const definition = this.#registry.get(type);
    if (!definition)
      throw new SimulationError('unknown-event', `No definition for ${type}`, context);
    return definition;
  }

  #error(
    code: SimulationErrorCode,
    message: string,
    occurrence: Occurrence,
    options: { cause?: unknown; details?: readonly string[] } = {},
  ): SimulationError {
    return new SimulationError(
      code,
      message,
      { seed: this.seed, eventKey: occurrence.key, at: occurrence.at },
      options,
    );
  }

  /** 列出决策选项（暂停时展示与结算时使用同一条路径，保证所见即所得）。 */
  #evaluateOptions(occurrence: Occurrence, definition: EventDefinition): DecisionOption[] {
    const spec = definition.decision;
    if (!spec) return [];
    return this.#withOptionsView(occurrence, (view) => spec.options(view));
  }

  /**
   * 在一份丢弃式的只读视图上调用 `options()`，返回后视图立即失效（ADR-0011 第 6 条）。
   *
   * 状态视图不再是一份深拷贝，而是同一个按需复制的事务草稿：读共享已提交状态，
   * 写入落在这份草稿里（与深拷贝的可见性相同），调用结束就关掉、什么都不提交。
   * `options()` 原本就只能是纯函数，因此它看得见的仍是一份「改变不了权威状态」的拷贝。
   */
  #withOptionsView<T>(occurrence: Occurrence, run: (view: EventContext) => T): T {
    const transaction = new DraftTransaction(this.#state);
    try {
      return run(this.#optionsView(occurrence, transaction.root));
    } finally {
      transaction.close();
    }
  }

  /**
   * 给 `DecisionSpec.options()` 的只读视图：抽随机数、追加事实、安排事件都会报错。
   * 选项因此只能取决于当前状态，暂停时给玩家看的选项与随后结算用的选项必然一致。
   */
  #optionsView(occurrence: Occurrence, copy: SimState): EventContext {
    const impure = (what: string) => (): never => {
      throw this.#error(
        'impure-decision-options',
        `Decision options must be pure: ${what} is not allowed in options()`,
        occurrence,
      );
    };
    const forbiddenRandom = {
      nextUint32: impure('random'),
      next: impure('random'),
      chance: impure('random'),
      int: impure('random'),
      weighted: impure('random'),
    } as unknown as RandomStream;
    return {
      at: occurrence.at,
      occurrence,
      state: copy,
      random: forbiddenRandom,
      choice: null,
      actor: (id: string): CharacterState => {
        const actor = copy.actors.find((candidate) => candidate.id === id);
        if (!actor) throw this.#error('handler-failed', `Unknown actor ${id}`, occurrence);
        return actor;
      },
      emit: impure('emit'),
      schedule: impure('schedule'),
    };
  }

  #makeContext(occurrence: Occurrence, definition: EventDefinition, draft: SimState) {
    const facts: SimEventFact[] = [];
    const scheduled: Occurrence[] = [];
    const scheduledKeys = new Set<string>();
    // 随机流按需派生：多数事件不抽样，而派生一次要算 128 位散列并构造 sfc32 生成器。
    // 派生只取决于（根种子，事件幂等键），与读它的时机无关，所以结果不变。
    let random: RandomStream | null = null;
    const rootSeed = this.seed;
    const fail = (code: SimulationErrorCode, message: string) =>
      this.#error(code, message, occurrence);

    const knownFact = (id: string) => {
      if (facts.some((fact) => fact.id === id)) return true;
      const match = FACT_ID.exec(id);
      return match !== null && Number(match[1]) <= this.#lastSequence;
    };

    const context: EventContext & { choice: Choice | null } = {
      at: occurrence.at,
      occurrence,
      state: draft,
      get random(): RandomStream {
        return (random ??= deriveStream(rootSeed, occurrence.key));
      },
      choice: null,
      actor: (id: string): CharacterState => {
        const actor = draft.actors.find((candidate) => candidate.id === id);
        if (!actor) throw fail('handler-failed', `Unknown actor ${id}`);
        return actor;
      },
      emit: (input: FactDraft): string => {
        const sequence = this.#lastSequence + facts.length + 1;
        const id = `fact:${sequence}`;
        const causes = [...new Set(input.causes ?? occurrence.causeFactIds)];
        for (const cause of causes) {
          if (!knownFact(cause)) throw fail('unknown-cause', `Fact cites unknown cause ${cause}`);
        }
        const fact: SimEventFact = {
          id,
          sequence,
          type: input.type,
          at: occurrence.at,
          actorIds: [...input.actorIds],
          causeEventIds: causes,
          outcomeCode: input.outcomeCode,
          templateId: input.templateId ?? input.type,
          evidenceIds: [...(input.evidenceIds ?? [])],
          eventVersion: definition.version,
          ...(input.details ? { details: { ...input.details } } : {}),
        };
        facts.push(fact);
        return id;
      },
      schedule: (request: ScheduleRequest): void => {
        if (request.at < occurrence.at) {
          throw fail(
            'past-schedule',
            `Cannot schedule ${request.type} in the past (${request.at})`,
          );
        }
        const target = this.#definition(request.type, {
          seed: this.seed,
          eventKey: occurrence.key,
          at: occurrence.at,
        });
        const key = occurrenceKey(request.type, request.entityId, request.period);
        if (this.#processed.has(key) || key === occurrence.key) {
          throw fail('duplicate-event-key', `Event ${key} was already processed (event cycle)`);
        }
        if (this.#queue.has(key) || scheduledKeys.has(key)) return; // 幂等：已在队列中
        if (scheduled.length >= this.#limits.maxSchedulesPerEvent) {
          throw fail(
            'too-many-schedules',
            `More than ${this.#limits.maxSchedulesPerEvent} follow-ups`,
          );
        }
        const depth = request.at === occurrence.at ? occurrence.depth + 1 : 0;
        if (depth > this.#limits.maxChainDepth) {
          throw fail(
            'chain-too-deep',
            `Same-day event chain deeper than ${this.#limits.maxChainDepth}`,
          );
        }
        const causeFactIds = [...new Set(request.causes ?? [])];
        for (const cause of causeFactIds) {
          if (!knownFact(cause))
            throw fail('unknown-cause', `Schedule cites unknown cause ${cause}`);
        }
        scheduled.push({
          key,
          type: request.type,
          at: request.at,
          priority: target.priority,
          entityId: request.entityId,
          period: request.period,
          payload: cloneJson(request.payload ?? null),
          causeFactIds,
          depth,
        });
        scheduledKeys.add(key);
      },
    };
    return { context, facts, scheduled };
  }

  #resolveChoice(
    occurrence: Occurrence,
    definition: EventDefinition,
    context: EventContext,
  ): Choice {
    const spec = definition.decision;
    if (!spec) throw this.#error('handler-failed', 'Not a decision event', occurrence);
    const actorId = spec.actorId(occurrence);
    const actor = context.actor(actorId);
    // 决定在处理器之前结算，此刻草稿还没有任何写入，与已提交状态相同；
    // 选项在已提交状态上求值（同样是丢弃式视图，见 #withOptionsView）。
    const options = this.#withOptionsView(occurrence, (view) => spec.options(view));
    const recorded = this.#decisions.get(occurrence.key);
    const preset = this.#presets.get(occurrence.key);

    let optionId: string;
    let decidedBy: Choice['decidedBy'];
    let reasons: Choice['reasons'] = [];
    let presetIgnored: string | null = null;
    if (recorded !== undefined) {
      if (!options.find((option) => option.id === recorded)?.eligible) {
        throw this.#error(
          'invalid-decision',
          `Recorded option ${recorded} is not eligible`,
          occurrence,
        );
      }
      optionId = recorded;
      decidedBy = 'player';
    } else if (preset !== undefined && options.find((option) => option.id === preset)?.eligible) {
      optionId = preset;
      decidedBy = 'preset';
    } else {
      if (preset !== undefined) presetIgnored = preset;
      const choice = chooseByPrinciples(actor.lifePrinciples, options);
      if (!choice) {
        throw this.#error(
          'no-eligible-option',
          `Decision ${definition.type} has no eligible option`,
          occurrence,
        );
      }
      ({ optionId, reasons } = choice);
      decidedBy = 'principles';
    }
    const factId = context.emit({
      type: 'decision.made',
      outcomeCode: optionId,
      templateId: `${definition.type}.${optionId}`,
      actorIds: [actorId],
      details: {
        decision: definition.type,
        option: optionId,
        decidedBy,
        reason1: reasons[0] ?? null,
        reason2: reasons[1] ?? null,
        ...(presetIgnored !== null ? { presetIgnored } : {}),
      },
    });
    return { optionId, decidedBy, reasons, factId };
  }

  /** 处理队首事件：草稿 → 处理器 → 校验 → 整体提交。 */
  #processHead(): SimEventFact[] {
    const occurrence = this.#queue.peek();
    if (!occurrence) return [];
    const definition = this.#definition(occurrence.type, {
      seed: this.seed,
      eventKey: occurrence.key,
      at: occurrence.at,
    });

    const sameDay = this.#dayCounter.at === occurrence.at;
    const dayCount = sameDay ? this.#dayCounter.count + 1 : 1;
    if (dayCount > this.#limits.maxEventsPerDay) {
      throw this.#error(
        'event-storm',
        `More than ${this.#limits.maxEventsPerDay} events on one day`,
        occurrence,
      );
    }

    // 已故者的事件直接作废，不产生事实（死者不再参与任何事件）。
    const subject = this.#state.actors.find((actor) => actor.id === occurrence.entityId);
    if (subject?.vitalStatus.kind === 'deceased') {
      this.#queue.shift();
      this.#processed.add(occurrence.key);
      this.#presets.delete(occurrence.key);
      this.#dayCounter = { at: occurrence.at, count: dayCount };
      this.#clock = occurrence.at;
      return [];
    }

    // 处理器在按需复制的草稿上工作（ADR-0011）：没写过的分支与已提交状态共享引用。
    const transaction = new DraftTransaction(this.#state);
    try {
      const { context, facts, scheduled } = this.#makeContext(
        occurrence,
        definition,
        transaction.root,
      );
      try {
        if (definition.decision)
          context.choice = this.#resolveChoice(occurrence, definition, context);
        definition.handle(context);
      } catch (error) {
        if (error instanceof SimulationError) throw error;
        const message = error instanceof Error ? error.message : String(error);
        throw this.#error('handler-failed', message, occurrence, { cause: error });
      }

      const committed = transaction.commit();
      const next = committed.state;
      this.#verify(occurrence, next, facts);
      // 原有的 schema 与不变量检查先跑（保持原来的错误码），再拒绝它们覆盖不到的非 JSON 值。
      if (committed.problem !== null) {
        throw this.#error('handler-failed', committed.problem, occurrence);
      }
      return this.#commit(occurrence, next, facts, scheduled, dayCount);
    } finally {
      transaction.close();
    }
  }

  /** 校验通过后整体提交：状态、队列、已处理键、日志、时钟一起前进。 */
  #commit(
    occurrence: Occurrence,
    next: SimState,
    facts: SimEventFact[],
    scheduled: readonly Occurrence[],
    dayCount: number,
  ): SimEventFact[] {
    this.#state = next;
    this.#queue.shift();
    this.#processed.add(occurrence.key);
    this.#presets.delete(occurrence.key);
    for (const followUp of scheduled) this.#queue.insert(followUp);
    for (const fact of facts) freezeFact(fact);
    this.#journal.push(...facts);
    this.#lastSequence += facts.length;
    this.#clock = occurrence.at;
    this.#dayCounter = { at: occurrence.at, count: dayCount };

    const protagonist = next.actors.find((actor) => actor.id === this.activeCharacterId);
    if (protagonist?.vitalStatus.kind === 'deceased') {
      this.#ended = true;
      this.#queue.clear();
      this.#presets.clear();
    }
    return facts;
  }

  /**
   * 校验本事件改动过的角色。
   *
   * 已提交角色的每个字段都通过过完整校验，而 schema 校验只取决于值本身；按需复制让「没改过的字段」
   * 与已提交角色是同一个引用，所以只需按字段重新校验**改过的**那几个，不必整份重解析（M3-035 的延伸）。
   * 跨字段规则（学历与就业一致、技能不早于出生等）始终对整份新角色重跑。
   * 一旦有字段不合法、或键集与 schema 不符，就退回整份 CharacterStateSchema 解析：
   * 报错信息与以前逐字相同，慢路径只在真正出错时走。
   */
  #actorProblems(actor: CharacterState, before: CharacterState | undefined): string[] {
    const full = (): string[] => {
      const parsed = CharacterStateSchema.safeParse(actor);
      return parsed.success ? [] : [`actor ${actor.id}: ${parsed.error.message}`];
    };
    if (before === undefined || typeof actor !== 'object' || actor === null) return full();
    const fields = actor as unknown as Record<string, unknown>;
    const previous = before as unknown as Record<string, unknown>;
    const keys = Object.keys(fields);
    if (keys.length !== CHARACTER_FIELD_KEYS.length) return full();
    let dirty = false;
    for (const key of keys) {
      if (!CHARACTER_FIELD_SET.has(key)) return full(); // 处理器加了 schema 里没有的键
      if (Object.is(fields[key], previous[key])) continue;
      dirty = true;
      const field = CHARACTER_FIELDS[key];
      if (!field || !field.safeParse(fields[key]).success) return full();
    }
    if (dirty && characterStateViolations(actor).length > 0) return full();
    return [];
  }

  /**
   * 提交前检查：事实结构、角色与账户结构、时间与生死约束、各系统的不变量。
   *
   * 已提交的状态都校验过（创建时为空，恢复时整份快照经过 schema 解析），而 schema 校验只取决于值本身，
   * 所以本事件没有改动的角色和账户不必再解析一遍；只解析新增或改动的（M3-035）。
   * 按需复制的草稿（ADR-0011）让「没改动」可以按引用判断：没写过的分支与已提交状态是同一个对象。
   * 这样每个事件的校验成本取决于它改了多少角色，而不是一局里有多少 NPC。
   * 关系图有数组级规则（去重、亲子无环），所以只要本事件改了任何关系，就整体再校验一次（M3-036）。
   */
  #verify(occurrence: Occurrence, draft: SimState, facts: readonly SimEventFact[]): void {
    const violations: string[] = [];

    for (const fact of facts) {
      const parsed = SimEventFactSchema.safeParse(fact);
      if (!parsed.success) violations.push(`fact ${fact.id}: ${parsed.error.message}`);
    }
    // 数组引用没变说明本事件根本没碰角色列表（按需复制让「没改过」就是同一个引用）。
    if (this.#state.actors !== draft.actors) {
      const actorsBefore = new Map(this.#state.actors.map((entry) => [entry.id, entry]));
      for (const actor of draft.actors) {
        const before = actorsBefore.get(actor.id);
        if (before === actor) continue;
        for (const problem of this.#actorProblems(actor, before)) violations.push(problem);
        if (before?.vitalStatus.kind === 'deceased' && actor.vitalStatus.kind !== 'deceased') {
          violations.push(`actor ${actor.id} came back to life`);
        }
      }
    }
    if (this.#state.householdAccounts !== draft.householdAccounts) {
      const accountsBefore = new Map(
        this.#state.householdAccounts.map((entry) => [entry.id, entry]),
      );
      for (const account of draft.householdAccounts) {
        const before = accountsBefore.get(account.id);
        if (before === account) continue;
        const parsed = HouseholdAccountSchema.safeParse(account);
        if (!parsed.success) violations.push(`account ${account.id}: ${parsed.error.message}`);
      }
    }
    if (this.#state.relationships !== draft.relationships) {
      const parsed = RelationshipsSchema.safeParse(draft.relationships);
      if (!parsed.success) violations.push(`relationships: ${parsed.error.message}`);
    }
    for (const fact of facts) {
      for (const actorId of fact.actorIds) {
        const actor = draft.actors.find((candidate) => candidate.id === actorId);
        if (!actor) {
          violations.push(`fact ${fact.id} names unknown actor ${actorId}`);
          continue;
        }
        if (fact.at < actor.birthDate) {
          violations.push(`fact ${fact.id} predates the birth of ${actorId} (negative age)`);
        }
        const { vitalStatus } = actor;
        if (vitalStatus.kind === 'deceased' && fact.at > vitalStatus.deathDate) {
          violations.push(`fact ${fact.id} involves ${actorId} after their death`);
        }
      }
    }
    for (const invariant of this.#invariants) {
      for (const message of invariant.check(draft, occurrence.at)) {
        violations.push(`${invariant.id}: ${message}`);
      }
    }

    if (violations.length > 0) {
      const code = facts.some((fact) => !SimEventFactSchema.safeParse(fact).success)
        ? 'invalid-fact'
        : 'invariant-violation';
      throw this.#error(code, `${violations.length} check(s) failed`, occurrence, {
        details: violations,
      });
    }
  }
}
