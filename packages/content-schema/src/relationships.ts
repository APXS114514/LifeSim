import { z } from 'zod';
import { EntityIdSchema, ISODateSchema } from './primitives.ts';

/**
 * 关系图（GDD §6.3）：区分双向主观感受与客观法定/生物/共同居住事实。
 * 婚姻、亲子、收养、兄弟姐妹是客观关系；bonds 是两个人各自的主观感受。
 *
 * 本契约不包含性别、共同账户或财产份额；这些分别由 Q1/Q2 决定。
 */
export const RELATIONSHIP_KINDS = [
  'parent-child',
  'adoptive-parent-child',
  'sibling',
  'spouse',
  'former-spouse',
] as const;
export type RelationshipKind = (typeof RELATIONSHIP_KINDS)[number];

export const BondSchema = z.strictObject({
  trust: z.number().min(0).max(1),
  intimacy: z.number().min(0).max(1),
  conflict: z.number().min(0).max(1),
});
export type Bond = z.infer<typeof BondSchema>;

export const RelationshipSchema = z
  .strictObject({
    id: EntityIdSchema,
    kind: z.enum(RELATIONSHIP_KINDS),
    /** 有序对：parent-child 是 [父/母, 子/女]；sibling 与婚姻按创建时的顺序。 */
    fromId: EntityIdSchema,
    toId: EntityIdSchema,
    since: ISODateSchema,
    /** null 表示仍然有效（婚姻未解除、亲子关系持续、共同居住持续）。 */
    until: ISODateSchema.nullable(),
    /** 客观事实，与主观感受分开（GDD §6.3）。 */
    biological: z.boolean(),
    legal: z.boolean(),
    coResident: z.boolean(),
    /** 双向主观感受：键只能是 fromId 或 toId，且两者都必须存在。 */
    bonds: z.record(EntityIdSchema, BondSchema),
  })
  .superRefine((relationship, ctx) => {
    const { fromId, toId, since, until, bonds, kind } = relationship;
    if (fromId === toId) {
      ctx.addIssue({
        code: 'custom',
        message: 'A relationship cannot link an actor to themselves',
        path: ['toId'],
      });
    }
    if (until !== null && until < since) {
      ctx.addIssue({
        code: 'custom',
        message: 'until cannot be earlier than since',
        path: ['until'],
      });
    }
    const bondKeys = Object.keys(bonds);
    if (!bondKeys.every((key) => key === fromId || key === toId)) {
      ctx.addIssue({
        code: 'custom',
        message: 'bonds may only contain the two relationship parties',
        path: ['bonds'],
      });
    }
    if (!(fromId in bonds) || !(toId in bonds)) {
      ctx.addIssue({
        code: 'custom',
        message: 'bonds must contain both directions',
        path: ['bonds'],
      });
    }
    if (kind === 'spouse' && (relationship.biological || until !== null)) {
      ctx.addIssue({
        code: 'custom',
        message: 'An active spouse relationship is not biological and has no end date',
        path: ['kind'],
      });
    }
    if (kind === 'former-spouse' && (relationship.biological || until === null)) {
      ctx.addIssue({
        code: 'custom',
        message: 'A former spouse relationship is not biological and must have an end date',
        path: ['kind'],
      });
    }
  });
export type Relationship = z.infer<typeof RelationshipSchema>;

function checkArray(relationships: readonly Relationship[], ctx: z.RefinementCtx): void {
  const ids = new Set<string>();
  const duplicates = new Set<string>();
  const siblings = new Set<string>();
  const activeSpouses = new Set<string>();

  relationships.forEach((relationship, index) => {
    if (ids.has(relationship.id)) {
      ctx.addIssue({
        code: 'custom',
        message: `duplicate relationship id ${relationship.id}`,
        path: [index, 'id'],
      });
    }
    ids.add(relationship.id);

    const key = [
      relationship.kind,
      relationship.fromId,
      relationship.toId,
      relationship.since,
    ].join('|');
    if (duplicates.has(key)) {
      ctx.addIssue({
        code: 'custom',
        message: 'duplicate relationship',
        path: [index],
      });
    }
    duplicates.add(key);

    if (relationship.kind === 'sibling') {
      const pair = [relationship.fromId, relationship.toId].sort().join('|');
      if (siblings.has(pair)) {
        ctx.addIssue({
          code: 'custom',
          message: 'duplicate sibling relationship',
          path: [index],
        });
      }
      siblings.add(pair);
    }

    if (relationship.kind === 'spouse' && relationship.until === null) {
      for (const actorId of [relationship.fromId, relationship.toId]) {
        if (activeSpouses.has(actorId)) {
          ctx.addIssue({
            code: 'custom',
            message: 'an actor can have at most one active spouse relationship',
            path: [index],
          });
        }
        activeSpouses.add(actorId);
      }
    }
  });

  // 亲子图（生物 + 收养）必须无环；允许同一对亲子同时有生物与收养两条边。
  const edges = relationships
    .map((relationship, index) => ({ relationship, index }))
    .filter(
      ({ relationship }) =>
        relationship.kind === 'parent-child' || relationship.kind === 'adoptive-parent-child',
    )
    .map(({ relationship, index }) => ({
      from: relationship.fromId,
      to: relationship.toId,
      index,
    }));
  const adjacency = new Map<string, { to: string; index: number }[]>();
  for (const edge of edges) {
    const list = adjacency.get(edge.from) ?? [];
    list.push({ to: edge.to, index: edge.index });
    adjacency.set(edge.from, list);
  }
  const state = new Map<string, 0 | 1 | 2>();
  const visit = (actorId: string): boolean => {
    state.set(actorId, 1);
    for (const edge of adjacency.get(actorId) ?? []) {
      const next = state.get(edge.to) ?? 0;
      if (next === 1) {
        ctx.addIssue({
          code: 'custom',
          message: 'parent-child relationships must not form a cycle',
          path: [edge.index],
        });
        return true;
      }
      if (next === 0 && visit(edge.to)) return true;
    }
    state.set(actorId, 2);
    return false;
  };
  for (const actorId of adjacency.keys()) {
    if ((state.get(actorId) ?? 0) === 0 && visit(actorId)) break;
  }
}

export const RelationshipsSchema = z.array(RelationshipSchema).superRefine(checkArray);
export type Relationships = z.infer<typeof RelationshipsSchema>;
