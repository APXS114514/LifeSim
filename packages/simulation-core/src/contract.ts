import {
  ISODateSchema,
  type ISODate,
  type SimEventFact,
  type SimulationSnapshot,
} from '@lifesim/content-schema';
import { z } from 'zod';
import type { PendingDecision } from './types.ts';

/**
 * 模拟引擎的对外契约。
 *
 * GDD §4.1：逐年、快进、自动三种模式最终都调用同一个 `advanceTo`，
 * 快进只省略展示，不省略状态变化。
 */

/**
 * 暂停策略（ADR-0008）：`major` 只在重大决定前暂停（缺省，即原行为）；`all` 在任何没有选择也没有预设的
 * 决定前暂停。标为 `background` 的决定永不暂停。暂停与否不改变结果，所以它不写进快照。
 */
export const PausePolicySchema = z.enum(['major', 'all']);
export type PausePolicy = z.infer<typeof PausePolicySchema>;

/** GDD §11.4 `AdvanceRequest`。`maxWorkUnits` 是单次调用最多处理的事件数，用完即返回、可续跑。 */
export const AdvanceRequestSchema = z.strictObject({
  targetDate: ISODateSchema,
  stopAtMajorDecision: z.boolean(),
  maxWorkUnits: z.number().int().positive(),
  pauseOn: PausePolicySchema.optional(),
});
export type AdvanceRequest = z.infer<typeof AdvanceRequestSchema>;

export type AdvanceStopReason =
  'target-reached' | 'major-decision' | 'work-budget-exhausted' | 'cancelled' | 'protagonist-died';

export interface AdvanceResult {
  /** 推进器的时钟：到达目标时等于 `targetDate`，提前停止时是最后处理的事件日期。 */
  reachedDate: ISODate;
  stopReason: AdvanceStopReason;
  /** 本次推进新追加到事件日志的事实，按 `sequence` 递增。 */
  newFacts: readonly SimEventFact[];
  /** `stopReason` 为 `major-decision` 时，等待玩家选择的决定。 */
  pendingDecision: PendingDecision | null;
}

/** 由调用方（界面的暂停/取消按钮、Worker RPC）持有，引擎在每个事件之间检查。 */
export interface CancellationToken {
  readonly cancelled: boolean;
}

export interface SimulationEngine {
  advanceTo(request: AdvanceRequest, cancellation?: CancellationToken): AdvanceResult;
  /** 玩家对当前待决事项作出选择，记入动作序列；下一次 `advanceTo` 按它结算。 */
  decide(decisionKey: string, optionId: string): void;
  /** 为尚未处理的决策事件预设选项（`null` 清除）；事件发生时若不合格，改由人生原则决定（ADR-0008）。 */
  preset(decisionKey: string, optionId: string | null): void;
  pendingDecision(pauseOn?: PausePolicy): PendingDecision | null;
  snapshot(): SimulationSnapshot;
}
