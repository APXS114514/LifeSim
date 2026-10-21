import { describe, expect, it } from 'vitest';
import { canonicalJson, cloneJson } from './json.ts';

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
});

describe('canonicalJson', () => {
  it('sorts object keys recursively so equal data gives equal bytes', () => {
    expect(canonicalJson({ b: 1, a: { d: 2, c: [3, { f: 4, e: 5 }] } })).toBe(
      '{"a":{"c":[3,{"e":5,"f":4}],"d":2},"b":1}',
    );
  });
});
