import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { DraftTransaction } from './draft.ts';
import { canonicalJson, cloneJson } from './json.ts';
import type { SimState } from './types.ts';

/** 测试夹具：结构上像模拟状态的普通 JSON（不是有效的角色，只测事务机制）。 */
interface FixtureActor {
  id: string;
  health: { conditions: { id: string; treated: boolean }[] };
  tags: string[];
  score?: number;
}
interface FixtureState {
  actors: FixtureActor[];
  householdAccounts: { id: string; balanceMinor: number }[];
  relationships: unknown[];
  world: { macro?: { phase: string }; counter?: number; [key: string]: unknown };
}

function fixtureState(): SimState {
  const state: FixtureState = {
    actors: [
      { id: 'a', health: { conditions: [{ id: 'c1', treated: false }] }, tags: ['x', 'y'] },
      { id: 'b', health: { conditions: [] }, tags: [] },
    ],
    householdAccounts: [{ id: 'acc', balanceMinor: 10 }],
    relationships: [],
    world: { macro: { phase: 'normal' }, counter: 1 },
  };
  return state as unknown as SimState;
}

function view(value: unknown): FixtureState {
  return value as FixtureState;
}

/** 测试夹具里取数组元素：越界说明测试本身写错了。 */
function at<T>(items: readonly T[], index: number): T {
  const item = items[index];
  if (item === undefined) throw new Error(`fixture index ${index} is out of range`);
  return item;
}

function first(state: FixtureState): FixtureActor {
  return at(state.actors, 0);
}

