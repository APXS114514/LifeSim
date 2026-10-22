import {
  SimEventFactSchema,
  SimulationSnapshotSchema,
  type ISODate,
  type Locale,
  type SimEventFact,
  type SimulationSnapshot,
} from '@lifesim/content-schema';
import { type BirthContext, type CountryPack } from '@lifesim/country-packs';
import {
  createRealLifeSimulation,
  createRealNarrator,
  realCurrencyName,
  type RealLifeRequest,
  type RealNarrator,
} from '@lifesim/real-world';
import {
  SNAPSHOT_SCHEMA_VERSION,
  SchedulerStateSchema,
  SimulationError,
  addYears,
  ageOn,
  type AdvanceResult,
  type AdvanceStopReason,
  type Choice,
  type PendingDecision,
  type PausePolicy,
  type Simulation,
} from '@lifesim/simulation-core';
import {
  EVENT,
  YearlyFocusSchema,
  restoreLifeSimulation,
  summarizeLife,
  yearlyFocusDecisionKey,
  yearlyFocusOptions,
  type LifeSummary,
  type RegionModel,
  type YearlyFocus,
} from '@lifesim/systems';

import { addReflection, parseReflections, type ReflectionRecord } from './reflections.ts';

export interface GameSaveData {
  version: 1;
  request: RealLifeRequest;
  snapshot: SimulationSnapshot;
  facts: SimEventFact[];
  reflections?: ReflectionRecord[];
}

export interface GameSessionOptions {
  request: RealLifeRequest;
  birth: BirthContext;
  pack: CountryPack;
  region: RegionModel;
  simulation: Simulation;
  facts: SimEventFact[];
  reflections?: ReflectionRecord[];
  narrator: RealNarrator;
}

/** 一次推进的结果：停在哪里、追加了哪些事实、权威当前日期（M3-034）。 */
export interface StepResult {
  stopReason: AdvanceStopReason;
  newFacts: SimEventFact[];
  clock: ISODate;
}

/**
 * 年度重点的持续选择最多预设到这个年龄（M3-037B）。真实地区 100 岁的死亡率为 1，这里留出余量；
 * 主角去世时内核会清除剩余预设，多出的键不会留在结局存档里。
 */
export const FOCUS_PRESET_MAX_AGE = 120;

const DECIDED_BY: readonly Choice['decidedBy'][] = ['player', 'preset', 'principles'];

/** 年度重点选择器需要的视图（M3-037B）。 */
export interface FocusPlan {
  /** 最近一次已结算的年度重点；出生当天结算之前为 null。 */
  current: {
    age: number;
    focus: YearlyFocus;
    decidedBy: Choice['decidedBy'];
    /** 预设在那一年不可选、改由人生原则决定时，被忽略的预设。 */
    presetIgnored: YearlyFocus | null;
  } | null;
  /** 现在改选，从这个年龄的生日起生效（已结算的年份不能追改）。 */
  fromAge: number;
  /** 持续生效的选择；null 表示按人生原则。 */
  selected: YearlyFocus | null;
  /** 按角色目前的状态，`fromAge` 那年各重点是否可选。只是提示：到时不可选就按人生原则。 */
  eligibleNow: Readonly<Record<YearlyFocus, boolean>>;
}

/** 「直接模拟至结局」的目标日期；主角在此之前必然去世。 */
const FOREVER: ISODate = '2200-01-01';
const MAX_ROUNDS = 10_000;
const MAX_WORK_PER_ROUND = 100_000;

/**
 * 网页可玩切片的一局人生。
 *
 * 事实与快照由 deterministic kernel 产生；本类只负责推进、决策与渲染，
 * 不重新抽样，也不把 React state 当作权威状态。
 *
 * 时间语义（M3-034）：当前日期一律取内核的权威时钟 `simulation.clock`，
 * 不再用「最后一条事实的日期」推算——有的年份没有任何新事实。
 * 逐年、快进与单事件推进共用 `advanceTo`，所以三种玩法产生逐字节相同的结果。
 */
export class GameSession {
  readonly request: RealLifeRequest;
  readonly birth: BirthContext;
  readonly pack: CountryPack;
  readonly region: RegionModel;
  readonly simulation: Simulation;
  readonly narrator: RealNarrator;
  facts: SimEventFact[];
  pending: PendingDecision | null;
  #reflections: readonly ReflectionRecord[];
  #pauseOn: PausePolicy = 'major';
  #focus: YearlyFocus | null;

