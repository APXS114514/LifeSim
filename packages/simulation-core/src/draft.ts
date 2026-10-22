import type { SimState } from './types.ts';

/**
 * 事务草稿的按需复制（ADR-0011）。内核私有，不从包入口导出。
 *
 * 以前每个事件先深拷贝整份状态，再逐个角色、账户做结构比较来跳过没改的对象。
 * 现在处理器拿到的是一棵代理：读的时候共享已提交的状态，**第一次写某个对象时**才浅复制它，
 * 并把这次修改沿父节点向上标记。提交时只为改过的分支生成新的普通 JSON 对象，
 * 没改过的分支直接沿用已提交对象的引用——于是「没改过」可以按引用判断，不必再做整树比较。
 *
 * 不变的约定（ADR-0004、ADR-0011）：
 * - 已提交的状态永远不被就地修改：所有写入都落在副本上；事务失败时丢弃副本即可回滚。
 * - 提交后的状态是普通 JSON：不含代理，也不含处理器还握着的可变对象（处理器新建的对象在提交时被复制）。
 * - 事务关闭后撤销全部代理：处理器留下的草稿引用再读写都会报错，改不到已提交的状态。
 * - 处理器在本事件里新建并放进状态的对象，之后仍可以通过本地引用继续修改（出生初始化依赖这一点）。
 * - 非 JSON 值（非有限数、undefined、函数、非普通对象、`__proto__` 键、循环引用）不在写入时报错，
 *   而是在提交时记下第一处问题：内核先跑原有的 schema 与不变量检查（保持原来的错误码），再拒绝它。
 */

interface DraftNode {
  /** 已提交的对象或数组；永不修改。 */
  readonly base: object;
  /** 第一次写入或第一次取子对象时才建立的浅副本。 */
  copy: Record<string, unknown> | unknown[] | null;
  /** 本节点或其子孙被写过。 */
  modified: boolean;
  readonly parent: DraftNode | null;
  /** 被处理器赋值过的键：这些键上的对象可能是处理器自己新建的，提交时要复制。 */
  assigned: Set<string> | null;
}

export interface DraftCommit {
  /** 提交候选：改过的分支是新对象，没改过的分支沿用已提交对象。 */
  readonly state: SimState;
  /** 第一处非 JSON 值的描述；没有则为 null。 */
  readonly problem: string | null;
}

function isObject(value: unknown): value is object {
  return value !== null && typeof value === 'object';
}

export class DraftTransaction {
  readonly #nodes = new WeakMap<object, DraftNode>();
  /** 处理器拿到的状态草稿。 */
  readonly root: SimState;
  #problem: string | null = null;
  #closed = false;

  constructor(base: SimState) {
    this.root = this.#draftOf(base, null) as SimState;
  }

  /** 生成提交候选。可以在关闭前调用多次，结果相同。 */
  commit(): DraftCommit {
    this.#problem = null;
    const root = this.#nodes.get(this.root);
    if (!root) throw new Error('Draft root is missing');
    // 多数事件不改状态：此时连路径数组与去重表都不用分配，直接沿用已提交状态。
    if (!root.modified) return { state: root.base as SimState, problem: null };
    const state = this.#finalizeDraft(root, ['$'], new Map(), new Set()) as SimState;
    return { state, problem: this.#problem };
  }

  /**
   * 关闭草稿：代理陷阱从此一律抛 TypeError。处理器留下的草稿引用因此改不到任何东西。
   *
   * 这里用一个关闭标志，而不是 Proxy.revocable 的 revoke：撤销代理要为每个草稿节点记一个回收函数
   * （一局人生约 6,000 个节点），关闭时再逐个调用；关闭标志只在陷阱入口多一次私有字段读取。
   */
  close(): void {
    this.#closed = true;
  }

  // ---------------------------------------------------------------------------

  #draftOf(base: object, parent: DraftNode | null): object {
    const node: DraftNode = { base, copy: null, modified: false, parent, assigned: null };
    const proxy = new Proxy(base, this.#handler(node));
    this.#nodes.set(proxy, node);
    return proxy;
  }

  /**
   * 草稿背后仍是已提交对象时返回它，否则返回 null。没被写过的分支与已提交状态是同一批对象，
   * 调用方可以在这上面按值定位（例如按 id 找下标），再只通过代理取回真正要改的那一个。
   */
  committedBaseOf(value: object): object | null {
    const node = this.#nodes.get(value);
    return node !== undefined && !node.modified ? node.base : null;
  }

  #prepare(node: DraftNode): Record<string, unknown> {
    if (!node.copy) {
      node.copy = Array.isArray(node.base)
        ? (node.base as unknown[]).slice()
        : { ...(node.base as Record<string, unknown>) };
    }
    return node.copy as Record<string, unknown>;
  }

