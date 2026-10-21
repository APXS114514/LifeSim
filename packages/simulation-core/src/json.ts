/** 纯 JSON 值：模拟状态、事件载荷与快照都限定为它，保证可以序列化和逐字节比较。 */
export type JsonValue =
  string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

/**
 * 深拷贝纯 JSON 数据。遇到非 JSON 值（undefined、函数、Map、非有限数字）直接报错，
 * 这样状态里一旦混入无法存档的东西，会在出错的那个事件上被发现。
 * 自有键 `__proto__` 也报错：普通赋值会把它当成原型而不是数据，拷贝会悄悄丢值（与存档信封拒绝危险键一致）。
 *
 * 每个事件都会拷贝整个状态，所以正常路径不拼接路径字符串；
 * 只有出错时才重新遍历一次，报出出错值的确切路径（M3-035）。
 */
export function cloneJson<T>(value: T): T {
  const copy = cloneValue(value);
  if (copy === NOT_JSON) throw describeNonJson(value, '$');
  return copy as T;
}

const NOT_JSON = Symbol('not-json');

function cloneValue(value: unknown): unknown {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : NOT_JSON;
  if (Array.isArray(value)) {
    const copy: unknown[] = new Array(value.length);
    for (let index = 0; index < value.length; index++) {
      const item = cloneValue(value[index]);
      if (item === NOT_JSON) return NOT_JSON;
      copy[index] = item;
    }
    return copy;
  }
  if (typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    const copy: Record<string, unknown> = {};
    for (const key of Object.keys(value)) {
      if (key === '__proto__') return NOT_JSON;
      const item = (value as Record<string, unknown>)[key];
      if (item === undefined) return NOT_JSON;
      const cloned = cloneValue(item);
      if (cloned === NOT_JSON) return NOT_JSON;
      copy[key] = cloned;
    }
    return copy;
  }
  return NOT_JSON;
}

/** 慢路径：找到第一个非 JSON 值并给出它的路径。 */
function describeNonJson(value: unknown, path: string): TypeError {
  if (typeof value === 'number') return new TypeError(`Non-finite number at ${path}`);
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index++) {
      const item: unknown = value[index];
      if (cloneValue(item) === NOT_JSON) return describeNonJson(item, `${path}[${index}]`);
    }
  } else if (typeof value === 'object' && value !== null) {
    if (Object.getPrototypeOf(value) === Object.prototype) {
      for (const [key, item] of Object.entries(value)) {
        if (key === '__proto__') return new TypeError(`Unsafe key __proto__ at ${path}`);
        if (item === undefined) return new TypeError(`Undefined value at ${path}.${key}`);
        if (cloneValue(item) === NOT_JSON) return describeNonJson(item, `${path}.${key}`);
      }
    }
  }
  return new TypeError(`Non-JSON value at ${path}`);
}

/**
 * 两个纯 JSON 值是否结构相同（对象键的顺序不计）。
 * 内核用它跳过事件没有改动的角色与账户，不必再做一遍 schema 校验（M3-035）。
 */
export function jsonEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false;
    for (let index = 0; index < a.length; index++) {
      if (!jsonEqual(a[index], b[index])) return false;
    }
    return true;
  }
  if (Array.isArray(b)) return false;
  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) return false;
  for (const key of keys) {
    if (!Object.hasOwn(b, key)) return false;
    if (!jsonEqual((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key])) {
      return false;
    }
  }
  return true;
}

/** 键按字典序排列的 JSON 文本：同样的数据永远得到同样的字节，用于指纹与逐字节比较。 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value !== null && typeof value === 'object') {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) {
      sorted[key] = sortKeys((value as Record<string, unknown>)[key]);
    }
    return sorted;
  }
  return value;
}
