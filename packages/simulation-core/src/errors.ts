import type { ISODate } from '@lifesim/content-schema';

export type SimulationErrorCode =
  | 'unknown-event'
  | 'past-schedule'
  | 'duplicate-event-key'
  | 'event-storm'
  | 'chain-too-deep'
  | 'too-many-schedules'
  | 'unknown-cause'
  | 'invalid-fact'
  | 'invariant-violation'
  | 'invalid-decision'
  | 'no-eligible-option'
  | 'impure-decision-options'
  | 'handler-failed'
  | 'date-regression'
  | 'incompatible-snapshot'
  | 'genesis-failed';

/** 复现一个失败所需的上下文：种子、事件幂等键与日期（M1 验收要求）。 */
export interface SimulationErrorContext {
  seed: string;
  eventKey?: string;
  at?: ISODate;
}

/**
 * 模拟内核的所有失败都抛出这个错误。消息里总是带上种子、事件键与日期，
 * 测试失败或玩家报告缺陷时可以直接复现。
 */
export class SimulationError extends Error {
  readonly code: SimulationErrorCode;
  readonly context: SimulationErrorContext;
  readonly details: readonly string[];

  constructor(
    code: SimulationErrorCode,
    message: string,
    context: SimulationErrorContext,
    options: { cause?: unknown; details?: readonly string[] } = {},
  ) {
    const where = [
      `seed=${context.seed}`,
      context.eventKey ? `event=${context.eventKey}` : null,
      context.at ? `at=${context.at}` : null,
    ]
      .filter(Boolean)
      .join(' ');
    const detailText = options.details?.length ? `\n  - ${options.details.join('\n  - ')}` : '';
    super(`[${code}] ${message} (${where})${detailText}`, { cause: options.cause });
    this.name = 'SimulationError';
    this.code = code;
    this.context = context;
    this.details = options.details ?? [];
  }
}