  #touch(node: DraftNode): void {
    for (let current: DraftNode | null = node; current && !current.modified;) {
      current.modified = true;
      current = current.parent;
    }
  }

  /** 读一个自有键：已提交的子对象第一次被读到时变成子草稿，并存进副本，数组移动时跟着走。 */
  #read(node: DraftNode, key: string): unknown {
    const source = (node.copy ?? node.base) as Record<string, unknown>;
    const value = source[key];
    if (!isObject(value) || this.#nodes.has(value) || node.assigned?.has(key)) return value;
    const child = this.#draftOf(value, node);
    this.#prepare(node)[key] = child;
    return child;
  }

  #write(node: DraftNode, key: string, value: unknown): void {
    const source = (node.copy ?? node.base) as Record<string, unknown>;
    if (Object.hasOwn(source, key) && Object.is(source[key], value)) return;
    if (key === '__proto__') throw new TypeError('Unsafe key __proto__ in simulation state');
    this.#prepare(node)[key] = value;
    (node.assigned ??= new Set()).add(key);
    this.#touch(node);
  }

  #handler(node: DraftNode): ProxyHandler<object> {
    return {
      get: (_target, key, receiver) => {
        if (this.#closed) throw new TypeError('Simulation draft is closed');
        const source = node.copy ?? node.base;
        if (typeof key === 'symbol' || !Object.hasOwn(source, key)) {
          return Reflect.get(source, key, receiver) as unknown;
        }
        return this.#read(node, key);
      },
      set: (_target, key, value) => {
        if (this.#closed) throw new TypeError('Simulation draft is closed');
        if (typeof key === 'symbol') throw new TypeError('Symbol keys are not allowed in state');
        this.#write(node, key, value);
        return true;
      },
      deleteProperty: (_target, key) => {
        if (this.#closed) throw new TypeError('Simulation draft is closed');
        if (typeof key === 'symbol') throw new TypeError('Symbol keys are not allowed in state');
        const source = node.copy ?? node.base;
        if (!Object.hasOwn(source, key)) return true;
        delete this.#prepare(node)[key];
        node.assigned?.delete(key);
        this.#touch(node);
        return true;
      },
      defineProperty: (_target, key, descriptor) => {
        if (this.#closed) throw new TypeError('Simulation draft is closed');
        if (typeof key === 'symbol' || !('value' in descriptor)) {
          throw new TypeError('Only plain data properties are allowed in state');
        }
        this.#write(node, key, descriptor.value);
        return true;
      },
      has: (_target, key) => {
        if (this.#closed) throw new TypeError('Simulation draft is closed');
        return key in (node.copy ?? node.base);
      },
      ownKeys: () => {
        if (this.#closed) throw new TypeError('Simulation draft is closed');
        return Reflect.ownKeys(node.copy ?? node.base);
      },
      getOwnPropertyDescriptor: (_target, key) => {
        if (this.#closed) throw new TypeError('Simulation draft is closed');
        const descriptor = Reflect.getOwnPropertyDescriptor(node.copy ?? node.base, key);
        if (descriptor && typeof key === 'string' && isObject(descriptor.value)) {
          descriptor.value = this.#read(node, key);
        }
        return descriptor;
      },
      setPrototypeOf: () => {
        throw new TypeError('Prototypes of simulation state cannot change');
      },
      preventExtensions: () => {
        throw new TypeError('Simulation state cannot be frozen or sealed');
      },
    };
  }

  // ---------------------------------------------------------------------------
  // 提交：只为改过的分支生成新对象。

  #flag(message: string, path: readonly string[]): void {
    this.#problem ??= `${message} at ${path.join('')}`;
  }

  #finalizeDraft(
    node: DraftNode,
    path: string[],
    memo: Map<object, unknown>,
    active: Set<object>,
  ): unknown {
    if (!node.modified) return node.base;
    const done = memo.get(node);
    if (done !== undefined) return done;
    const copy = node.copy;
    if (!copy) return node.base;
    if (Array.isArray(copy)) {
      const result: unknown[] = new Array(copy.length);
      memo.set(node, result);
      for (let index = 0; index < copy.length; index++) {
        path.push(`[${index}]`);
        const assigned = node.assigned?.has(String(index)) ?? false;
        result[index] = this.#finalizeValue(copy[index], assigned, path, memo, active);
        path.pop();
      }
      return result;
    }
    const result: Record<string, unknown> = {};
    memo.set(node, result);
    for (const key of Object.keys(copy)) {
      path.push(`.${key}`);
      const assigned = node.assigned?.has(key) ?? false;
      result[key] = this.#finalizeValue(copy[key], assigned, path, memo, active);
      path.pop();
    }
    return result;
  }

  #finalizeValue(
    value: unknown,
    assigned: boolean,
    path: string[],
    memo: Map<object, unknown>,
    active: Set<object>,
  ): unknown {
    if (value === null) return null;
    switch (typeof value) {
      case 'string':
      case 'boolean':
        return value;
      case 'number':
        if (!Number.isFinite(value)) this.#flag('Non-finite number', path);
        return value;
      case 'object':
        break;
      default:
        this.#flag(value === undefined ? 'Undefined value' : 'Non-JSON value', path);
        return value;
    }
    const node = this.#nodes.get(value);
    if (node) return this.#finalizeDraft(node, path, memo, active);
    // 没被处理器赋值过的位置上只可能是已提交的对象（没读过所以没变成草稿）：原样共享。
    if (!assigned) return value;
    return this.#finalizeForeign(value, path, memo, active);
  }

  /** 处理器自己放进状态的对象：深复制成普通 JSON，里面引用的草稿换成它的提交结果。 */
  #finalizeForeign(
    value: object,
    path: string[],
    memo: Map<object, unknown>,
    active: Set<object>,
  ): unknown {
    const done = memo.get(value);
    if (done !== undefined) return done;
    if (active.has(value)) {
      this.#flag('Circular reference', path);
      return null;
    }
    if (Array.isArray(value)) {
      const result: unknown[] = new Array(value.length);
      active.add(value);
      for (let index = 0; index < value.length; index++) {
        path.push(`[${index}]`);
        result[index] = this.#finalizeValue(value[index], true, path, memo, active);
        path.pop();
      }
      active.delete(value);
      memo.set(value, result);
      return result;
    }
    if (Object.getPrototypeOf(value) !== Object.prototype) {
      this.#flag('Non-JSON value', path);
      return value;
    }
    const result: Record<string, unknown> = {};
    active.add(value);
    for (const key of Object.keys(value)) {
      path.push(`.${key}`);
      if (key === '__proto__') {
        this.#flag('Unsafe key __proto__', path);
      } else {
        result[key] = this.#finalizeValue(
          (value as Record<string, unknown>)[key],
          true,
          path,
          memo,
          active,
        );
      }
      path.pop();
    }
    active.delete(value);
    memo.set(value, result);
    return result;
  }
}
