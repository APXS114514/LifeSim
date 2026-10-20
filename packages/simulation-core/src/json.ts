/** 纯 JSON 值：模拟状态、事件载荷与快照都限定为它，保证可以序列化和逐字节比较。 */
export type JsonValue =
  string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

/**
 * 深拷贝纯 JSON 数据。遇到非 JSON 值（undefined、函数、Map、非有限数字）直接报错，
 * 这样状态里一旦混入无法存档的东西，会在出错的那个事件上被发现。
 */
export function cloneJson<T>(value: T): T {
  return cloneValue(value, '$') as T;
}

function cloneValue(value: unknown, path: string): unknown {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError(`Non-finite number at ${path}`);
    return value;
  }
  if (Array.isArray(value))
    return value.map((item, index) => cloneValue(item, `${path}[${index}]`));
  if (typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    const copy: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      if (item === undefined) throw new TypeError(`Undefined value at ${path}.${key}`);
      copy[key] = cloneValue(item, `${path}.${key}`);
    }
    return copy;
  }
  throw new TypeError(`Non-JSON value at ${path}`);
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
