import { z } from 'zod';
import {
  ISODateSchema,
  type ISODate,
  type SimEventFact,
  type SimulationSnapshot,
} from '@lifesim/content-schema';

/**
 * M0 只固定模拟引擎的对外契约；规范推进器、随机流与事件引擎在 M1 实现。
 *
 * GDD §4.1：逐年、快进、自动三种模式最终都调用同一个 `advanceTo`，
 * 快进只省略展示，不省略状态变化。
 */

/** GDD §11.4 `AdvanceRequest`。`maxWorkUnits` 是单次调用的处理预算，用完即返回、可续跑。 */
export const AdvanceRequestSchema = z.strictObject({
  targetDate: ISODateSchema,
  stopAtMajorDecision: z.boolean(),
  maxWorkUnits: z.number().int().positive(),
});
export type AdvanceRequest = z.infer<typeof AdvanceRequestSchema>;

export type AdvanceStopReason =
  'target-reached' | 'major-decision' | 'work-budget-exhausted' | 'cancelled' | 'protagonist-died';

export interface AdvanceResult {
  /** 实际推进到的模拟日期；提前停止时早于 `targetDate`。 */
  reachedDate: ISODate;
  stopReason: AdvanceStopReason;
  /** 本次推进新追加到事件日志的事实，按 `sequence` 递增。 */
  newFacts: readonly SimEventFact[];
}

/** 由调用方（UI 的暂停/取消按钮、Worker RPC）持有，引擎在每个工作单元之间检查。 */
export interface CancellationToken {
  readonly cancelled: boolean;
}

export interface SimulationEngine {
  advanceTo(request: AdvanceRequest, cancellation?: CancellationToken): AdvanceResult;
  snapshot(): SimulationSnapshot;
}
