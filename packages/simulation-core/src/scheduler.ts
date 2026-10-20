import { EntityIdSchema, ISODateSchema } from '@lifesim/content-schema';
import { z } from 'zod';

/**
 * 一个待处理的事件实例。`key = type|entityId|period` 是幂等键（GDD §7）：
 * 同一个键在一局里最多处理一次，它同时是该事件随机流的派生键。
 */
export const OccurrenceSchema = z.strictObject({
  key: z.string().min(1),
  type: z.string().min(1),
  at: ISODateSchema,
  /** 同一天内的处理顺序，数字小的先处理。 */
  priority: z.number().int(),
  entityId: EntityIdSchema,
  period: z.string().min(1),
  payload: z.json(),
  /** 由哪些事实引发；该事件产生的事实默认以它们为原因。 */
  causeFactIds: z.array(EntityIdSchema),
  /** 同一天内由事件连锁触发的深度，用于发现无限递归。 */
  depth: z.number().int().nonnegative(),
});
export type Occurrence = z.infer<typeof OccurrenceSchema>;

export function occurrenceKey(type: string, entityId: string, period: string): string {
  return `${type}|${entityId}|${period}`;
}

/**
 * 全序：日期 → 优先级 → 幂等键。与插入顺序无关，
 * 因此逐年推进、快进、分批推进、从快照恢复看到的处理顺序完全相同。
 */
export function compareOccurrences(a: Occurrence, b: Occurrence): number {
  if (a.at !== b.at) return a.at < b.at ? -1 : 1;
  if (a.priority !== b.priority) return a.priority - b.priority;
  if (a.key !== b.key) return a.key < b.key ? -1 : 1;
  return 0;
}

/** 按全序排列的事件队列（一局人生的队列很短，有序数组加二分插入即可）。 */
export class EventQueue {
  #items: Occurrence[] = [];
  #keys = new Set<string>();

  constructor(items: readonly Occurrence[] = []) {
    for (const item of items) this.insert(item);
  }

  get size(): number {
    return this.#items.length;
  }

  has(key: string): boolean {
    return this.#keys.has(key);
  }

  peek(): Occurrence | undefined {
    return this.#items[0];
  }

  shift(): Occurrence | undefined {
    const head = this.#items.shift();
    if (head) this.#keys.delete(head.key);
    return head;
  }

  /** 插入；同键事件已在队列中时返回 false 且不插入（先到者保留）。 */
  insert(item: Occurrence): boolean {
    if (this.#keys.has(item.key)) return false;
    let low = 0;
    let high = this.#items.length;
    while (low < high) {
      const middle = (low + high) >>> 1;
      const current = this.#items[middle];
      if (current && compareOccurrences(current, item) <= 0) low = middle + 1;
      else high = middle;
    }
    this.#items.splice(low, 0, item);
    this.#keys.add(item.key);
    return true;
  }

  clear(): void {
    this.#items = [];
    this.#keys.clear();
  }

  toArray(): Occurrence[] {
    return [...this.#items];
  }
}

/** 快照中 `schedulerState` 的结构。 */
export const SchedulerStateSchema = z.strictObject({
  queue: z.array(OccurrenceSchema),
  processedKeys: z.array(z.string().min(1)),
  /** 玩家对决策的选择（动作序列），键为决策事件的幂等键。 */
  decisions: z.record(z.string().min(1), z.string().min(1)),
  ended: z.boolean(),
  dayCounter: z.strictObject({
    at: ISODateSchema.nullable(),
    count: z.number().int().nonnegative(),
  }),
});
export type SchedulerState = z.infer<typeof SchedulerStateSchema>;

export const RngStateSchema = z.strictObject({ algorithm: z.string().min(1) });
