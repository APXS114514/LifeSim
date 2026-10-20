import { z } from 'zod';
import { EntityIdSchema, ISODateSchema, compareISODate } from './primitives';

/**
 * 人生原则的价值维度（GDD §6.2）：代理决策按这些偏好给可行行动打分。
 * 权重是 0–1 的相对偏好，不要求加总为 1。
 */
export const LIFE_PRINCIPLE_KEYS = [
  'family',
  'wealth',
  'health',
  'knowledge',
  'risk',
  'stability',
] as const;
export type LifePrincipleKey = (typeof LIFE_PRINCIPLE_KEYS)[number];

const weight = z.number().min(0).max(1);

export const LifePrinciplesSchema = z.strictObject({
  family: weight,
  wealth: weight,
  health: weight,
  knowledge: weight,
  risk: weight,
  stability: weight,
});
export type LifePrinciples = z.infer<typeof LifePrinciplesSchema>;

/** 死亡状态必须指向记录死亡的那条事实，死因只抽样一次（GDD §8.3）。 */
export const VitalStatusSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('alive') }),
  z.strictObject({
    kind: z.literal('deceased'),
    deathDate: ISODateSchema,
    deathFactId: EntityIdSchema,
  }),
]);
export type VitalStatus = z.infer<typeof VitalStatusSchema>;

/**
 * 主角或已实例化 NPC 的底层状态骨架（GDD §6.1、§6.3）。
 *
 * - `tier`：主角、Tier1 核心亲友、Tier2 一般人物；Tier3 统计人口不逐人实例化。
 * - 地理字段彼此分离（GDD §5）：出生地不可变，居住地、政治归属、国籍各自变化。
 * - 健康/幸福/经济/知识/关系等表层指标不存储，由底层状态的函数派生。
 *
 * 教育、技能、职业、财务、健康病程等系统字段在 M1/M3 按 GDD §6.1 补充。
 */
export const CharacterStateSchema = z
  .strictObject({
    id: EntityIdSchema,
    tier: z.enum(['protagonist', 'tier1', 'tier2']),
    birthDate: ISODateSchema,
    birthPlaceId: EntityIdSchema,
    currentResidenceId: EntityIdSchema,
    politicalEntityId: EntityIdSchema,
    citizenshipIds: z.array(EntityIdSchema),
    vitalStatus: VitalStatusSchema,
    lifePrinciples: LifePrinciplesSchema,
  })
  .refine(
    (character) =>
      character.vitalStatus.kind === 'alive' ||
      compareISODate(character.vitalStatus.deathDate, character.birthDate) >= 0,
    { message: 'deathDate cannot precede birthDate', path: ['vitalStatus', 'deathDate'] },
  );
export type CharacterState = z.infer<typeof CharacterStateSchema>;
