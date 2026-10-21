import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { canonicalJson, cloneJson, jsonEqual } from './json.ts';

describe('cloneJson', () => {
  it('deep-copies plain JSON data', () => {
    const original = { a: [1, { b: 'x' }], c: null, d: true };
    const copy = cloneJson(original);
    expect(copy).toEqual(original);
    expect(copy).not.toBe(original);
    expect(copy.a[1]).not.toBe(original.a[1]);
  });

  it.each([
    ['undefined', { a: undefined }],
    ['NaN', { a: Number.NaN }],
    ['Infinity', [Infinity]],
    ['Map', { a: new Map() }],
    ['Date', { a: new Date(0) }],
    ['function', { a: () => 1 }],
  ])('rejects %s so non-saveable state fails on the event that created it', (_name, value) => {
    expect(() => cloneJson(value)).toThrow(TypeError);
  });

  it.each([
    ['undefined', { a: [1, { b: undefined }] }, 'Undefined value at $.a[1].b'],
    ['NaN', { a: [{ b: [0, Number.NaN] }] }, 'Non-finite number at $.a[0].b[1]'],
    ['Map', { x: { y: new Map() } }, 'Non-JSON value at $.x.y'],
  ])('names the exact path of a nested %s', (_name, value, message) => {
    expect(() => cloneJson(value)).toThrow(new TypeError(message));
  });

  it('rejects an own __proto__ key instead of silently dropping it', () => {
    const value: unknown = JSON.parse('{"a":{"__proto__":1,"b":2}}');
    expect(() => cloneJson(value)).toThrow(new TypeError('Unsafe key __proto__ at $.a'));
  });
});

describe('jsonEqual', () => {
  it('compares JSON data structurally, ignoring key order', () => {
    expect(jsonEqual({ a: [1, { b: 'x' }], c: null }, { c: null, a: [1, { b: 'x' }] })).toBe(true);
    expect(jsonEqual([], [])).toBe(true);
    expect(jsonEqual({}, {})).toBe(true);
  });

  it.each([
    ['different leaf', { a: 1 }, { a: 2 }],
    ['number vs string', { a: 1 }, { a: '1' }],
    ['null vs object', { a: null }, { a: {} }],
    ['array vs object', { a: [] }, { a: {} }],
    ['extra key', { a: 1 }, { a: 1, b: 2 }],
    ['same key count, other key', { a: 1, b: 2 }, { a: 1, c: 2 }],
    ['array length', [1, 2], [1, 2, 3]],
    ['nested change', { a: { b: [{ c: true }] } }, { a: { b: [{ c: false }] } }],
  ])('reports a difference: %s', (_name, a, b) => {
    expect(jsonEqual(a, b)).toBe(false);
    expect(jsonEqual(b, a)).toBe(false);
  });

  it('agrees with canonical JSON on arbitrary JSON values', () => {
    fc.assert(
      fc.property(fc.jsonValue(), fc.jsonValue(), (a, b) => {
        // 状态里不会有 `__proto__` 键（cloneJson 拒绝它，见上）；canonicalJson 也无法表示它。
        fc.pre(!JSON.stringify([a, b]).includes('"__proto__"'));
        expect(jsonEqual(a, cloneJson(a))).toBe(true);
        expect(jsonEqual(a, b)).toBe(canonicalJson(a) === canonicalJson(b));
      }),
      { numRuns: 300 },
    );
  });
});

describe('canonicalJson', () => {
  it('sorts object keys recursively so equal data gives equal bytes', () => {
    expect(canonicalJson({ b: 1, a: { d: 2, c: [3, { f: 4, e: 5 }] } })).toBe(
      '{"a":{"c":[3,{"e":5,"f":4}],"d":2},"b":1}',
    );
  });
});
