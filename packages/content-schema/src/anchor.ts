import { z } from 'zod';
import { EvidenceMetaSchema } from './evidence.ts';
import { EntityIdSchema, ISODateSchema } from './primitives.ts';

/**
 * 固定的宏观历史锚点（GDD §4.2）。锚点按日期发生、不受玩家选择影响；
 * 它改变宏观状态，个人后果由系统规则按角色当时的状态结算。
 *
 * M1 实现币制重定值与经济周期阶段；M2 增加政体更替（ADR-0005）。
 * 把政体更替作用到在世角色（例如 1991 年后的国籍）属于 M3 的人生规则。
 */
const anchorBase = {
  id: EntityIdSchema,
  at: ISODateSchema,
  /** 适用的地区包 ID。 */
  regionIds: z.array(z.string().min(1)).min(1),
  evidence: EvidenceMetaSchema,
};

export const ECONOMY_PHASES = ['normal', 'recession'] as const;
export type EconomyPhase = (typeof ECONOMY_PHASES)[number];

export const HistoricalAnchorSchema = z
  .discriminatedUnion('kind', [
    z.strictObject({
      ...anchorBase,
      kind: z.literal('redenomination'),
      currencyCode: z.string().regex(/^[A-Z]{3}$/),
      fromVersion: z.number().int().positive(),
      toVersion: z.number().int().positive(),
      /** 旧币多少单位换 1 单位新币。 */
      divisor: z.number().int().min(2),
    }),
    z.strictObject({
      ...anchorBase,
      kind: z.literal('economy-phase'),
      phase: z.enum(ECONOMY_PHASES),
    }),
    z.strictObject({
      ...anchorBase,
      kind: z.literal('polity-change'),
      /** 更替前的政治实体（其有效期应在 at 当天结束）。 */
      fromEntityId: EntityIdSchema,
      /** 更替后的政治实体（其有效期应从 at 当天开始）。 */
      toEntityId: EntityIdSchema,
    }),
  ])
  .superRefine((anchor, ctx) => {
    if (anchor.kind === 'redenomination' && anchor.toVersion <= anchor.fromVersion) {
      ctx.addIssue({
        code: 'custom',
        message: 'toVersion must be newer than fromVersion',
        path: ['toVersion'],
      });
    }
    if (anchor.kind === 'polity-change' && anchor.fromEntityId === anchor.toEntityId) {
      ctx.addIssue({
        code: 'custom',
        message: 'fromEntityId and toEntityId must differ',
        path: ['toEntityId'],
      });
    }
  });
export type HistoricalAnchor = z.infer<typeof HistoricalAnchorSchema>;
