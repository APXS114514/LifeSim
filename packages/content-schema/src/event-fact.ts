import { z } from 'zod';
import { EntityIdSchema, ISODateSchema, compareISODate } from './primitives.ts';

/** 渲染叙事所需的结构化参数：标量值，键名为驼峰，与语言无关。 */
export const FactDetailsSchema = z.record(
  z.string().regex(/^[a-z][A-Za-z0-9]*$/, { message: 'Detail keys are camelCase' }),
  z.union([z.string(), z.number(), z.boolean(), z.null()]),
);
export type FactDetails = z.infer<typeof FactDetailsSchema>;

/**
 * 不可变的人生事实（GDD §7 与 §11.4 `SimEventFact`）。
 * 只存语言无关的结构化结果；中英叙事由 `templateId` 渲染，换语言不重抽结果。
 * 比 GDD 草案多两个字段：
 * - `sequence`：事件日志的单调序号，与快照的 `lastJournalSequence` 对应；
 * - `details`：见 `FactDetailsSchema`。
 */
export const SimEventFactSchema = z
  .strictObject({
    id: EntityIdSchema,
    sequence: z.number().int().nonnegative(),
    type: z.string().min(1),
    at: ISODateSchema,
    actorIds: z.array(EntityIdSchema),
    causeEventIds: z.array(EntityIdSchema),
    outcomeCode: z.string().min(1),
    templateId: z.string().min(1),
    evidenceIds: z.array(z.string().min(1)),
    eventVersion: z.number().int().positive(),
    details: FactDetailsSchema.optional(),
  })
  .refine((fact) => !fact.causeEventIds.includes(fact.id), {
    message: 'An event fact cannot cite itself as a cause',
    path: ['causeEventIds'],
  });
export type SimEventFact = z.infer<typeof SimEventFactSchema>;

export type JournalIssue =
  | { kind: 'duplicate-id'; factId: string; sequence: number }
  | { kind: 'sequence-gap'; factId: string; expected: number; actual: number }
  | { kind: 'date-regression'; factId: string; previousAt: string; at: string }
  | { kind: 'forward-cause'; factId: string; causeId: string }
  | { kind: 'unknown-cause'; factId: string; causeId: string };

export interface JournalCheckOptions {
  /**
   * 日志是否从第一条事实开始。为 true 时，引用列表外事实的原因视为错误；
   * 为 false（检查一个分页切片）时，只能确认原因不指向切片里更晚的事实。
   */
  complete: boolean;
}

/**
 * 检查已通过单条 schema 校验的事实序列的跨条目不变量：
 * 序号连续、日期不倒流（GDD §7）、ID 不复用、原因只指向更早的事实。
 */
export function checkJournalInvariants(
  facts: readonly SimEventFact[],
  options: JournalCheckOptions,
): JournalIssue[] {
  const issues: JournalIssue[] = [];
  const seen = new Set<string>();
  const idsInJournal = new Set(facts.map((fact) => fact.id));
  let previous: SimEventFact | undefined;

  for (const fact of facts) {
    if (seen.has(fact.id)) {
      issues.push({ kind: 'duplicate-id', factId: fact.id, sequence: fact.sequence });
    }
    if (previous) {
      const expected = previous.sequence + 1;
      if (fact.sequence !== expected) {
        issues.push({ kind: 'sequence-gap', factId: fact.id, expected, actual: fact.sequence });
      }
      if (compareISODate(fact.at, previous.at) < 0) {
        issues.push({
          kind: 'date-regression',
          factId: fact.id,
          previousAt: previous.at,
          at: fact.at,
        });
      }
    }
    for (const causeId of fact.causeEventIds) {
      if (seen.has(causeId)) continue;
      if (idsInJournal.has(causeId)) {
        issues.push({ kind: 'forward-cause', factId: fact.id, causeId });
      } else if (options.complete) {
        issues.push({ kind: 'unknown-cause', factId: fact.id, causeId });
      }
    }
    seen.add(fact.id);
    previous = fact;
  }
  return issues;
}
