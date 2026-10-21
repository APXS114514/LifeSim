import type {
  CharacterState,
  FactDetails,
  HouseholdAccount,
  ISODate,
  LifePrincipleKey,
  Relationships,
} from '@lifesim/content-schema';
import type { JsonValue } from './json.ts';
import type { RandomStream } from './random.ts';
import type { Occurrence } from './scheduler.ts';

/** 权威世界状态。事件处理器拿到的是它的一份草稿，处理成功才整体提交（原子结算）。 */
export interface SimState {
  actors: CharacterState[];
  householdAccounts: HouseholdAccount[];
  relationships: Relationships;
  world: JsonValue;
}

export interface FactDraft {
  type: string;
  outcomeCode: string;
  actorIds: string[];
  /** 缺省与 `type` 相同。 */
  templateId?: string;
  /** 缺省取引发本事件的事实（`occurrence.causeFactIds`）。 */
  causes?: readonly string[];
  evidenceIds?: readonly string[];
  details?: FactDetails;
}

export interface ScheduleRequest {
  type: string;
  at: ISODate;
  entityId: string;
  period: string;
  payload?: JsonValue;
  causes?: readonly string[];
}

export type PrincipleScores = Partial<Record<LifePrincipleKey, number>>;

export interface DecisionOption {
  id: string;
  eligible: boolean;
  /** 不可选时的原因代码，供界面与日志说明。 */
  ineligibleReason?: string;
  /** 各价值维度上的得分（-1–1），代理按人生原则加权求和。 */
  scores: PrincipleScores;
}

export interface Choice {
  optionId: string;
  decidedBy: 'player' | 'principles';
  /** 代理决策时贡献最大的价值维度；玩家决定时为空。 */
  reasons: LifePrincipleKey[];
  /** 记录这次决定的 `decision.made` 事实。 */
  factId: string;
}

export interface DecisionSpec {
  /** 重大不可逆决定：按介入策略暂停等玩家选择（GDD §2 决定 03、§6.2）。 */
  major: boolean;
  actorId(occurrence: Occurrence): string;
  /** 列出选项及资格。必须是纯函数：不修改状态，不抽随机数。 */
  options(context: EventContext): DecisionOption[];
}

export interface EventContext {
  /** 事件发生的日期。处理器只能读它，不能读推进器的时钟。 */
  readonly at: ISODate;
  readonly occurrence: Occurrence;
  /** 状态草稿，可以直接修改；处理器抛错或不变量失败时整份丢弃。 */
  readonly state: SimState;
  /** 本事件独占的随机流，由根种子和事件幂等键派生。 */
  readonly random: RandomStream;
  /** 决策事件的结果；普通事件为 null。 */
  readonly choice: Choice | null;
  actor(id: string): CharacterState;
  /** 追加一条事实，返回它的 ID。 */
  emit(fact: FactDraft): string;
  /** 安排后续事件；日期不能早于当前事件。 */
  schedule(request: ScheduleRequest): void;
}

export interface EventDefinition {
  type: string;
  /** 规则版本，写入事实的 `eventVersion`。 */
  version: number;
  priority: number;
  decision?: DecisionSpec;
  handle(context: EventContext): void;
}

export interface Invariant {
  id: string;
  /** 返回违规描述；空数组表示通过。 */
  check(state: SimState, at: ISODate): string[];
}

export interface SimulationModule {
  id: string;
  events: readonly EventDefinition[];
  invariants?: readonly Invariant[];
}

export interface PendingDecision {
  key: string;
  type: string;
  at: ISODate;
  actorId: string;
  options: DecisionOption[];
  /** 按角色人生原则给出的建议，供界面展示「如果交给代理会怎么选」。 */
  recommended: { optionId: string; reasons: LifePrincipleKey[] };
}
