import { z } from 'zod';
import { CharacterStateSchema } from './character-state.ts';
import { HouseholdAccountSchema } from './money.ts';
import { RelationshipsSchema } from './relationships.ts';
import { EntityIdSchema, ISODateSchema } from './primitives.ts';

/**
 * 可恢复的模拟快照（GDD §11.4 `SimulationSnapshot`）。
 *
 * `rngState` 与 `schedulerState` 必须是 JSON 值且不可缺省：恢复时需要知道随机数算法版本
 * 与事件队列的完整状态，否则结果会漂移。两者的内部结构由模拟内核定义并在恢复时校验。
 * `relationships` 由 M3 的关系契约定义（zod schema），恢复时校验两端角色存在。
 *
 * `world` 是宏观状态（当前币制版本、经济周期等），由历史锚点改变；
 * 它的结构由系统层定义并在读取时校验。
 */
export const SimulationSnapshotSchema = z
  .strictObject({
    schemaVersion: z.number().int().positive(),
    engineVersion: z.string().min(1),
    dataPackVersions: z.record(z.string().min(1), z.string().min(1)),
    at: ISODateSchema,
    rootSeed: z.string().min(1),
    rngState: z.json(),
    schedulerState: z.json(),
    activeCharacterId: EntityIdSchema,
    actors: z.array(CharacterStateSchema).min(1),
    world: z.json(),
    relationships: RelationshipsSchema,
    householdAccounts: z.array(HouseholdAccountSchema),
    lastJournalSequence: z.number().int().nonnegative(),
  })
  .superRefine((snapshot, ctx) => {
    const actorIds = new Set(snapshot.actors.map((actor) => actor.id));
    if (!actorIds.has(snapshot.activeCharacterId)) {
      ctx.addIssue({
        code: 'custom',
        message: 'activeCharacterId must name one of the actors',
        path: ['activeCharacterId'],
      });
    }
    snapshot.householdAccounts.forEach((account, index) => {
      if (!account.ownerIds.every((owner) => actorIds.has(owner))) {
        ctx.addIssue({
          code: 'custom',
          message: `Account ${account.id} has an owner who is not an actor`,
          path: ['householdAccounts', index, 'ownerIds'],
        });
      }
    });
    snapshot.relationships.forEach((relationship, index) => {
      for (const side of ['fromId', 'toId'] as const) {
        if (!actorIds.has(relationship[side])) {
          ctx.addIssue({
            code: 'custom',
            message: `Relationship ${relationship.id} references an unknown actor`,
            path: ['relationships', index, side],
          });
        }
      }
    });
  });
export type SimulationSnapshot = z.infer<typeof SimulationSnapshotSchema>;