  private constructor(options: GameSessionOptions) {
    this.#reflections = parseReflections(options.reflections);
    this.request = options.request;
    this.birth = options.birth;
    this.pack = options.pack;
    this.region = options.region;
    this.simulation = options.simulation;
    this.facts = options.facts;
    this.narrator = options.narrator;
    this.pending = this.#pendingAtClock();
    // 持续选择就是下一个未结算年份上的预设（快照的 schedulerState.presets，ADR-0008）；
    // 读档后从快照取回，不另存一份。
    const scheduler = SchedulerStateSchema.parse(this.simulation.snapshot().schedulerState);
    const presets = scheduler.presets ?? {};
    const preset = YearlyFocusSchema.safeParse(
      presets[yearlyFocusDecisionKey(this.#focusFromAge())],
    );
    this.#focus = preset.success ? preset.data : null;
  }

  static create(request: RealLifeRequest): GameSession {
    const base = createRealLifeSimulation(request);
    return new GameSession({
      request,
      birth: base.birth,
      pack: base.pack,
      region: base.region,
      simulation: base.simulation,
      facts: [...base.simulation.facts],
      narrator: createRealNarrator(base.pack, base.birth.birthDate),
    });
  }

  static restore(data: GameSaveData): GameSession {
    const base = createRealLifeSimulation(data.request);
    const snapshot = SimulationSnapshotSchema.parse(data.snapshot);
    const facts = SimEventFactSchema.array().parse(data.facts);
    // 事实日志必须与快照的 `lastJournalSequence` 对得上，否则存档内部已经矛盾：
    // 继续推进会在错误的序号上追加事实（M3-034）。交给 storage 的非破坏性路径处理。
    if (snapshot.lastJournalSequence + 1 !== facts.length) {
      throw new Error(
        `Save journal has ${facts.length} fact(s) but the snapshot expects ${snapshot.lastJournalSequence + 1}`,
      );
    }
    for (const [index, fact] of facts.entries()) {
      if (fact.sequence !== index) {
        throw new Error(
          `Save journal fact ${fact.id} has sequence ${fact.sequence}, expected ${index}`,
        );
      }
    }
    const simulation = restoreLifeSimulation(snapshot, base.region);
    return new GameSession({
      reflections: parseReflections(data.reflections),
      request: data.request,
      birth: base.birth,
      pack: base.pack,
      region: base.region,
      simulation,
      facts,
      narrator: createRealNarrator(base.pack, base.birth.birthDate),
    });
  }

  get reflections(): readonly ReflectionRecord[] {
    return this.#reflections;
  }

  recordReflection(record: ReflectionRecord): boolean {
    const next = addReflection(this.#reflections, record);
    if (next === this.#reflections) return false;
    this.#reflections = next;
    return true;
  }

  /** UI preference only; changing the pause policy neither advances nor changes a save. */
  setPausePolicy(policy: PausePolicy): void {
    this.#pauseOn = policy;
    this.pending = this.#pendingAtClock();
  }

  /** 当前与之后的年度重点（M3-037B）。 */
  focusPlan(): FocusPlan {
    const latest = this.#latestFocusFact();
    const fromAge = this.#focusFromAge(latest);
    const actor = this.simulation.state.actors.find(
      (candidate) => candidate.id === this.simulation.activeCharacterId,
    );
    if (!actor) throw new Error('Simulation has no active character');
    const eligibleNow = Object.fromEntries(
      yearlyFocusOptions(actor, fromAge, this.region).map((option) => [option.id, option.eligible]),
    ) as Record<YearlyFocus, boolean>;
    let current: FocusPlan['current'] = null;
    if (latest) {
      const decidedBy = DECIDED_BY.find((value) => value === latest.details?.['decidedBy']);
      if (!decidedBy) throw new Error(`Focus fact ${latest.id} has no valid decidedBy`);
      const ignored = latest.details?.['presetIgnored'];
      current = {
        age: fromAge - 1,
        focus: YearlyFocusSchema.parse(latest.details?.['option']),
        decidedBy,
        presetIgnored: ignored === undefined ? null : YearlyFocusSchema.parse(ignored),
      };
    }
    return { current, fromAge, selected: this.#focus, eligibleNow };
  }

  /**
   * 设定年度重点（M3-037B）：从下一个尚未结算的年份起每年生效，直到再改；`null` 改回按人生原则。
   * 写成每个未来年龄的预设（ADR-0008），随快照保存，所以逐年、快进与直接结局得到相同结果；
   * 某年不可选时内核按人生原则决定并记录被忽略的预设。不推进时间；调用方随后存档。
   */
  setFocus(focus: YearlyFocus | null): void {
    if (this.isEnded) throw new Error('The life has ended');
    for (let age = this.#focusFromAge(); age <= FOCUS_PRESET_MAX_AGE; age += 1) {
      this.simulation.preset(yearlyFocusDecisionKey(age), focus);
    }
    this.#focus = focus;
  }

  get isEnded(): boolean {
    return this.simulation.ended;
  }

  /** 内核的权威当前日期；写入快照并在恢复后保持不变。 */
  get clock(): ISODate {
    return this.simulation.clock;
  }

  /** 界面显示的当前日期。与 {@link clock} 相同，保留旧名字以免调用方到处改名。 */
  get currentDate(): ISODate {
    return this.simulation.clock;
  }

  /** 当前周岁（按规范日历；2 月 29 日出生者在平年取 2 月 28 日）。 */
  get age(): number {
    return Math.max(0, ageOn(this.birth.birthDate, this.clock));
  }

  /** 下一个生日；「下一年」推进到这一天（含当天事件）。 */
  nextAnniversary(): ISODate {
    return addYears(this.birth.birthDate, this.age + 1);
  }

  get summary(): LifeSummary {
    return summarizeLife(this.simulation.snapshot(), this.facts);
  }

  /** 把出生当天的其余事件结算完（0 岁生日的排程等）。创建会话后由调用方调用一次。 */
  settleBirthDay(): StepResult {
    return this.#advance(this.clock);
  }

  /** 推进到下一个生日（含当天事件）；遇到重大决定或死亡提前停。 */
  stepYear(): StepResult {
    if (this.isEnded) {
      return { stopReason: 'protagonist-died', newFacts: [], clock: this.clock };
    }
    if (this.pending) {
      return { stopReason: 'major-decision', newFacts: [], clock: this.clock };
    }
    return this.#advance(this.nextAnniversary());
  }

  /** 快进到下一个重大决定（或死亡）；这就是 M3-034 之前 `advance()` 的行为。 */
  advanceToNextDecision(): void {
    if (this.isEnded || this.pending) return;
    for (let round = 0; round < MAX_ROUNDS; round += 1) {
      const result = this.#advance(FOREVER);
      if (result.stopReason === 'target-reached') return;
      if (this.isEnded || this.pending) return;
    }
    throw new Error('Life did not reach a stable stop');
  }

  /** 旧名字：快进到下一个重大决定。 */
  advance(): void {
    this.advanceToNextDecision();
  }

  /** 作出重大决定；选择后只结算当天，不再自动推进到下一个决定。 */
  choose(optionId: string): void {
    const pending = this.pending;
    if (!pending) throw new Error('No pending decision');
    this.simulation.decide(pending.key, optionId);
    this.pending = null;
    this.#advance(this.simulation.clock);
  }

  /** 自动按人生原则选完所有重大决定，直到死亡；用于“直接模拟至结局”。 */
  finish(): void {
    const previousPolicy = this.#pauseOn;
    this.setPausePolicy('major');
    try {
      for (let round = 0; round < MAX_ROUNDS && !this.isEnded; round += 1) {
        if (this.pending) {
          this.simulation.decide(this.pending.key, this.pending.recommended.optionId);
          this.pending = null;
        }
        this.advanceToNextDecision();
      }
    } finally {
      this.setPausePolicy(previousPolicy);
    }
  }

  render(fact: SimEventFact, locale: Locale): string {
    return this.narrator.render(fact, locale);
  }

  label(name: string, value: string | number | boolean | null, locale: Locale): string {
    return this.narrator.label(name, value, locale);
  }

  currencyName(currency: string, locale: Locale): string {
    return realCurrencyName(this.pack, currency, locale);
  }

  serialize(): GameSaveData {
    return {
      version: 1,
      request: this.request,
      snapshot: this.simulation.snapshot(),
      facts: this.facts,
      reflections: [...this.reflections],
    };
  }

  /** 最近一条主角年度重点的 `decision.made` 事实；它总在最近一年的事实里，从末尾找很快。 */
  #latestFocusFact(): SimEventFact | null {
    for (let index = this.facts.length - 1; index >= 0; index -= 1) {
      const fact = this.facts[index];
      if (
        fact?.type === 'decision.made' &&
        fact.details?.['decision'] === EVENT.yearlyFocus &&
        fact.actorIds[0] === this.simulation.activeCharacterId
      )
        return fact;
    }
    return null;
  }

  /** 下一个尚未结算的年度重点所在年龄：每个生日结算一次，所以是最近一次的下一岁。 */
  #focusFromAge(latest = this.#latestFocusFact()): number {
    return latest ? ageOn(this.birth.birthDate, latest.at) + 1 : 0;
  }

  /**
   * 内核只把「队首」当作待决事项，不看它排在哪个日期；界面只能在决定日期到达当天
   * （`pending.at <= clock`）时显示决定卡，否则会在错误的日期让玩家选择（M3-040）。
   */
  #pendingAtClock(): PendingDecision | null {
    const pending = this.simulation.pendingDecision(this.#pauseOn);
    if (!pending || pending.at > this.simulation.clock) return null;
    return pending;
  }

  /** 推进到 `targetDate`；即使后续事件失败，也同步内核已提交的事实。 */
  #advance(targetDate: ISODate): StepResult {
    const newFacts: SimEventFact[] = [];
    for (let round = 0; round < MAX_ROUNDS; round += 1) {
      const journalStart = this.simulation.facts.length;
      let result: AdvanceResult;
      try {
        result = this.simulation.advanceTo({
          targetDate,
          stopAtMajorDecision: true,
          pauseOn: this.#pauseOn,
          maxWorkUnits: MAX_WORK_PER_ROUND,
        });
      } finally {
        // advanceTo 按单事件提交，抛错不代表整轮回滚。读档后的内核日志只包含
        // 恢复以来的新事实，因此用本轮日志偏移取增量，不能用会话的总事实数切片。
        const committed = this.simulation.facts.slice(journalStart);
        if (committed.length > 0) {
          newFacts.push(...committed);
          this.facts = [...this.facts, ...committed];
        }
      }
      if (result.stopReason === 'work-budget-exhausted') continue;
      if (result.stopReason === 'major-decision') {
        // 内核因为这个决定而停下：它已把时钟设为决定日期，可以直接采用。
        this.pending = result.pendingDecision;
      } else {
        // 其他停止原因下队首仍可能是**未来日期**的决定（内核只看队首、不看日期），
        // 只有排在当前时钟当天或之前的才算待决（M3-040）。
        this.pending = this.#pendingAtClock();
      }
      return { stopReason: result.stopReason, newFacts, clock: this.simulation.clock };
    }
    throw new Error('Life did not reach a stable stop');
  }
}

/** 从 localStorage 读出的 JSON 解析为可恢复的数据；损坏的数据直接抛错。 */
export function parseGameSave(raw: unknown): GameSaveData {
  if (typeof raw !== 'object' || raw === null) throw new Error('Save is not an object');
  const value = raw as Record<string, unknown>;
  if (value['version'] !== 1) throw new Error('Unsupported save version');
  if (typeof value['request'] !== 'object' || value['request'] === null) {
    throw new Error('Save has no request');
  }
  const snapshot = value['snapshot'];
  if (
    typeof snapshot === 'object' &&
    snapshot !== null &&
    'schemaVersion' in snapshot &&
    snapshot.schemaVersion !== SNAPSHOT_SCHEMA_VERSION
  ) {
    throw new SimulationError('incompatible-snapshot', 'Unsupported snapshot schema version', {
      seed: 'save-load',
    });
  }
  return {
    version: 1,
    request: value['request'] as RealLifeRequest,
    snapshot: SimulationSnapshotSchema.parse(value['snapshot']),
    facts: SimEventFactSchema.array().parse(value['facts']),
    reflections: parseReflections(value['reflections']),
  };
}
