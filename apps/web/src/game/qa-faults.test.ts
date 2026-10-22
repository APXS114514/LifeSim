import { afterEach, describe, expect, it } from 'vitest';
import { QA_FAULT_KEY, takeQaFault } from './qa-faults.ts';

/** 测试夹具：直接写/清 globalThis 上的诊断键；产品代码只读取一次。 */
function inject(value: unknown): void {
  (globalThis as Record<string, unknown>)[QA_FAULT_KEY] = value;
}

afterEach(() => {
  delete (globalThis as Record<string, unknown>)[QA_FAULT_KEY];
});

describe('QA fault injection', () => {
  it('does nothing when no fault is injected', () => {
    expect(takeQaFault()).toBeNull();
  });

  it('consumes a calculation fault exactly once', () => {
    inject({ kind: 'cohort-calculation' });
    expect(takeQaFault()).toEqual({ kind: 'cohort-calculation' });
    expect(takeQaFault()).toBeNull();
  });

  it('accepts a non-negative integer age for the survival gap', () => {
    inject({ kind: 'survival-gap', fromAge: 40 });
    expect(takeQaFault()).toEqual({ kind: 'survival-gap', fromAge: 40 });
  });

  it('ignores unknown shapes and invalid ages instead of throwing', () => {
    for (const value of [
      null,
      'cohort-render',
      { kind: 'unknown' },
      { kind: 'survival-gap', fromAge: -1 },
      { kind: 'survival-gap', fromAge: 1.5 },
      { kind: 'survival-gap', fromAge: '40' },
    ]) {
      inject(value);
      expect(takeQaFault()).toBeNull();
    }
  });
});
