import { z } from 'zod';
import { CharacterStateSchema } from './character-state';
import { EntityIdSchema, ISODateSchema } from './primitives';

/**
 * 可恢复的模拟快照（GDD §11.4 `SimulationSnapshot`）。
 *
 * `rngState` 与 `schedulerState` 必须是 JSON 值且不可缺省：只存 `rootSeed`
 * 会丢掉已消费的随机流，恢复后结果会漂移。两者的内部结构由 M1 的实现决定。
 * `relationships` 与 `householdAccounts` 同理，M3 再收紧为具体 schema。
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
    relationships: z.json(),
    householdAccounts: z.json(),
    lastJournalSequence: z.number().int().nonnegative(),
  })
  .refine((snapshot) => snapshot.actors.some((actor) => actor.id === snapshot.activeCharacterId), {
    message: 'activeCharacterId must name one of the actors',
    path: ['activeCharacterId'],
  });
export type SimulationSnapshot = z.infer<typeof SimulationSnapshotSchema>;
