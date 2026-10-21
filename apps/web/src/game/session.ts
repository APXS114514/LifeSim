import {
  SimEventFactSchema,
  SimulationSnapshotSchema,
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
import type { PendingDecision, Simulation } from '@lifesim/simulation-core';
import {
  restoreLifeSimulation,
  summarizeLife,
  type LifeSummary,
  type RegionModel,
} from '@lifesim/systems';

export interface GameSaveData {
  version: 1;
  request: RealLifeRequest;
  snapshot: SimulationSnapshot;
  facts: SimEventFact[];
}

export interface GameSessionOptions {
  request: RealLifeRequest;
  birth: BirthContext;
  pack: CountryPack;
  region: RegionModel;
  simulation: Simulation;
  facts: SimEventFact[];
  narrator: RealNarrator;
}

/**
 * 网页可玩切片的一局人生。
 *
 * 事实与快照由 deterministic kernel 产生；本类只负责推进、决策与渲染，
 * 不重新抽样，也不把 React state 当作权威状态。
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

  private constructor(options: GameSessionOptions) {
    this.request = options.request;
    this.birth = options.birth;
    this.pack = options.pack;
    this.region = options.region;
    this.simulation = options.simulation;
    this.facts = options.facts;
    this.narrator = options.narrator;
    this.pending = options.simulation.pendingDecision();
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
    const simulation = restoreLifeSimulation(snapshot, base.region);
    return new GameSession({
      request: data.request,
      birth: base.birth,
      pack: base.pack,
      region: base.region,
      simulation,
      facts,
      narrator: createRealNarrator(base.pack, base.birth.birthDate),
    });
  }

  get isEnded(): boolean {
    return this.simulation.ended;
  }

  get currentDate(): string {
    return this.facts[this.facts.length - 1]?.at ?? this.birth.birthDate;
  }

  get summary(): LifeSummary {
    return summarizeLife(this.simulation.snapshot(), this.facts);
  }

  /** 推进到下一个重大决定、死亡或目标年份；可安全地重复调用。 */
  advance(): void {
    if (this.isEnded) return;
    for (let round = 0; round < 10_000; round += 1) {
      const result = this.simulation.advanceTo({
        targetDate: '2200-01-01',
        stopAtMajorDecision: true,
        maxWorkUnits: 100_000,
      });
      this.facts = [...this.facts, ...result.newFacts];
      if (result.stopReason === 'major-decision' && result.pendingDecision) {
        this.pending = result.pendingDecision;
        return;
      }
      this.pending = null;
      if (result.stopReason === 'work-budget-exhausted') continue;
      return;
    }
    throw new Error('Life did not reach a stable stop');
  }

  choose(optionId: string): void {
    const pending = this.pending;
    if (!pending) throw new Error('No pending decision');
    this.simulation.decide(pending.key, optionId);
    this.pending = null;
    this.advance();
  }

  /** 自动按人生原则选完所有重大决定，直到死亡；用于“直接看结局”。 */
  finish(): void {
    for (let round = 0; round < 10_000 && !this.isEnded; round += 1) {
      if (this.pending) {
        this.simulation.decide(this.pending.key, this.pending.recommended.optionId);
        this.pending = null;
      }
      this.advance();
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
    };
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
  return {
    version: 1,
    request: value['request'] as RealLifeRequest,
    snapshot: SimulationSnapshotSchema.parse(value['snapshot']),
    facts: SimEventFactSchema.array().parse(value['facts']),
  };
}