describe('copy-on-write transactions (ADR-0011)', () => {
  it('returns the committed state itself when nothing was written, even after reads', () => {
    const base = fixtureState();
    const transaction = new DraftTransaction(base);
    const root = view(transaction.root);
    expect(at(first(root).health.conditions, 0).id).toBe('c1');
    expect(root.actors.find((actor) => actor.id === 'b')?.tags).toEqual([]);
    const { state, problem } = transaction.commit();
    expect(problem).toBeNull();
    expect(state).toBe(base);
  });

  it('copies only the written path and shares every untouched branch', () => {
    const base = fixtureState();
    const before = canonicalJson(base);
    const transaction = new DraftTransaction(base);
    at(first(view(transaction.root)).health.conditions, 0).treated = true;
    const next = view(transaction.commit().state);
    const old = view(base);
    expect(at(first(next).health.conditions, 0).treated).toBe(true);
    // 写过的路径是新对象，没写过的分支沿用原引用。
    expect(next.actors).not.toBe(old.actors);
    expect(first(next)).not.toBe(first(old));
    expect(first(next).tags).toBe(first(old).tags);
    expect(at(next.actors, 1)).toBe(at(old.actors, 1));
    expect(next.householdAccounts).toBe(old.householdAccounts);
    expect(next.world).toBe(old.world);
    // 已提交的状态从未被修改。
    expect(canonicalJson(base)).toBe(before);
  });

  it('handles array push, splice, index writes, length and property deletion', () => {
    const base = fixtureState();
    const transaction = new DraftTransaction(base);
    const root = view(transaction.root);
    first(root).tags.push('z');
    first(root).tags.splice(0, 1);
    at(root.actors, 1).tags[2] = 'late';
    at(root.actors, 1).tags.length = 3;
    delete root.world.counter;
    const { state, problem } = transaction.commit();
    expect(first(view(state)).tags).toEqual(['y', 'z']);
    expect(view(state).world).toEqual({ macro: { phase: 'normal' } });
    expect(Object.hasOwn(view(state).world, 'counter')).toBe(false);
    expect(first(view(base)).tags).toEqual(['x', 'y']);
    expect(view(base).world.counter).toBe(1);
    // 稀疏数组不是 JSON：索引 0、1 没有值。
    expect(problem).toMatch(/Undefined value at \$\.actors\[1\]\.tags\[0\]/);
  });

  it('keeps the draft identity of an element moved inside an array', () => {
    const transaction = new DraftTransaction(fixtureState());
    const root = view(transaction.root);
    const moved = first(root);
    root.actors.reverse();
    expect(at(root.actors, 1)).toBe(moved);
    expect(root.actors.indexOf(moved)).toBe(1);
    moved.tags.push('moved');
    const next = view(transaction.commit().state);
    expect(next.actors.map((actor) => actor.id)).toEqual(['b', 'a']);
    expect(at(next.actors, 1).tags).toEqual(['x', 'y', 'moved']);
  });

  it('lets a handler keep editing an object it created after inserting it', () => {
    const transaction = new DraftTransaction(fixtureState());
    const root = view(transaction.root);
    const created: FixtureActor = { id: 'c', health: { conditions: [] }, tags: [] };
    root.actors.push(created);
    created.tags.push('born');
    created.health.conditions.push({ id: 'c2', treated: true });
    const { state, problem } = transaction.commit();
    expect(problem).toBeNull();
    const committed = at(view(state).actors, 2);
    expect(committed).toEqual({
      id: 'c',
      health: { conditions: [{ id: 'c2', treated: true }] },
      tags: ['born'],
    });
    // 提交的是副本：处理器之后再改自己的对象，改不到已提交的状态。
    expect(committed).not.toBe(created);
    created.tags.push('after-commit');
    expect(committed.tags).toEqual(['born']);
  });

  it('replaces whole branches and resolves drafts placed inside new objects', () => {
    const base = fixtureState();
    const transaction = new DraftTransaction(base);
    const root = view(transaction.root);
    const health = first(root).health;
    at(health.conditions, 0).treated = true;
    root.world = { wrapped: { health }, list: [at(root.actors, 1)] };
    root.relationships = [];
    const { state, problem } = transaction.commit();
    expect(problem).toBeNull();
    const next = view(state);
    expect(next.world['wrapped']).toEqual({
      health: { conditions: [{ id: 'c1', treated: true }] },
    });
    expect(next.world['list']).toEqual([at(view(base).actors, 1)]);
    expect(next.relationships).toEqual([]);
    // 提交结果是普通 JSON：序列化再解析不改变任何内容。
    expect(canonicalJson(JSON.parse(JSON.stringify(next)))).toBe(canonicalJson(next));
  });

  it('flags non-JSON values instead of committing them silently', () => {
    const cases: [string, (root: FixtureState) => void, RegExp][] = [
      [
        'NaN',
        (root) => {
          root.world.counter = Number.NaN;
        },
        /Non-finite number at \$\.world\.counter/,
      ],
      [
        'undefined',
        (root) => {
          root.world['missing'] = undefined;
        },
        /Undefined value at \$\.world\.missing/,
      ],
      [
        'function',
        (root) => {
          root.world['fn'] = () => 1;
        },
        /Non-JSON value at \$\.world\.fn/,
      ],
      [
        'Map',
        (root) => {
          root.world['map'] = new Map();
        },
        /Non-JSON value at \$\.world\.map/,
      ],
      [
        'nested __proto__',
        (root) => {
          root.world['bad'] = JSON.parse('{"__proto__": {"x": 1}}') as unknown;
        },
        /Unsafe key __proto__ at \$\.world\.bad\.__proto__/,
      ],
      [
        'cycle',
        (root) => {
          const loop: Record<string, unknown> = {};
          loop['self'] = loop;
          root.world['loop'] = loop;
        },
        /Circular reference at \$\.world\.loop\.self/,
      ],
    ];
    for (const [name, write, pattern] of cases) {
      const transaction = new DraftTransaction(fixtureState());
      write(view(transaction.root));
      expect(transaction.commit().problem, name).toMatch(pattern);
    }
    const transaction = new DraftTransaction(fixtureState());
    expect(() => {
      view(transaction.root).world['__proto__'] = { polluted: true };
    }).toThrow(/__proto__/);
  });

  it('revokes every draft when the transaction closes', () => {
    const base = fixtureState();
    const transaction = new DraftTransaction(base);
    const root = view(transaction.root);
    const actor = first(root);
    actor.tags.push('kept');
    const { state } = transaction.commit();
    transaction.close();
    expect(() => actor.tags.push('late')).toThrow(TypeError);
    expect(() => root.world).toThrow(TypeError);
    expect(first(view(state)).tags).toEqual(['x', 'y', 'kept']);
    expect(first(view(base)).tags).toEqual(['x', 'y']);
  });

  it('matches the old deep-copy transaction for random edit sequences', () => {
    type Op =
      | { kind: 'set'; actor: number; value: number }
      | { kind: 'push'; actor: number; tag: string }
      | { kind: 'splice'; actor: number; start: number; count: number }
      | { kind: 'treat'; actor: number }
      | { kind: 'add-actor'; id: string }
      | { kind: 'drop-actor'; index: number }
      | { kind: 'world'; value: number }
      | { kind: 'delete-world' };
    const op: fc.Arbitrary<Op> = fc.oneof(
      fc.record({ kind: fc.constant('set' as const), actor: fc.nat(3), value: fc.integer() }),
      fc.record({ kind: fc.constant('push' as const), actor: fc.nat(3), tag: fc.string() }),
      fc.record({
        kind: fc.constant('splice' as const),
        actor: fc.nat(3),
        start: fc.nat(3),
        count: fc.nat(2),
      }),
      fc.record({ kind: fc.constant('treat' as const), actor: fc.nat(3) }),
      fc.record({ kind: fc.constant('add-actor' as const), id: fc.string({ maxLength: 3 }) }),
      fc.record({ kind: fc.constant('drop-actor' as const), index: fc.nat(3) }),
      fc.record({ kind: fc.constant('world' as const), value: fc.integer() }),
      fc.record({ kind: fc.constant('delete-world' as const) }),
    );
    const apply = (state: FixtureState, ops: readonly Op[]) => {
      for (const step of ops) {
        const actor = 'actor' in step ? state.actors[step.actor % state.actors.length] : undefined;
        switch (step.kind) {
          case 'set':
            if (actor) actor.score = step.value;
            break;
          case 'push':
            actor?.tags.push(step.tag);
            break;
          case 'splice':
            actor?.tags.splice(step.start, step.count);
            break;
          case 'treat':
            for (const condition of actor?.health.conditions ?? []) condition.treated = true;
            break;
          case 'add-actor': {
            const created: FixtureActor = { id: step.id, health: { conditions: [] }, tags: [] };
            state.actors.push(created);
            created.tags.push('new');
            break;
          }
          case 'drop-actor':
            if (state.actors.length > 1) state.actors.splice(step.index % state.actors.length, 1);
            break;
          case 'world':
            state.world.counter = step.value;
            break;
          case 'delete-world':
            delete state.world.macro;
            break;
        }
      }
    };
    fc.assert(
      fc.property(fc.array(op, { maxLength: 12 }), (ops) => {
        const base = fixtureState();
        const before = canonicalJson(base);
        // 旧事务：整份深拷贝后就地修改。
        const expected = view(cloneJson(base));
        apply(expected, ops);
        // 新事务：按需复制。
        const transaction = new DraftTransaction(base);
        apply(view(transaction.root), ops);
        const { state, problem } = transaction.commit();
        transaction.close();
        expect(problem).toBeNull();
        // 不只是值相同，键的顺序也相同：快照按插入顺序序列化。
        expect(JSON.stringify(state)).toBe(JSON.stringify(expected));
        expect(canonicalJson(base)).toBe(before);
      }),
      { numRuns: 300 },
    );
  });
});
